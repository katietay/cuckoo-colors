import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Color, ColorService, ServerConfig, describeHttpError } from '../services/colors.service';
import { AddColorComponent } from '../shared/add-color.component';
import { isValidHex, isValidName, normalizeHex, normalizeName, NAME_MAX } from '../shared/color-utils';

const HEX_HELP =
  'This is not a valid hex value. Ensure your value matches the form #rrggbb (or #rgb) and contains only the digits 0-F.';
const NAME_HELP = `Names must be 1 to ${NAME_MAX} characters: letters, numbers, spaces, hyphens or apostrophes.`;

@Component({
  selector: 'app-color-management',
  standalone: true,
  imports: [FormsModule, RouterLink, AddColorComponent],
  templateUrl: './color-management.component.html',
  styleUrls: ['./color-management.component.css'],
})
export class ColorManagementComponent implements OnInit {
  colors: Color[] = [];
  config: ServerConfig = { editingEnabled: false, minColors: 2, maxColors: 75 };
  loadError = '';

  adminKey = '';
  editColor: Color | null = null;
  deleteCandidate: Color | null = null;

  editError = '';
  deleteError = '';

  constructor(private colorService: ColorService) {}

  ngOnInit(): void {
    this.colorService.getConfig().subscribe({
      next: (config) => (this.config = config),
      error: () => (this.config = { ...this.config, editingEnabled: false }),
    });
    this.loadColors();
  }

  loadColors(): void {
    this.loadError = '';
    this.colorService.getColors().subscribe({
      next: (colors) => (this.colors = colors),
      error: (err) => (this.loadError = describeHttpError(err, 'Could not load the color list.')),
    });
  }

  /** Edit and delete need an admin key, so the buttons only appear once one is typed. */
  get isAdmin(): boolean {
    return this.config.editingEnabled && this.adminKey.trim() !== '';
  }

  /** "about 2 days" style text for how long a visitor color will stay. */
  expiryText(color: Color, now = Date.now()): string {
    if (color.source !== 'visitor' || !color.expiresAt) return '';
    const seconds = color.expiresAt - Math.floor(now / 1000);
    if (seconds <= 0) return 'removed soon';
    const hours = Math.ceil(seconds / 3600);
    if (hours <= 1) return 'removed within the hour';
    if (hours < 48) return `removed in about ${hours} hours`;
    return `removed in about ${Math.round(hours / 24)} days`;
  }

  onAdminKeyChange(key: string): void {
    this.adminKey = key;
    this.colorService.setAdminKey(key);
  }

  onColorAdded(color: Color): void {
    this.colors = [...this.colors, color];
  }

  startEdit(color: Color): void {
    this.editColor = { ...color };
    this.editError = '';
  }

  cancelEdit(): void {
    this.editColor = null;
  }

  onEditColor(): void {
    const draft = this.editColor;
    if (!draft) return;

    this.editError = '';
    const color: Color = { id: draft.id, name: normalizeName(draft.name), hex: normalizeHex(draft.hex) };

    if (!isValidName(color.name)) {
      this.editError = NAME_HELP;
      return;
    }
    if (!isValidHex(draft.hex)) {
      this.editError = HEX_HELP;
      return;
    }
    if (this.isDuplicate(color.name, color.hex, color.id)) {
      this.editError = 'Inputted value already exists.';
      return;
    }

    this.colorService.updateColor(color).subscribe({
      next: (saved) => {
        this.colors = this.colors.map((c) => (c.id === saved.id ? saved : c));
        this.editColor = null;
      },
      error: (err) => (this.editError = describeHttpError(err, 'Failed to update color.')),
    });
  }

  confirmDelete(color: Color): void {
    this.deleteCandidate = color;
    this.deleteError = '';
  }

  cancelDelete(): void {
    this.deleteCandidate = null;
    this.deleteError = '';
  }

  onDeleteColor(): void {
    const target = this.deleteCandidate;
    if (!target) return;
    if (this.colors.length <= this.config.minColors) {
      this.deleteError = `You must keep at least ${this.config.minColors} colors.`;
      return;
    }

    this.colorService.deleteColor(target.id).subscribe({
      next: () => {
        this.colors = this.colors.filter((c) => c.id !== target.id);
        this.deleteCandidate = null;
      },
      error: (err) => (this.deleteError = describeHttpError(err, 'Failed to delete color.')),
    });
  }

  isDuplicate(name: string, hex: string, ignoreId = -1): boolean {
    const wantedName = normalizeName(name).toLowerCase();
    const wantedHex = normalizeHex(hex);
    return this.colors.some(
      (c) =>
        c.id !== ignoreId &&
        (c.name.toLowerCase() === wantedName || (wantedHex !== '' && normalizeHex(c.hex) === wantedHex)),
    );
  }

  isHexValue(hex: string): boolean {
    return isValidHex(hex);
  }
}
