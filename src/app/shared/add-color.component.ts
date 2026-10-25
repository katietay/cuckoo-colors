import { Component, EventEmitter, Input, Output } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Color, ColorService, ServerConfig, describeHttpError } from '../services/colors.service';
import {
  NAME_MAX,
  VISITOR_NAME_MAX,
  VISITOR_NAME_MIN,
  VISITOR_WORDS_MAX,
  isValidHex,
  isValidName,
  isValidVisitorName,
  normalizeHex,
  normalizeName,
} from './color-utils';

const HEX_HELP =
  'This is not a valid hex value. Ensure your value matches the form #rrggbb (or #rgb) and contains only the digits 0-F.';
const NAME_HELP = `Names must be 1 to ${NAME_MAX} characters: letters, numbers, spaces, hyphens or apostrophes.`;
const VISITOR_NAME_HELP = `Names must be ${VISITOR_NAME_MIN} to ${VISITOR_NAME_MAX} letters (A to Z), up to ${VISITOR_WORDS_MAX} words, with no numbers or symbols.`;

/**
 * The "add a color" form, shared by the Color Management and Color Coordinate pages.
 * Visitors (no admin key) are held to stricter rules than the admin.
 */
@Component({
  selector: 'app-add-color',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (canAdd) {
      <form class="add-color ignoreOnPrint" (ngSubmit)="onAddColor()" #addForm="ngForm">
        <h2 class="add-color-heading">{{ heading }}</h2>
        @if (visitorMode && rulesText) {
          <p class="add-color-rules">{{ rulesText }}</p>
        }

        @if (visitorFull) {
          <p class="add-color-full" role="status">
            The shared color list is full right now. Colors added by visitors are removed automatically, so you can try
            again later.
            @if (contactLink) {
              Want your color added now?
              <a class="add-color-email" [href]="contactLink">Email me</a>
            }
          </p>
        } @else {
          <div class="add-color-fields">
            <label for="add-name">Color name</label>
            <input
              id="add-name"
              name="name"
              [(ngModel)]="newColor.name"
              placeholder="Color name"
              required
              [attr.maxlength]="visitorMode ? 24 : 40"
              autocomplete="off"
            />
            <label for="add-hex">Hex value</label>
            <input
              id="add-hex"
              name="hex"
              [(ngModel)]="newColor.hex"
              placeholder="e.g. #ABCDEF"
              required
              maxlength="7"
              autocomplete="off"
            />
            <label for="add-picker">Or pick a color</label>
            <input id="add-picker" name="picker" type="color" [value]="pickerValue" (input)="onPick($any($event.target).value)" />
            <button type="submit">Add Color</button>
          </div>
        }

        @if (addError) {
          <div class="error" role="alert">{{ addError }}</div>
        }
        @if (addedName) {
          <div class="add-color-success" role="status">Added {{ addedName }}.</div>
        }
      </form>
    }
  `,
  styles: [
    `
      .add-color { margin: 1rem 0; }
      .add-color-heading { margin-bottom: 0.25rem; }
      .add-color-rules, .add-color-full { max-width: 60ch; margin: 0.25rem auto 0.75rem; }
      .add-color-fields { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
      .add-color-fields label { font-weight: bold; }
      .add-color-fields input { font-family: 'Poppins', sans-serif; font-size: 1rem; padding: 0.4rem 0.6rem; }
      .add-color-fields input[type='color'] { padding: 0; width: 3rem; height: 2.2rem; }
      .error { color: #8a1c1c; display: block; margin-top: 5px; }
      .add-color-success { margin-top: 5px; }
    `,
  ],
})
export class AddColorComponent {
  @Input() colors: Color[] = [];
  @Input() config: ServerConfig = { editingEnabled: false, minColors: 2, maxColors: 75 };
  @Output() added = new EventEmitter<Color>();

  newColor = { name: '', hex: '' };
  addError = '';
  addedName = '';
  /** Set when the server says the visitor list is full, even if the page did not know. */
  serverFull = false;

  constructor(private colorService: ColorService) {}

  get canAdd(): boolean {
    return this.config.editingEnabled || this.config.publicAdding === true;
  }

  /** Visitors can add colors, and no admin key has been entered. */
  get visitorMode(): boolean {
    return this.config.publicAdding === true && !this.colorService.hasAdminKey();
  }

  get heading(): string {
    return this.visitorMode ? 'Suggest a color' : 'Add Color';
  }

  get visitorColorCount(): number {
    return this.colors.filter((c) => c.source === 'visitor').length;
  }

  get visitorFull(): boolean {
    if (!this.visitorMode) return false;
    const max = this.config.visitorLimits?.maxColors ?? Infinity;
    return this.serverFull || this.visitorColorCount >= max || this.colors.length >= this.config.maxColors;
  }

  get contactLink(): string {
    const email = this.config.contactEmail ?? '';
    return email ? `mailto:${email}?subject=${encodeURIComponent('Cuckoo Colors: color suggestion')}` : '';
  }

  get rulesText(): string {
    const l = this.config.visitorLimits;
    if (!l) return '';
    const days = l.expireSeconds / 86400;
    const keep = days >= 1 ? `${Math.round(days)} ${Math.round(days) === 1 ? 'day' : 'days'}` : 'a few hours';
    return `Anyone can add a color. You can add up to ${l.perDay} ${l.perDay === 1 ? 'color' : 'colors'} per day. Colors added by visitors stay for about ${keep}, then are removed automatically.`;
  }

  get pickerValue(): string {
    return isValidHex(this.newColor.hex) ? this.expandHex(this.newColor.hex) : '#808080';
  }

  private expandHex(hex: string): string {
    return normalizeHex(hex);
  }

  onPick(value: string): void {
    this.newColor.hex = value;
  }

  isDuplicate(name: string, hex: string): boolean {
    const wantedName = normalizeName(name).toLowerCase();
    const wantedHex = normalizeHex(hex);
    return this.colors.some(
      (c) => c.name.toLowerCase() === wantedName || (wantedHex !== '' && normalizeHex(c.hex) === wantedHex),
    );
  }

  onAddColor(): void {
    this.addError = '';
    this.addedName = '';
    const name = normalizeName(this.newColor.name);
    const hex = normalizeHex(this.newColor.hex);
    const visitor = this.visitorMode;

    if (visitor ? !isValidVisitorName(name) : !isValidName(name)) {
      this.addError = visitor ? VISITOR_NAME_HELP : NAME_HELP;
      return;
    }
    if (!isValidHex(this.newColor.hex)) {
      this.addError = HEX_HELP;
      return;
    }
    if (this.isDuplicate(name, hex)) {
      this.addError = 'Color name or hex value already exists.';
      return;
    }
    if (this.colors.length >= this.config.maxColors) {
      this.addError = `The color list is limited to ${this.config.maxColors} colors.`;
      return;
    }
    if (this.visitorFull) {
      this.addError = 'The visitor color list is full right now.';
      return;
    }

    this.colorService.addColor({ name, hex }).subscribe({
      next: (color) => {
        this.newColor = { name: '', hex: '' };
        this.addedName = color.name;
        this.added.emit(color);
      },
      error: (err) => {
        this.addError = describeHttpError(err, 'Failed to add color.');
        if (visitor && err instanceof HttpErrorResponse && err.status === 409 && /full/i.test(this.addError)) {
          this.serverFull = true;
        }
      },
    });
  }
}
