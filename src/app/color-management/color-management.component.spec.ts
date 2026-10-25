import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ColorManagementComponent } from './color-management.component';
import { Color } from '../services/colors.service';

const COLORS: Color[] = [
  { id: 1, name: 'red', hex: '#ff0000' },
  { id: 2, name: 'blue', hex: '#0000ff' },
  { id: 3, name: 'green', hex: '#008000' },
];

describe('ColorManagementComponent', () => {
  let fixture: ComponentFixture<ColorManagementComponent>;
  let component: ColorManagementComponent;
  let http: HttpTestingController;

  function setup(editingEnabled = true, colors: Color[] = COLORS): void {
    fixture.detectChanges();
    http.expectOne('api/config').flush({ editingEnabled, minColors: 2, maxColors: 75 });
    http.expectOne('api/colors').flush(colors);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColorManagementComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ColorManagementComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and lists colors', () => {
    setup();
    expect(component.colors.length).toBe(3);
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('#ff0000');
  });

  it('shows a read-only notice and no edit controls when editing is disabled', () => {
    setup(false);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('read-only');
    expect(el.querySelector('#add-name')).toBeNull();
    expect(el.querySelector('button')).toBeNull();
  });

  it('shows an error when the list cannot be loaded', () => {
    fixture.detectChanges();
    http.expectOne('api/config').flush({ editingEnabled: true, minColors: 2, maxColors: 75 });
    http.expectOne('api/colors').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(component.loadError).toBe('Could not load the color list.');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role=alert]')).not.toBeNull();
  });

  describe('validation helpers', () => {
    beforeEach(() => setup());

    it('isHexValue accepts #rgb and #rrggbb only', () => {
      expect(component.isHexValue('#abc')).toBeTrue();
      expect(component.isHexValue('#ABCDEF')).toBeTrue();
      for (const bad of ['', 'abcdef', '#abcd', '#abcdeg', '#1234567']) expect(component.isHexValue(bad)).toBeFalse();
    });

    it('isDuplicate matches names case-insensitively and hex across short and long forms', () => {
      expect(component.isDuplicate('RED', '#123456')).toBeTrue();
      expect(component.isDuplicate('new', '#F00')).toBeTrue();
      expect(component.isDuplicate('new', '#123456')).toBeFalse();
    });

    it('isDuplicate ignores the color being edited', () => {
      expect(component.isDuplicate('red', '#ff0000', 1)).toBeFalse();
      expect(component.isDuplicate('red', '#ff0000', 2)).toBeTrue();
    });
  });

  describe('adding', () => {
    beforeEach(() => setup());

    it('appends a color added through the shared form', () => {
      component.onColorAdded({ id: 4, name: 'Hot Pink', hex: '#ff00aa' });
      expect(component.colors.length).toBe(4);
    });

    it('shows edit and delete buttons only once an admin key is typed', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[aria-label="Edit red"]')).toBeNull();
      component.onAdminKeyChange('my-admin-key');
      fixture.detectChanges();
      expect(el.querySelector('[aria-label="Edit red"]')).not.toBeNull();
      expect(el.querySelector('[aria-label="Delete red"]')).not.toBeNull();
    });
  });

  describe('editing', () => {
    beforeEach(() => setup());

    it('startEdit copies the color so cancelling leaves the list untouched', () => {
      component.startEdit(component.colors[0]);
      component.editColor!.name = 'changed';
      expect(component.colors[0].name).toBe('red');
      component.cancelEdit();
      expect(component.editColor).toBeNull();
    });

    it('updates the list entry in place with the server response', () => {
      component.startEdit(component.colors[1]);
      component.editColor!.name = 'Navy';
      component.editColor!.hex = '#001';
      component.onEditColor();

      const req: TestRequest = http.expectOne('api/colors/2');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ name: 'Navy', hex: '#000011' });
      req.flush({ id: 2, name: 'Navy', hex: '#000011' });

      expect(component.colors.map((c) => c.name)).toEqual(['red', 'Navy', 'green']);
      expect(component.colors.length).toBe(3);
      expect(component.editColor).toBeNull();
    });

    it('rejects a duplicate or invalid edit without calling the server', () => {
      component.startEdit(component.colors[1]);
      component.editColor!.name = 'red';
      component.onEditColor();
      expect(component.editError).toBe('Inputted value already exists.');

      component.editColor!.name = 'ok';
      component.editColor!.hex = 'zzz';
      component.onEditColor();
      expect(component.editError).toContain('not a valid hex');
    });

    it('keeps the edit form open and shows the error when saving fails', () => {
      component.startEdit(component.colors[0]);
      component.editColor!.name = 'Scarlet';
      component.onEditColor();
      http.expectOne('api/colors/1').flush({}, { status: 500, statusText: 'Server Error' });
      expect(component.editError).toBe('Failed to update color.');
      expect(component.editColor).not.toBeNull();
      expect(component.colors[0].name).toBe('red');
    });
  });

  describe('deleting', () => {
    beforeEach(() => setup());

    it('removes the color after confirmation', () => {
      component.confirmDelete(component.colors[0]);
      component.onDeleteColor();
      const req = http.expectOne('api/colors/1');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(component.colors.map((c) => c.id)).toEqual([2, 3]);
      expect(component.deleteCandidate).toBeNull();
    });

    it('cancelDelete clears the candidate', () => {
      component.confirmDelete(component.colors[0]);
      component.cancelDelete();
      expect(component.deleteCandidate).toBeNull();
    });

    it('shows an error and keeps the color when the server refuses', () => {
      component.confirmDelete(component.colors[0]);
      component.onDeleteColor();
      http.expectOne('api/colors/1').flush({ error: 'You must keep at least 2 colors.' }, { status: 409, statusText: 'Conflict' });
      expect(component.deleteError).toBe('You must keep at least 2 colors.');
      expect(component.colors.length).toBe(3);
    });
  });

  it('refuses to delete below the minimum number of colors', () => {
    setup(true, COLORS.slice(0, 2));
    component.confirmDelete(component.colors[0]);
    component.onDeleteColor();
    expect(component.deleteError).toBe('You must keep at least 2 colors.');
  });
});
