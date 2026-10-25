'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const MIN_COLORS = 2;
const MAX_COLORS = 75;

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
      hex  TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(hex) = 7),
      source     TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'visitor')),
      created_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  addMissingColumns(db);
  seedIfEmpty(db);
  return db;
}

/** Databases made before visitor colors existed get the two new columns. Existing rows count as admin colors. */
function addMissingColumns(db) {
  const have = new Set(db.prepare('PRAGMA table_info(colors)').all().map((c) => c.name));
  if (!have.has('source')) {
    db.exec("ALTER TABLE colors ADD COLUMN source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'visitor'))");
  }
  if (!have.has('created_at')) {
    db.exec('ALTER TABLE colors ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
  }
}

function seedIfEmpty(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM colors').get();
  if (n > 0) return;
  const insert = db.prepare('INSERT INTO colors (name, hex) VALUES (?, ?)');
  db.transaction(() => {
    for (const [name, hex] of DEFAULT_COLORS) insert.run(name, hex);
  })();
}

/**
 * Small repository around prepared statements. Every query is parameterized.
 * Colors added by visitors expire after `expireSeconds` and are deleted the next time anything reads the table.
 */
function createColorRepository(db, { expireSeconds = 3 * 24 * 60 * 60 } = {}) {
  const now = () => Math.floor(Date.now() / 1000);
  const columns = 'id, name, hex, source, created_at';
  const purge = db.prepare("DELETE FROM colors WHERE source = 'visitor' AND created_at <= ?");
  const list = db.prepare(`SELECT ${columns} FROM colors ORDER BY id`);
  const get = db.prepare(`SELECT ${columns} FROM colors WHERE id = ?`);
  const count = db.prepare('SELECT COUNT(*) AS n FROM colors');
  const countVisitor = db.prepare("SELECT COUNT(*) AS n FROM colors WHERE source = 'visitor'");
  const insert = db.prepare('INSERT INTO colors (name, hex, source, created_at) VALUES (?, ?, ?, ?)');
  // Saving an edit as admin keeps a visitor color permanently.
  const update = db.prepare("UPDATE colors SET name = ?, hex = ?, source = 'admin' WHERE id = ?");
  const remove = db.prepare('DELETE FROM colors WHERE id = ?');

  const expire = () => purge.run(now() - expireSeconds);
  const shape = (row) =>
    row && {
      id: row.id,
      name: row.name,
      hex: row.hex,
      source: row.source,
      expiresAt: row.source === 'visitor' ? row.created_at + expireSeconds : null,
    };

  return {
    list: () => (expire(), list.all().map(shape)),
    get: (id) => (expire(), shape(get.get(id))),
    count: () => (expire(), count.get().n),
    countVisitor: () => (expire(), countVisitor.get().n),
    create: ({ name, hex }, source = 'admin') => {
      const { lastInsertRowid } = insert.run(name, hex, source, now());
      return shape(get.get(Number(lastInsertRowid)));
    },
    update: (id, { name, hex }) => {
      update.run(name, hex, id);
      return shape(get.get(id));
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
