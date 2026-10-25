'use strict';

const { isBlockedName } = require('./blocklist');

const NAME_MAX = 40;
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '\-]*$/u;
const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Normalize "#abc" or "#AABBCC" to lowercase "#aabbcc".
 * Returns null when the value is not a valid hex color.
 */
function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  if (!HEX_PATTERN.test(hex)) return null;
  const digits = hex.slice(1).toLowerCase();
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  return `#${full}`;
}

/** Trim and collapse whitespace. Returns null when the name is not acceptable. */
function normalizeName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length === 0 || name.length > NAME_MAX) return null;
  if (!NAME_PATTERN.test(name)) return null;
  return name;
}

/**
 * Validate a request body for create and update.
 * Returns { value: { name, hex } } or { error: string }.
 */
function validateColorInput(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object with "name" and "hex".' };
  }
  const name = normalizeName(body.name);
  if (name === null) {
    return {
      error: `Name must be 1 to ${NAME_MAX} characters: letters, numbers, spaces, hyphens or apostrophes.`,
    };
  }
  const hex = normalizeHex(body.hex);
  if (hex === null) {
    return { error: 'Hex value must look like #rrggbb or #rgb, using only the digits 0-9 and A-F.' };
  }
  return { value: { name, hex } };
}

const VISITOR_NAME_MIN = 3;
const VISITOR_NAME_MAX = 24;
const VISITOR_WORDS_MAX = 3;
// Latin letters only (including accented ones), with single spaces, hyphens or apostrophes between words.
const VISITOR_NAME_PATTERN = /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]+(?:[ '\-][A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]+)*$/;
const VISITOR_NAME_HELP = `Names must be ${VISITOR_NAME_MIN} to ${VISITOR_NAME_MAX} letters (A to Z), up to ${VISITOR_WORDS_MAX} words, with no numbers or symbols.`;
const BLOCKED_HELP = 'That name is not allowed. Please choose a different name.';

/**
 * Validate a color submitted by a visitor (no admin key). Stricter than the admin rules.
 * Returns { value: { name, hex } } or { error: string }.
 */
function validateVisitorColorInput(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object with "name" and "hex".' };
  }
  const name = normalizeName(body.name);
  if (
    name === null ||
    name.length < VISITOR_NAME_MIN ||
    name.length > VISITOR_NAME_MAX ||
    !VISITOR_NAME_PATTERN.test(name) ||
    name.split(/[ '\-]/).length > VISITOR_WORDS_MAX ||
    /(.)\1{2,}/iu.test(name)
  ) {
    return { error: VISITOR_NAME_HELP };
  }
  if (isBlockedName(name)) return { error: BLOCKED_HELP };
  const hex = normalizeHex(body.hex);
  if (hex === null) {
    return { error: 'Hex value must look like #rrggbb or #rgb, using only the digits 0-9 and A-F.' };
  }
  return { value: { name, hex } };
}

/** Parse a route id. Returns a positive integer or null. */
function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

module.exports = {
  NAME_MAX,
  VISITOR_NAME_MIN,
  VISITOR_NAME_MAX,
  normalizeHex,
  normalizeName,
  validateColorInput,
  validateVisitorColorInput,
  parseId,
};
