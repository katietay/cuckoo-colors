'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHex, normalizeName, validateColorInput, parseId } = require('../validate');

test('normalizeHex lowercases and expands 3-digit values', () => {
  assert.equal(normalizeHex('#ABCDEF'), '#abcdef');
  assert.equal(normalizeHex('#fA0'), '#ffaa00');
  assert.equal(normalizeHex('  #123456 '), '#123456');
});

test('normalizeHex rejects bad input', () => {
  for (const bad of ['', 'abcdef', '#abcd', '#abcdeg', '#12345', '#1234567', null, undefined, 42, {}, ['#fff']]) {
    assert.equal(normalizeHex(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('normalizeName trims and collapses whitespace', () => {
  assert.equal(normalizeName('  Sky   Blue '), 'Sky Blue');
  assert.equal(normalizeName("O'Brien-Green"), "O'Brien-Green");
  assert.equal(normalizeName('Café 2'), 'Café 2');
});

test('normalizeName rejects markup, control characters and bad lengths', () => {
  const bad = ['', '   ', '<script>alert(1)</script>', 'a;DROP TABLE colors', 'x'.repeat(41), '-leading', null, 5];
  for (const value of bad) assert.equal(normalizeName(value), null, `should reject ${JSON.stringify(value)}`);
});

test('validateColorInput returns a normalized value or an error', () => {
  assert.deepEqual(validateColorInput({ name: ' Lime ', hex: '#0F0' }), { value: { name: 'Lime', hex: '#00ff00' } });
  assert.ok(validateColorInput(null).error);
  assert.ok(validateColorInput([]).error);
  assert.ok(validateColorInput({ name: 'ok', hex: 'nope' }).error);
  assert.ok(validateColorInput({ name: '', hex: '#fff' }).error);
});

test('parseId accepts only positive integers', () => {
  assert.equal(parseId('7'), 7);
  for (const bad of ['0', '-1', '1.5', '1e3', 'abc', '', '01', '99999999999', '1 OR 1=1', undefined]) {
    assert.equal(parseId(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});
