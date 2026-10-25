'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { openDatabase } = require('./db');
const { createApp } = require('./app');
const { MIN_TOKEN_LENGTH } = require('./auth');

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1');
const databasePath = path.resolve(root, process.env.DATABASE_PATH || 'data/colors.db');
const staticDir = path.resolve(root, process.env.STATIC_DIR || 'dist/cuckoo-colors/browser');
const adminToken = process.env.ADMIN_TOKEN || '';

if (adminToken && adminToken.length < MIN_TOKEN_LENGTH) {
  console.error(`ADMIN_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters. Run "npm run token" to make one.`);
  process.exit(1);
}

function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

const db = openDatabase(databasePath);
const app = createApp({
  db,
  adminToken,
  staticDir,
  production,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  limits: {
    // Optional overrides, mainly for tests.
    writeLimit: Number(process.env.WRITE_RATE_LIMIT) || undefined,
    readLimit: Number(process.env.READ_RATE_LIMIT) || undefined,
  },
});

const server = app.listen(port, host, () => {
  console.log(`Cuckoo Colors listening on http://${host}:${port}`);
  console.log(adminToken ? 'Editing: enabled (admin key required)' : 'Editing: disabled (set ADMIN_TOKEN to enable)');
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
