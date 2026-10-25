import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AddColorComponent } from './add-color.component';
import { Color, ColorService, ServerConfig } from '../services/colors.service';

const COLORS: Color[] = [
  { id: 1, name: 'red', hex: '#ff0000' },
  { id: 2, name: 'blue', hex: '#0000ff' },
];

const ADMIN: ServerConfig = { editingEnabled: true, minColors: 2, maxColors: 75 };
const PUBLIC: ServerConfig = {
  editingEnabled: true,
  minColors: 2,
  maxColors: 75,
  publicAdding: true,
  contactEmail: 'me@example.com',
  visitorLimits: { maxColors: 10, perDay: 3, expireSeconds: 259200, nameMin: 3, nameMax: 24 },
};

describe('AddColorComponent', () => {
  let fixture: ComponentFixture<AddColorComponent>;
  let component: AddColorComponent;
  let http: HttpTestingController;

  function setup(config: ServerConfig, colors: Color[] = COLORS): void {
    component.config = config;
    component.colors = colors;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddColorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AddColorComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders nothing when adding is not allowed', () => {
    setup({ editingEnabled: false, minColors: 2, maxColors: 75 });
    expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
  });

  it('shows the form, rules and a color picker to visitors', () => {
    setup(PUBLIC);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#add-name')).not.toBeNull();
    expect(el.querySelector('input[type=color]')).not.toBeNull();
    expect(el.textContent).toContain('up to 3 colors per day');
  });

  it('isDuplicate matches names case-insensitively and hex across short and long forms', () => {
    setup(ADMIN);
    expect(component.isDuplicate('RED', '#123456')).toBeTrue();
    expect(component.isDuplicate('new', '#F00')).toBeTrue();
    expect(component.isDuplicate('new', '#123456')).toBeFalse();
  });

  it('picking a color fills the hex field', () => {
    setup(ADMIN);
    component.onPick('#112233');
    expect(component.newColor.hex).toBe('#112233');
    expect(component.pickerValue).toBe('#112233');
  });

  describe('as the admin', () => {
    beforeEach(() => {
      TestBed.inject(ColorService).setAdminKey('my-admin-key');
      setup(PUBLIC);
    });

    it('blocks invalid hex and bad names without calling the server', () => {
      component.newColor = { name: 'pink', hex: 'pink' };
      component.onAddColor();
      expect(component.addError).toContain('not a valid hex');
      component.newColor = { name: '<script>', hex: '#ffc0cb' };
      component.onAddColor();
      expect(component.addError).toContain('Names must be');
    });

    it('blocks duplicates', () => {
      component.newColor = { name: 'Red', hex: '#123456' };
      component.onAddColor();
      expect(component.addError).toBe('Color name or hex value already exists.');
    });

    it('posts a normalized color with the admin key and emits the result', () => {
      let emitted: Color | undefined;
      component.added.subscribe((c: Color) => (emitted = c));
      component.newColor = { name: '  Hot   Pink ', hex: '#F0A' };
      component.onAddColor();
      const req = http.expectOne('api/colors');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Hot Pink', hex: '#ff00aa' });
      expect(req.request.headers.get('X-Admin-Key')).toBe('my-admin-key');
      req.flush({ id: 4, name: 'Hot Pink', hex: '#ff00aa' });
      expect(emitted as Color | undefined).toEqual({ id: 4, name: 'Hot Pink', hex: '#ff00aa' });
      expect(component.newColor).toEqual({ name: '', hex: '' });
    });

    it('explains a wrong admin key', () => {
      component.newColor = { name: 'pink', hex: '#ffc0cb' };
      component.onAddColor();
      http.expectOne('api/colors').flush({ error: 'x' }, { status: 401, statusText: 'Unauthorized' });
      expect(component.addError).toContain('admin key');
    });
  });

  describe('as a visitor', () => {
    beforeEach(() => setup(PUBLIC));

    it('applies the stricter name rules', () => {
      component.newColor = { name: 'Sky 2', hex: '#87ceeb' };
      component.onAddColor();
      expect(component.addError).toContain('letters (A to Z)');
    });

    it('posts without an admin key header', () => {
      component.newColor = { name: 'Sky Blue', hex: '#87ceeb' };
      component.onAddColor();
      const req = http.expectOne('api/colors');
      expect(req.request.headers.has('X-Admin-Key')).toBeFalse();
      req.flush({ id: 5, name: 'Sky Blue', hex: '#87ceeb', source: 'visitor', expiresAt: 1 });
      expect(component.addedName).toBe('Sky Blue');
    });

    it('shows the server message, such as the daily limit', () => {
      component.newColor = { name: 'Sky Blue', hex: '#87ceeb' };
      component.onAddColor();
      http
        .expectOne('api/colors')
        .flush({ error: 'You can add up to 3 colors per day. Please try again tomorrow.' }, { status: 429, statusText: 'Too Many' });
      expect(component.addError).toContain('per day');
    });

    it('swaps the form for an email button when the visitor list is full', () => {
      const full: Color[] = Array.from({ length: 10 }, (_, i) => ({
        id: i + 10,
        name: `visitor${i}`,
        hex: '#000000',
        source: 'visitor' as const,
      }));
      component.colors = [...COLORS, ...full];
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('#add-name')).toBeNull();
      const link = el.querySelector<HTMLAnchorElement>('a.add-color-email')!;
      expect(link.getAttribute('href')).toContain('mailto:me@example.com');
    });

    it('switches to the full message when the server reports a full list', () => {
      component.newColor = { name: 'Sky Blue', hex: '#87ceeb' };
      component.onAddColor();
      http.expectOne('api/colors').flush({ error: 'The visitor color list is full right now.' }, { status: 409, statusText: 'Conflict' });
      expect(component.serverFull).toBeTrue();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('a.add-color-email')).not.toBeNull();
    });
  });
});
