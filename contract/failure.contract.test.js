'use strict';

// Runs against a PHP server whose database cannot be opened (the runner sets FAILURE_EXPECT=1).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { call } = require('./helpers');

test('a broken database gives a generic 500 and leaks nothing', { skip: !process.env.FAILURE_EXPECT }, async () => {
  for (const url of ['/api/colors', '/api/health']) {
    const res = await call('GET', url);
    assert.equal(res.status, 500);
    assert.deepEqual(res.json, { error: 'Something went wrong on the server.' });
    assert.ok(!/sqlite|pdo|sqlstate|unable to open|\/tmp|\.php/i.test(res.text), res.text);
  }
});
