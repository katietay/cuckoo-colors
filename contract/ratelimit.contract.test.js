'use strict';

// Runs against a server started with a write limit of 3 (the runner sets RATE_LIMIT_EXPECT=3).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { call, authed } = require('./helpers');

test('write requests are limited, reads are not', { skip: !process.env.RATE_LIMIT_EXPECT }, async () => {
  const limit = Number(process.env.RATE_LIMIT_EXPECT);
  const statuses = [];
  for (let i = 0; i < limit + 2; i++) {
    statuses.push((await call('POST', '/api/colors', { body: { name: 'a', hex: 'bad' }, headers: authed })).status);
  }
  assert.deepEqual(statuses, [...Array(limit).fill(400), 429, 429]);
  assert.equal((await call('GET', '/api/colors')).status, 200);
});
