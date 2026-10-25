'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { createApp } = require('../app');
const { openDatabase } = require('../db');
const { validateVisitorColorInput } = require('../validate');
const { isBlockedName } = require('../blocklist');

const TOKEN = 'test-admin-token-0123456789';
const AUTH = { 'X-Admin-Key': TOKEN };

async function start(visitor, extra = {}) {
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    adminToken: TOKEN,
    visitor,
    limits: { writeLimit: 10000, readLimit: 10000 },
    logError: () => {},
    ...extra,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { db, server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, url, { body, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

test('visitor adding is off by default: no key still means 401', async () => {
  const { server, base } = await start({});
  try {
    assert.equal((await call(base, 'POST', '/api/colors', { body: { name: 'Sky blue', hex: '#87ceeb' } })).status, 401);
    const config = (await call(base, 'GET', '/api/config')).json;
    assert.equal(config.publicAdding, false);
  } finally {
    server.close();
  }
});

test('a visitor can add a color, but not edit or delete, and a wrong key is still rejected', async () => {
  const { server, base } = await start({ enabled: true });
  try {
    const added = await call(base, 'POST', '/api/colors', { body: { name: 'Sky blue', hex: '#87CEEB' } });
    assert.equal(added.status, 201);
    assert.equal(added.json.source, 'visitor');
    assert.equal(typeof added.json.expiresAt, 'number');
    assert.equal(added.json.hex, '#87ceeb');

    const id = added.json.id;
    assert.equal((await call(base, 'PUT', `/api/colors/${id}`, { body: { name: 'Other', hex: '#000001' } })).status, 401);
    assert.equal((await call(base, 'DELETE', `/api/colors/${id}`)).status, 401);
    assert.equal(
      (await call(base, 'POST', '/api/colors', { body: { name: 'Fern', hex: '#4f7942' }, headers: { 'X-Admin-Key': 'wrong' } })).status,
      401,
    );
  } finally {
    server.close();
  }
});

test('visitor names follow the stricter rules', () => {
  const bad = ['ab', 'Red 2', 'Mint!', 'a'.repeat(25), 'One two three four', 'Mintttt', '<b>hi</b>', 'Привет', ' ', 42, null];
  for (const name of bad) {
    assert.ok(validateVisitorColorInput({ name, hex: '#abc' }).error, `should reject ${JSON.stringify(name)}`);
  }
  const good = ['Sky blue', "Robin's egg", 'Dusty-rose', 'Shiitake', 'Ünï cörn', 'Class', 'Torpedo', 'Spice', 'Swank', 'Heroine'];
  for (const name of good) {
    assert.equal(validateVisitorColorInput({ name, hex: '#abc' }).error, undefined, `should accept ${name}`);
  }
});

test('blocked words are rejected, including spaced and accented spellings, without false alarms', () => {
  const blocked = ['Fuck', 'fuuck', 'Sh it', 'b i t c h', 'Ünfück', 'Nazi blue', 'Pea cock', 'Sexy red', 'Holy ass', 'asshat', 'Cum'];
  for (const name of blocked) assert.equal(isBlockedName(name), true, `should block ${name}`);
  const fine = ['Scunthorpe', 'Cumin', 'Raccoon', 'Analyst', 'Mess', 'Hancock', 'Titan', 'Grass', 'Glass', 'Shiitake', 'Spice'];
  for (const name of fine) assert.equal(isBlockedName(name), false, `should allow ${name}`);
});

test('a blocked name is refused with a message that does not reveal the word', async () => {
  const { server, base } = await start({ enabled: true });
  try {
    const res = await call(base, 'POST', '/api/colors', { body: { name: 'Nazi blue', hex: '#123456' } });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'That name is not allowed. Please choose a different name.');
  } finally {
    server.close();
  }
});

test('each visitor can add only a few colors per day', async () => {
  const { server, base } = await start({ enabled: true, perDay: 2, maxColors: 50 });
  try {
    assert.equal((await call(base, 'POST', '/api/colors', { body: { name: 'Fern', hex: '#4f7942' } })).status, 201);
    assert.equal((await call(base, 'POST', '/api/colors', { body: { name: 'Moss', hex: '#8a9a5b' } })).status, 201);
    const third = await call(base, 'POST', '/api/colors', { body: { name: 'Olive', hex: '#808000' } });
    assert.equal(third.status, 429);
    assert.match(third.json.error, /2 colors per day/);
  } finally {
    server.close();
  }
});

test('the visitor color list has a size cap, and the admin is not affected by it', async () => {
  const { server, base } = await start({ enabled: true, perDay: 100, maxColors: 2 });
  try {
    assert.equal((await call(base, 'POST', '/api/colors', { body: { name: 'Fern', hex: '#4f7942' } })).status, 201);
    assert.equal((await call(base, 'POST', '/api/colors', { body: { name: 'Moss', hex: '#8a9a5b' } })).status, 201);
    const full = await call(base, 'POST', '/api/colors', { body: { name: 'Olive', hex: '#808000' } });
    assert.equal(full.status, 409);
    assert.match(full.json.error, /full/);
    assert.equal((await call(base, 'POST', '/api/colors', { body: { name: 'Olive', hex: '#808000' }, headers: AUTH })).status, 201);
  } finally {
    server.close();
  }
});

test('visitor colors expire and disappear, admin colors never do', async () => {
  const { server, base, db } = await start({ enabled: true, expireSeconds: 3600 });
  try {
    const added = await call(base, 'POST', '/api/colors', { body: { name: 'Fern', hex: '#4f7942' } });
    assert.equal(added.status, 201);
    const before = (await call(base, 'GET', '/api/colors')).json;
    assert.ok(before.some((c) => c.name === 'Fern'));

    db.prepare('UPDATE colors SET created_at = ? WHERE id = ?').run(1, added.json.id);
    const after = (await call(base, 'GET', '/api/colors')).json;
    assert.ok(!after.some((c) => c.name === 'Fern'));
    assert.equal(after.filter((c) => c.source === 'admin').length, 10);
  } finally {
    server.close();
  }
});

test('saving an edit as admin keeps a visitor color permanently', async () => {
  const { server, base } = await start({ enabled: true });
  try {
    const added = await call(base, 'POST', '/api/colors', { body: { name: 'Fern', hex: '#4f7942' } });
    const saved = await call(base, 'PUT', `/api/colors/${added.json.id}`, { body: { name: 'Fern', hex: '#4f7942' }, headers: AUTH });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.source, 'admin');
    assert.equal(saved.json.expiresAt, null);
  } finally {
    server.close();
  }
});

test('config tells the page the visitor rules and who to email', async () => {
  const { server, base } = await start({ enabled: true, perDay: 3, maxColors: 10 }, { contactEmail: 'hello@example.com' });
  try {
    const config = (await call(base, 'GET', '/api/config')).json;
    assert.equal(config.publicAdding, true);
    assert.equal(config.contactEmail, 'hello@example.com');
    assert.equal(config.visitorLimits.perDay, 3);
    assert.equal(config.visitorLimits.maxColors, 10);
    assert.equal(config.visitorLimits.nameMin, 3);
    assert.equal(config.visitorLimits.nameMax, 24);
  } finally {
    server.close();
  }
});

test('a database made before visitor colors existed is upgraded without losing rows', () => {
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-old-')), 'old.db');
  const old = new Database(file);
  old.exec(`CREATE TABLE colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 40),
    hex TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(hex) = 7)
  )`);
  old.prepare('INSERT INTO colors (name, hex) VALUES (?, ?)').run('mine', '#123456');
  old.close();

  const db = openDatabase(file);
  const row = db.prepare('SELECT name, source, created_at FROM colors WHERE name = ?').get('mine');
  assert.deepEqual({ ...row }, { name: 'mine', source: 'admin', created_at: 0 });
  db.close();
});
