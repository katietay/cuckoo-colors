import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ColorService, describeHttpError } from './colors.service';

describe('ColorService', () => {
  let service: ColorService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ColorService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('GETs colors from the same-origin API without credentials', () => {
    service.getColors().subscribe((colors) => expect(colors.length).toBe(1));
    const req = http.expectOne('api/colors');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('X-Admin-Key')).toBeFalse();
    req.flush([{ id: 1, name: 'red', hex: '#ff0000' }]);
  });

  it('GETs the server config', () => {
    service.getConfig().subscribe((c) => expect(c.editingEnabled).toBeTrue());
    http.expectOne('api/config').flush({ editingEnabled: true, minColors: 2, maxColors: 50 });
  });

  it('sends the admin key in the X-Admin-Key header on writes, only once it is set', () => {
    service.addColor({ name: 'pink', hex: '#ffc0cb' }).subscribe();
    const first = http.expectOne('api/colors');
    expect(first.request.method).toBe('POST');
    expect(first.request.headers.has('X-Admin-Key')).toBeFalse();
    first.flush({ id: 11, name: 'pink', hex: '#ffc0cb' });

    service.setAdminKey('  secret-key  ');
    expect(service.hasAdminKey()).toBeTrue();
    service.addColor({ name: 'pink', hex: '#ffc0cb' }).subscribe();
    const second = http.expectOne('api/colors');
    expect(second.request.headers.get('X-Admin-Key')).toBe('secret-key');
    second.flush({ id: 11, name: 'pink', hex: '#ffc0cb' });
  });

  it('PUTs only name and hex to the id URL', () => {
    service.updateColor({ id: 3, name: 'x', hex: '#111111' }).subscribe();
    const req = http.expectOne('api/colors/3');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'x', hex: '#111111' });
    req.flush({ id: 3, name: 'x', hex: '#111111' });
  });

  it('DELETEs by id', () => {
    service.deleteColor(4).subscribe();
    const req = http.expectOne('api/colors/4');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('never persists the admin key to browser storage', () => {
    service.setAdminKey('super-secret');
    expect(JSON.stringify({ ...localStorage })).not.toContain('super-secret');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('super-secret');
  });

  describe('describeHttpError', () => {
    const err = (status: number, body: unknown = null) => new HttpErrorResponse({ status, error: body });

    it('maps well-known statuses to friendly messages', () => {
      expect(describeHttpError(err(401), 'x')).toContain('admin key');
      expect(describeHttpError(err(429), 'x')).toContain('Too many requests');
      expect(describeHttpError(err(503), 'x')).toContain('disabled');
    });

    it('uses the server message when there is one, and the fallback otherwise', () => {
      expect(describeHttpError(err(409, { error: 'Already exists.' }), 'fallback')).toBe('Already exists.');
      expect(describeHttpError(err(500, '<html>boom</html>'), 'fallback')).toBe('fallback');
      expect(describeHttpError(new Error('x'), 'fallback')).toBe('fallback');
    });
  });
});
