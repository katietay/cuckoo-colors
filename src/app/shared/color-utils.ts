export const NAME_MAX = 40;

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '\-]*$/u;

/** True for "#rgb" or "#rrggbb" using only 0-9 and A-F. */
export function isValidHex(value: string | null | undefined): boolean {
  return typeof value === 'string' && HEX_PATTERN.test(value.trim());
}

/** Lowercase, 6-digit form ("#FA0" becomes "#ffaa00"). Returns '' when invalid. */
export function normalizeHex(value: string | null | undefined): string {
  if (!isValidHex(value)) return '';
  const digits = (value as string).trim().slice(1).toLowerCase();
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  return `#${full}`;
}

/** Trim and collapse repeated whitespace. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function isValidName(value: string | null | undefined): boolean {
  const name = normalizeName(value);
  return name.length > 0 && name.length <= NAME_MAX && NAME_PATTERN.test(name);
}

/** Natural ordering for cell ids such as A1, A2, A10, B1. */
export function compareCellIds(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}
