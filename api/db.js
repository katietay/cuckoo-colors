'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const MIN_COLORS = 2;
const MAX_COLORS = 50;

const DEFAULT_COLORS = [
  ['red', '#ff0000'],
  ['orange', '#ffa500'],
  ['yellow', '#ffff00'],
  ['green', '#008000'],
  ['teal', '#008080'],
  ['blue', '#0000ff'],
  ['purple', '#800080'],
  ['grey', '#808080'],
  ['brown', '#a52a2a'],
  ['black', '#000000'],
];

/**
 * Open (and create if needed) the SQLite database.
 * Pass ":memory:" for tests. The schema is created with IF NOT EXISTS and is
 * never dropped, so data survives restarts. Defaults are seeded only into an
 * empty table.
 */
function openDatabase(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS colors (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 40),
      hex  TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(hex) = 7)
    );
  `);
  seedIfEmpty(db);
  return db;
}

function seedIfEmpty(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM colors').get();
  if (n > 0) return;
  const insert = db.prepare('INSERT INTO colors (name, hex) VALUES (?, ?)');
  db.transaction(() => {
    for (const [name, hex] of DEFAULT_COLORS) insert.run(name, hex);
  })();
}

/** Small repository around prepared statements. Every query is parameterized. */
function createColorRepository(db) {
  const list = db.prepare('SELECT id, name, hex FROM colors ORDER BY id');
  const get = db.prepare('SELECT id, name, hex FROM colors WHERE id = ?');
  const count = db.prepare('SELECT COUNT(*) AS n FROM colors');
  const insert = db.prepare('INSERT INTO colors (name, hex) VALUES (?, ?)');
  const update = db.prepare('UPDATE colors SET name = ?, hex = ? WHERE id = ?');
  const remove = db.prepare('DELETE FROM colors WHERE id = ?');

  return {
    list: () => list.all(),
    get: (id) => get.get(id),
    count: () => count.get().n,
    create: ({ name, hex }) => {
      const { lastInsertRowid } = insert.run(name, hex);
      return get.get(Number(lastInsertRowid));
    },
    update: (id, { name, hex }) => {
      update.run(name, hex, id);
      return get.get(id);
    },
    remove: (id) => remove.run(id).changes > 0,
  };
}

function isUniqueViolation(err) {
  return Boolean(err) && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');
}

module.exports = {
  MIN_COLORS,
  MAX_COLORS,
  DEFAULT_COLORS,
  openDatabase,
  createColorRepository,
  isUniqueViolation,
};
