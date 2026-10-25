import { compareCellIds, isValidHex, isValidName, normalizeHex, normalizeName } from './color-utils';

describe('color-utils', () => {
  describe('isValidHex', () => {
    it('accepts #rgb and #rrggbb in either case', () => {
      for (const ok of ['#fff', '#FFF', '#a1B2c3', '#000000']) expect(isValidHex(ok)).withContext(ok).toBeTrue();
    });

    it('rejects everything else', () => {
      for (const bad of ['', 'fff', '#ff', '#ffff', '#fffff', '#fffffff', '#ggg', '#12 456', null, undefined]) {
        expect(isValidHex(bad as string)).withContext(String(bad)).toBeFalse();
      }
    });
  });

  it('normalizeHex lowercases, expands and trims; invalid values give an empty string', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex(' #AbCdEf ')).toBe('#abcdef');
    expect(normalizeHex('nope')).toBe('');
  });

  it('normalizeName trims and collapses whitespace', () => {
    expect(normalizeName('  Sky   Blue ')).toBe('Sky Blue');
    expect(normalizeName(null)).toBe('');
  });

  it('isValidName enforces length and allowed characters', () => {
    expect(isValidName("Sky-Blue's 2")).toBeTrue();
    expect(isValidName('')).toBeFalse();
    expect(isValidName('   ')).toBeFalse();
    expect(isValidName('x'.repeat(41))).toBeFalse();
    expect(isValidName('<b>bold</b>')).toBeFalse();
    expect(isValidName('semi;colon')).toBeFalse();
  });

  it('compareCellIds sorts naturally', () => {
    expect(['B1', 'A10', 'A2', 'A1'].sort(compareCellIds)).toEqual(['A1', 'A2', 'A10', 'B1']);
    expect(['AA1', 'B1', 'A1'].sort(compareCellIds)).toEqual(['A1', 'AA1', 'B1']);
  });
});
