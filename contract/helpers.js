'use strict';

const BASE = process.env.API_BASE;
const KEY = process.env.ADMIN_TOKEN;

async function call(method, url, { body, headers = {}, raw } = {}) {
  const res = await fetch(BASE + url, {
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

const authed = { 'X-Admin-Key': KEY };

let counter = 0;
/** Unique name and hex so tests never collide with each other or with existing colors. */
function unique() {
  counter += 1;
  const n = (Date.now() + counter * 7919) % 0xffffff;
  return { name: `Test ${counter} ${n.toString(36)}`, hex: `#${n.toString(16).padStart(6, '0')}` };
}

module.exports = { BASE, KEY, call, authed, unique };
