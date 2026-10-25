'use strict';

// Black-box tests. They run unchanged against the Node API and the PHP API (see contract/run.js).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { call, authed, unique } = require('./helpers');

const created = [];
async function add(color = unique()) {
  const res = await call('POST', '/api/colors', { body: color, headers: authed });
  assert.equal(res.status, 201, res.text);
  created.push(res.json.id);
  return res.json;
}
after(async () => {
  for (const id of created) await call('DELETE', `/api/colors/${id}`, { headers: authed });
});

test('health and config', async () => {
  assert.deepEqual((await call('GET', '/api/health')).json, { status: 'ok' });
  const config = (await call('GET', '/api/config')).json;
  assert.equal(config.editingEnabled, true);
  assert.equal(config.minColors, 2);
  assert.equal(config.maxColors, 75);
});

test('GET /api/colors lists colors with id, name and normalized hex, without a key', async () => {
  const res = await call('GET', '/api/colors');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json) && res.json.length >= 2);
  for (const c of res.json) {
    assert.deepEqual(Object.keys(c).sort(), ['expiresAt', 'hex', 'id', 'name', 'source']);
    assert.equal(typeof c.id, 'number');
    assert.match(c.hex, /^#[0-9a-f]{6}$/);
  }
});

test('responses carry security headers and no CORS', async () => {
  const res = await call('GET', '/api/colors');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.match(res.headers.get('content-type'), /application\/json/);
});

test('writes need the admin key', async () => {
  const body = unique();
  assert.equal((await call('POST', '/api/colors', { body })).status, 401);
  assert.equal((await call('POST', '/api/colors', { body, headers: { 'X-Admin-Key': 'wrong' } })).status, 401);
  assert.equal((await call('POST', '/api/colors', { body, headers: { Authorization: `Bearer ${authed['X-Admin-Key']}` } })).status, 401);
  assert.equal((await call('PUT', '/api/colors/1', { body })).status, 401);
  assert.equal((await call('DELETE', '/api/colors/1')).status, 401);
});

test('POST creates a color and normalizes name and hex', async () => {
  const n = unique();
  const hex = '#0A1B2C';
  const res = await call('POST', '/api/colors', { body: { name: `  ${n.name.replace(' ', '   ')} `, hex: hex.toUpperCase() }, headers: authed });
  if (res.status === 201) created.push(res.json.id);
  assert.equal(res.status, 201, res.text);
  assert.equal(res.json.name, n.name);
  assert.equal(res.json.hex, '#0a1b2c');
  assert.equal(typeof res.json.id, 'number');
  const list = (await call('GET', '/api/colors')).json;
  assert.ok(list.some((c) => c.id === res.json.id && c.hex === '#0a1b2c'));
});

test('three-digit hex is expanded', async () => {
  const n = unique();
  const res = await call('POST', '/api/colors', { body: { name: n.name, hex: '#1Fa' }, headers: authed });
  if (res.status === 201) created.push(res.json.id);
  assert.equal(res.status, 201, res.text);
  assert.equal(res.json.hex, '#11ffaa');
});

test('POST rejects invalid input with 400 and a message', async () => {
  const bad = [
    { name: '', hex: '#ffffff' },
    { name: 'ok', hex: 'ffffff' },
    { name: 'ok', hex: '#ggg' },
    { name: 'ok', hex: '#12345' },
    { name: '<img src=x onerror=alert(1)>', hex: '#ffffff' },
    { name: "x'); DROP TABLE colors;--", hex: '#123456' },
    { name: 'x'.repeat(41), hex: '#ffffff' },
    { name: 123, hex: '#ffffff' },
    { name: 'ok', hex: 123 },
    { hex: '#ffffff' },
    { name: 'ok' },
  ];
  for (const body of bad) {
    const res = await call('POST', '/api/colors', { body, headers: authed });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(typeof res.json.error, 'string');
  }
  for (const raw of ['[]', 'null', '"str"', '5']) {
    const res = await call('POST', '/api/colors', { raw, headers: { ...authed, 'Content-Type': 'application/json' } });
    assert.equal(res.status, 400, raw);
  }
});

test('malformed and oversized JSON get clean errors', async () => {
  const headers = { ...authed, 'Content-Type': 'application/json' };
  const bad = await call('POST', '/api/colors', { raw: '{not json', headers });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'Request body is not valid JSON.');
  const big = await call('POST', '/api/colors', { raw: JSON.stringify({ name: 'a'.repeat(5000), hex: '#fff' }), headers });
  assert.equal(big.status, 413);
});

test('duplicates are rejected with 409, ignoring case and hex length', async () => {
  const c = await add();
  const other = unique();
  assert.equal((await call('POST', '/api/colors', { body: { name: c.name.toUpperCase(), hex: other.hex }, headers: authed })).status, 409);
  assert.equal((await call('POST', '/api/colors', { body: { name: other.name, hex: c.hex.toUpperCase() }, headers: authed })).status, 409);
});

test('PUT updates, allows an unchanged save, and rejects collisions', async () => {
  const a = await add();
  const b = await add();
  const n = unique();
  const updated = await call('PUT', `/api/colors/${a.id}`, { body: { name: n.name, hex: n.hex.toUpperCase() }, headers: authed });
  assert.equal(updated.status, 200, updated.text);
  assert.deepEqual(updated.json, { id: a.id, name: n.name, hex: n.hex, source: 'admin', expiresAt: null });
  assert.equal((await call('PUT', `/api/colors/${a.id}`, { body: updated.json, headers: authed })).status, 200);
  assert.equal((await call('PUT', `/api/colors/${a.id}`, { body: { name: b.name, hex: '#010203' }, headers: authed })).status, 409);
  assert.equal((await call('PUT', `/api/colors/${a.id}`, { body: { name: 'zzz unique name', hex: b.hex }, headers: authed })).status, 409);
  assert.equal((await call('PUT', `/api/colors/${a.id}`, { body: { name: '', hex: '#111111' }, headers: authed })).status, 400);
});

test('PUT and DELETE: 404 for unknown ids, 400 for malformed ids', async () => {
  const body = unique();
  assert.equal((await call('PUT', '/api/colors/99999999', { body, headers: authed })).status, 404);
  assert.equal((await call('DELETE', '/api/colors/99999999', { headers: authed })).status, 404);
  for (const bad of ['abc', '0', '-1', '1.5', '01', '1%20OR%201=1', '99999999999']) {
    assert.equal((await call('PUT', `/api/colors/${bad}`, { body, headers: authed })).status, 400, bad);
    assert.equal((await call('DELETE', `/api/colors/${bad}`, { headers: authed })).status, 400, bad);
  }
});

test('DELETE removes a color and returns 204', async () => {
  const c = await add();
  const res = await call('DELETE', `/api/colors/${c.id}`, { headers: authed });
  assert.equal(res.status, 204);
  assert.equal(res.text, '');
  created.splice(created.indexOf(c.id), 1);
  assert.ok(!(await call('GET', '/api/colors')).json.some((x) => x.id === c.id));
});

test('unknown routes return a JSON 404', async () => {
  for (const [method, url] of [['GET', '/api/nope'], ['GET', '/api/colors/1'], ['PATCH', '/api/colors/1'], ['POST', '/api/config']]) {
    const res = await call(method, url, { headers: authed });
    assert.equal(res.status, 404, `${method} ${url}`);
    assert.deepEqual(res.json, { error: 'Not found.' });
  }
});

// Destructive: run only against a throwaway database (the runner sets API_DESTRUCTIVE=1).
test('the server keeps at least two colors and stops at the maximum', { skip: !process.env.API_DESTRUCTIVE }, async () => {
  // Fill up to the maximum, then one more must be refused.
  let list = (await call('GET', '/api/colors')).json;
  while (list.length < 75) {
    const res = await call('POST', '/api/colors', { body: unique(), headers: authed });
    assert.equal(res.status, 201, res.text);
    list.push(res.json);
  }
  const over = await call('POST', '/api/colors', { body: unique(), headers: authed });
  assert.equal(over.status, 409);

  // Delete down to two, then the next delete must be refused.
  list = (await call('GET', '/api/colors')).json;
  for (const c of list.slice(2)) {
    assert.equal((await call('DELETE', `/api/colors/${c.id}`, { headers: authed })).status, 204);
  }
  const last = await call('DELETE', `/api/colors/${list[0].id}`, { headers: authed });
  assert.equal(last.status, 409);
  assert.equal((await call('GET', '/api/colors')).json.length, 2);
});
