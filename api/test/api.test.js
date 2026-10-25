'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../app');
const { openDatabase, DEFAULT_COLORS, MAX_COLORS } = require('../db');

const TOKEN = 'test-admin-token-0123456789';
const AUTH = { 'X-Admin-Key': TOKEN };

function start(options = {}) {
  const db = options.db ?? openDatabase(':memory:');
  const errors = [];
  const app = createApp({ db, adminToken: TOKEN, logError: (e) => errors.push(e), ...options });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({ server, db, base, errors });
    });
  });
}

async function call(base, method, url, { body, headers = {}, raw } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, json, text };
}

let ctx;
before(async () => {
  ctx = await start({ limits: { writeLimit: 10000, readLimit: 10000 } });
});
after(() => {
  ctx.server.close();
  ctx.db.close();
});
beforeEach(() => {
  ctx.db.exec('DELETE FROM colors');
  const insert = ctx.db.prepare('INSERT INTO colors (name, hex) VALUES (?, ?)');
  for (const [n, h] of DEFAULT_COLORS) insert.run(n, h);
});

test('GET /api/colors returns the seeded colors without auth', async () => {
  const res = await call(ctx.base, 'GET', '/api/colors');
  assert.equal(res.status, 200);
  assert.equal(res.json.length, DEFAULT_COLORS.length);
  assert.deepEqual(Object.keys(res.json[0]).sort(), ['expiresAt', 'hex', 'id', 'name', 'source']);
});

test('opening an existing database does not wipe or re-seed it', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-')), 'nested', 'colors.db');
  let db = openDatabase(file);
  db.prepare('DELETE FROM colors WHERE name = ?').run('red');
  db.prepare('INSERT INTO colors (name, hex) VALUES (?, ?)').run('mine', '#123456');
  db.close();
  db = openDatabase(file);
  const names = db.prepare('SELECT name FROM colors').all().map((r) => r.name);
  assert.ok(names.includes('mine'));
  assert.ok(!names.includes('red'), 'seed must not run again on a non-empty table');
  db.close();
});

test('writes require a valid admin key', async () => {
  const body = { name: 'pink', hex: '#ffc0cb' };
  assert.equal((await call(ctx.base, 'POST', '/api/colors', { body })).status, 401);
  assert.equal((await call(ctx.base, 'POST', '/api/colors', { body, headers: { 'X-Admin-Key': 'wrong' } })).status, 401);
  assert.equal((await call(ctx.base, 'POST', '/api/colors', { body, headers: { Authorization: `Bearer ${TOKEN}` } })).status, 401);
  assert.equal((await call(ctx.base, 'PUT', '/api/colors/1', { body })).status, 401);
  assert.equal((await call(ctx.base, 'DELETE', '/api/colors/1')).status, 401);
  assert.equal((await call(ctx.base, 'GET', '/api/colors')).json.length, DEFAULT_COLORS.length);
});

test('with no ADMIN_TOKEN configured the server is read-only', async () => {
  const ro = await start({ adminToken: '' });
  try {
    assert.equal((await call(ro.base, 'GET', '/api/colors')).status, 200);
    const res = await call(ro.base, 'POST', '/api/colors', { body: { name: 'pink', hex: '#ffc0cb' }, headers: AUTH });
    assert.equal(res.status, 503);
    assert.equal((await call(ro.base, 'GET', '/api/config')).json.editingEnabled, false);
  } finally {
    ro.server.close();
    ro.db.close();
  }
});

test('POST creates a color and normalizes input', async () => {
  const res = await call(ctx.base, 'POST', '/api/colors', { body: { name: '  Hot   Pink ', hex: '#F0A' }, headers: AUTH });
  assert.equal(res.status, 201);
  assert.deepEqual({ name: res.json.name, hex: res.json.hex }, { name: 'Hot Pink', hex: '#ff00aa' });
  assert.equal(typeof res.json.id, 'number');
});

test('POST rejects invalid input with 400', async () => {
  const bad = [
    { name: '', hex: '#ffffff' },
    { name: 'ok', hex: 'ffffff' },
    { name: 'ok', hex: '#ggg' },
    { name: '<img src=x onerror=alert(1)>', hex: '#ffffff' },
    { name: 'x'.repeat(41), hex: '#ffffff' },
    { name: 123, hex: '#ffffff' },
    { hex: '#ffffff' },
  ];
  for (const body of bad) {
    const res = await call(ctx.base, 'POST', '/api/colors', { body, headers: AUTH });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(res.json.error);
  }
  for (const raw of ['[]', 'null', '"str"']) {
    const res = await call(ctx.base, 'POST', '/api/colors', { raw, headers: { ...AUTH, 'Content-Type': 'application/json' } });
    assert.equal(res.status, 400, raw);
  }
});

test('POST rejects duplicate names and hex values case-insensitively with 409', async () => {
  assert.equal((await call(ctx.base, 'POST', '/api/colors', { body: { name: 'RED', hex: '#010101' }, headers: AUTH })).status, 409);
  assert.equal((await call(ctx.base, 'POST', '/api/colors', { body: { name: 'crimson', hex: '#FF0000' }, headers: AUTH })).status, 409);
  assert.equal((await call(ctx.base, 'POST', '/api/colors', { body: { name: 'crimson', hex: '#f00' }, headers: AUTH })).status, 409);
});

test('SQL injection strings are rejected or stored as plain text', async () => {
  const res = await call(ctx.base, 'POST', '/api/colors', { body: { name: "x'); DROP TABLE colors;--", hex: '#123456' }, headers: AUTH });
  assert.equal(res.status, 400);
  assert.equal((await call(ctx.base, 'PUT', '/api/colors/1%20OR%201=1', { body: { name: 'a', hex: '#111111' }, headers: AUTH })).status, 400);
  assert.equal((await call(ctx.base, 'GET', '/api/colors')).json.length, DEFAULT_COLORS.length);
});

test('POST stops at the maximum number of colors', async () => {
  const insert = ctx.db.prepare('INSERT INTO colors (name, hex) VALUES (?, ?)');
  for (let i = DEFAULT_COLORS.length; i < MAX_COLORS; i++) {
    insert.run(`extra ${i}`, `#${(0x100000 + i).toString(16)}`);
  }
  const res = await call(ctx.base, 'POST', '/api/colors', { body: { name: 'one more', hex: '#abcdef' }, headers: AUTH });
  assert.equal(res.status, 409);
});

test('PUT updates a color', async () => {
  const [first] = (await call(ctx.base, 'GET', '/api/colors')).json;
  const res = await call(ctx.base, 'PUT', `/api/colors/${first.id}`, { body: { name: 'Scarlet', hex: '#FF2400' }, headers: AUTH });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { id: first.id, name: 'Scarlet', hex: '#ff2400', source: 'admin', expiresAt: null });
});

test('PUT allows saving a color unchanged but rejects collisions with another color', async () => {
  const [first, second] = (await call(ctx.base, 'GET', '/api/colors')).json;
  assert.equal((await call(ctx.base, 'PUT', `/api/colors/${first.id}`, { body: first, headers: AUTH })).status, 200);
  const clash = await call(ctx.base, 'PUT', `/api/colors/${first.id}`, { body: { name: second.name, hex: '#010203' }, headers: AUTH });
  assert.equal(clash.status, 409);
});

test('PUT and DELETE return 404 for unknown ids and 400 for malformed ids', async () => {
  assert.equal((await call(ctx.base, 'PUT', '/api/colors/9999', { body: { name: 'a', hex: '#111111' }, headers: AUTH })).status, 404);
  assert.equal((await call(ctx.base, 'DELETE', '/api/colors/9999', { headers: AUTH })).status, 404);
  assert.equal((await call(ctx.base, 'DELETE', '/api/colors/abc', { headers: AUTH })).status, 400);
});

test('DELETE removes a color but keeps at least two', async () => {
  const colors = (await call(ctx.base, 'GET', '/api/colors')).json;
  const [keepA, keepB, ...rest] = colors;
  for (const c of rest) {
    assert.equal((await call(ctx.base, 'DELETE', `/api/colors/${c.id}`, { headers: AUTH })).status, 204);
  }
  const blocked = await call(ctx.base, 'DELETE', `/api/colors/${keepA.id}`, { headers: AUTH });
  assert.equal(blocked.status, 409);
  assert.equal((await call(ctx.base, 'GET', '/api/colors')).json.length, 2);
  assert.ok(keepB);
});

test('malformed and oversized JSON get clean errors', async () => {
  const headers = { ...AUTH, 'Content-Type': 'application/json' };
  const bad = await call(ctx.base, 'POST', '/api/colors', { raw: '{not json', headers });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'Request body is not valid JSON.');
  const big = await call(ctx.base, 'POST', '/api/colors', { raw: JSON.stringify({ name: 'a'.repeat(5000), hex: '#fff' }), headers });
  assert.equal(big.status, 413);
});

test('unexpected failures return a generic 500 and never leak internals', async () => {
  const broken = openDatabase(':memory:');
  const s = await start({ db: broken });
  try {
    broken.exec('DROP TABLE colors');
    const res = await call(s.base, 'GET', '/api/colors');
    assert.equal(res.status, 500);
    assert.deepEqual(res.json, { error: 'Something went wrong on the server.' });
    assert.ok(!/sqlite|colors|no such table/i.test(res.text));
    assert.equal(s.errors.length, 1, 'error is logged server-side');
  } finally {
    s.server.close();
  }
});

test('unknown API routes return JSON 404', async () => {
  const res = await call(ctx.base, 'GET', '/api/nope');
  assert.equal(res.status, 404);
  assert.deepEqual(res.json, { error: 'Not found.' });
});

test('security headers are set', async () => {
  const res = await call(ctx.base, 'GET', '/api/colors');
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(!csp.includes('upgrade-insecure-requests'), 'not forced outside production');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('access-control-allow-origin'), null, 'no CORS: same-origin only');
});

test('write requests are rate limited', async () => {
  const s = await start({ limits: { writeLimit: 3 } });
  try {
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await call(s.base, 'POST', '/api/colors', { body: { name: 'a', hex: 'bad' }, headers: AUTH })).status);
    }
    assert.deepEqual(statuses, [400, 400, 400, 429, 429]);
    assert.equal((await call(s.base, 'GET', '/api/colors')).status, 200, 'reads are not blocked by the write limit');
  } finally {
    s.server.close();
    s.db.close();
  }
});

test('serves the built app with a SPA fallback, and API paths never fall through to it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-static-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>app</title>');
  fs.writeFileSync(path.join(dir, 'main-ABCD1234.js'), 'console.log(1)');
  const s = await start({ staticDir: dir });
  try {
    const home = await call(s.base, 'GET', '/');
    assert.equal(home.status, 200);
    assert.ok(home.text.includes('<title>app</title>'));
    const deep = await call(s.base, 'GET', '/color-management');
    assert.ok(deep.text.includes('<title>app</title>'));
    const asset = await call(s.base, 'GET', '/main-ABCD1234.js');
    assert.match(asset.headers.get('cache-control'), /immutable/);
    assert.equal((await call(s.base, 'GET', '/api/missing')).json.error, 'Not found.');
    assert.equal((await call(s.base, 'GET', '/%2e%2e/%2e%2e/etc/passwd')).status, 200, 'traversal falls back to index.html, not the filesystem');
    assert.ok(!(await call(s.base, 'GET', '/%2e%2e/%2e%2e/etc/passwd')).text.includes('root:'));
  } finally {
    s.server.close();
    s.db.close();
  }
});
