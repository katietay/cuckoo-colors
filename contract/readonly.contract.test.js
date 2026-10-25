'use strict';

// Runs against a server started with no admin key (the runner sets READONLY_EXPECT=1).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { call } = require('./helpers');

test('with no admin key configured the server is read-only', { skip: !process.env.READONLY_EXPECT }, async () => {
  assert.equal((await call('GET', '/api/colors')).status, 200);
  assert.equal((await call('GET', '/api/config')).json.editingEnabled, false);
  const res = await call('POST', '/api/colors', { body: { name: 'pink', hex: '#ffc0cb' }, headers: { 'X-Admin-Key': 'anything-at-all-123456' } });
  assert.equal(res.status, 503);
});
