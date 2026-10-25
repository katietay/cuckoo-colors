'use strict';

// Visitor adding (no admin key). Runs once per rule against a server started with that rule
// (see the visitorRuns list in contract/run.js). Identical for the Node and PHP APIs.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { call, authed } = require('./helpers');

const mode = process.env.PUBLIC_MODE;
const only = (m) => ({ skip: mode !== m });

let n = 0;
const hex = () => `#${(0x100000 + (Date.now() % 0xe00000) + ++n * 977).toString(16).slice(0, 6).padStart(6, '0')}`;

const created = [];
const visitorAdd = async (name, color = hex()) => {
  const res = await call('POST', '/api/colors', { body: { name, hex: color } });
  if (res.status === 201) created.push(res.json.id);
  return res;
};
after(async () => {
  for (const id of created) await call('DELETE', `/api/colors/${id}`, { headers: authed });
});

test('config advertises visitor adding and its rules', only('rules'), async () => {
  const config = (await call('GET', '/api/config')).json;
  assert.equal(config.publicAdding, true);
  assert.equal(config.contactEmail, 'hello@example.com');
  assert.equal(config.maxColors, 75);
  assert.deepEqual(Object.keys(config.visitorLimits).sort(), ['expireSeconds', 'maxColors', 'nameMax', 'nameMin', 'perDay']);
  assert.equal(config.visitorLimits.nameMin, 3);
  assert.equal(config.visitorLimits.nameMax, 24);
});

test('a visitor can add a color; it is marked as a visitor color with an expiry', only('rules'), async () => {
  const res = await visitorAdd('Contract sky');
  assert.equal(res.status, 201, res.text);
  assert.equal(res.json.source, 'visitor');
  assert.equal(typeof res.json.expiresAt, 'number');
  assert.ok(res.json.expiresAt > Math.floor(Date.now() / 1000));
  const list = (await call('GET', '/api/colors')).json;
  assert.ok(list.some((c) => c.id === res.json.id && c.source === 'visitor'));
});

test('visitors cannot edit or delete, and a wrong key is rejected', only('rules'), async () => {
  const added = await visitorAdd('Contract mint');
  assert.equal(added.status, 201, added.text);
  const id = added.json.id;
  assert.equal((await call('PUT', `/api/colors/${id}`, { body: { name: 'Other', hex: hex() } })).status, 401);
  assert.equal((await call('DELETE', `/api/colors/${id}`)).status, 401);
  const wrong = await call('POST', '/api/colors', { body: { name: 'Contract wrong', hex: hex() }, headers: { 'X-Admin-Key': 'wrong' } });
  assert.equal(wrong.status, 401);
});

test('visitor names that break the format are refused with 400', only('rules'), async () => {
  const bad = ['ab', 'Red 2', 'Mint!', 'a'.repeat(25), 'One two three four', 'Mintttt', '<b>hi</b>', 'Привет', '', '   '];
  for (const name of bad) {
    const res = await call('POST', '/api/colors', { body: { name, hex: hex() } });
    assert.equal(res.status, 400, `should refuse ${JSON.stringify(name)}: ${res.text}`);
  }
  assert.equal((await call('POST', '/api/colors', { body: { name: 42, hex: hex() } })).status, 400);
  assert.equal((await call('POST', '/api/colors', { body: { name: 'Fine name', hex: 'nope' } })).status, 400);
});

test('blocked words are refused without naming the word; harmless look-alikes are accepted', only('rules'), async () => {
  for (const name of ['Fuck', 'fuuck', 'Sh it', 'Nazi blue', 'Pea cock', 'Sexy red', 'Holy ass', 'asshat', 'Cum']) {
    const res = await call('POST', '/api/colors', { body: { name, hex: hex() } });
    assert.equal(res.status, 400, `should block ${name}: ${res.text}`);
    assert.equal(res.json.error, 'That name is not allowed. Please choose a different name.');
  }
  for (const name of ['Scunthorpe', 'Cumin', 'Raccoon', 'Analyst', 'Hancock', 'Titan', 'Grass', 'Shiitake', 'Spice', 'Ünï cörn']) {
    const res = await visitorAdd(name);
    assert.equal(res.status, 201, `should allow ${name}: ${res.text}`);
  }
});

test('an admin edit keeps a visitor color permanently', only('rules'), async () => {
  const added = await visitorAdd('Contract keeper');
  assert.equal(added.status, 201, added.text);
  const saved = await call('PUT', `/api/colors/${added.json.id}`, { body: { name: added.json.name, hex: added.json.hex }, headers: authed });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.source, 'admin');
  assert.equal(saved.json.expiresAt, null);
});

test('each visitor can add only a few colors per day', only('quota'), async () => {
  assert.equal((await visitorAdd('Quota one')).status, 201);
  assert.equal((await visitorAdd('Quota two')).status, 201);
  const third = await visitorAdd('Quota three');
  assert.equal(third.status, 429);
  assert.match(third.json.error, /2 colors per day/);
});

test('the visitor list has a size cap; the admin can still add', only('cap'), async () => {
  assert.equal((await visitorAdd('Cap one')).status, 201);
  assert.equal((await visitorAdd('Cap two')).status, 201);
  const full = await visitorAdd('Cap three');
  assert.equal(full.status, 409);
  assert.match(full.json.error, /full/);
  const admin = await call('POST', '/api/colors', { body: { name: 'Admin cap', hex: hex() }, headers: authed });
  assert.equal(admin.status, 201, admin.text);
  created.push(admin.json.id);
});

test('visitor colors disappear after they expire; admin colors stay', only('expiry'), async () => {
  const added = await visitorAdd('Fading color');
  assert.equal(added.status, 201, added.text);
  assert.ok((await call('GET', '/api/colors')).json.some((c) => c.name === 'Fading color'));
  await new Promise((r) => setTimeout(r, 3500));
  const list = (await call('GET', '/api/colors')).json;
  assert.ok(!list.some((c) => c.name === 'Fading color'));
  assert.ok(list.filter((c) => c.source === 'admin').length >= 10);
});
