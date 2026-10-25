'use strict';

// Starts a backend, runs the contract tests against it, then stops it.
//   node contract/run.js node     (Express + SQLite)
//   node contract/run.js php      (PHP + SQLite via the built-in server)
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');

const backend = process.argv[2];
if (!['node', 'php'].includes(backend)) {
  console.error('Usage: node contract/run.js <node|php>');
  process.exit(2);
}
const root = path.resolve(__dirname, '..');
const KEY = 'contract-test-key-0123456789abcdef';

// Ask the OS for a free port instead of guessing one, so parallel jobs and busy runners cannot collide.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(base, anyStatus = false) {
  for (let i = 0; i < 300; i++) {
    try {
      const res = await fetch(base + '/api/health');
      if (res.ok || anyStatus) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${backend} server did not start`);
}

async function withServer(name, { key = KEY, writeLimit, brokenDb = false, visitor } = {}, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cc-${backend}-`));
  const port = await freePort();
  const env = { ...process.env };
  // Log to a file: the runner blocks while tests run, so a pipe could fill up and stall the server.
  const logFile = path.join(dir, 'server.log');
  const log = fs.openSync(logFile, 'w');
  const stdio = ['ignore', log, log];
  let child;
  if (backend === 'node') {
    Object.assign(env, { PORT: String(port), DATABASE_PATH: path.join(dir, 'c.db'), ADMIN_TOKEN: key, NODE_ENV: 'test' });
    if (writeLimit) env.WRITE_RATE_LIMIT = String(writeLimit);
    if (visitor) {
      Object.assign(env, {
        PUBLIC_ADD: '1',
        VISITOR_DAILY_LIMIT: String(visitor.perDay),
        VISITOR_MAX_COLORS: String(visitor.maxColors),
        VISITOR_EXPIRE_SECONDS: String(visitor.expireSeconds),
        CONTACT_EMAIL: 'hello@example.com',
      });
    }
    child = spawn(process.execPath, ['api/index.js'], { cwd: root, env, stdio });
  } else {
    Object.assign(env, { CC_DB_DSN: brokenDb ? `sqlite:${path.join(dir, 'missing', 'c.db')}` : `sqlite:${path.join(dir, 'c.db')}`, CC_ADMIN_TOKEN: key });
    if (writeLimit) env.CC_WRITE_LIMIT = String(writeLimit);
    if (visitor) {
      Object.assign(env, {
        CC_PUBLIC_ADD: '1',
        CC_VISITOR_DAILY_LIMIT: String(visitor.perDay),
        CC_VISITOR_MAX_COLORS: String(visitor.maxColors),
        CC_VISITOR_EXPIRE_SECONDS: String(visitor.expireSeconds),
        CC_CONTACT_EMAIL: 'hello@example.com',
      });
    }
    child = spawn('php', ['-S', `127.0.0.1:${port}`, 'php/dev-router.php'], { cwd: root, env, stdio });
  }
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitFor(base, brokenDb);
    console.log(`\n== ${backend}: ${name} (${base})`);
    return run(base);
  } catch (err) {
    console.error(fs.readFileSync(logFile, 'utf8'));
    throw err;
  } finally {
    child.kill();
    fs.closeSync(log);
  }
}

function runTests(files, extraEnv) {
  const result = spawnSync(process.execPath, ['--test', ...files.map((f) => path.join(__dirname, f))], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  return result.status ?? 1;
}

(async () => {
  let failed = 0;
  failed += await withServer('main', { writeLimit: 100000 }, (base) =>
    runTests(['api.contract.test.js'], { API_BASE: base, ADMIN_TOKEN: KEY, API_DESTRUCTIVE: '1' }),
  );
  failed += await withServer('rate limit', { writeLimit: 3 }, (base) =>
    runTests(['ratelimit.contract.test.js'], { API_BASE: base, ADMIN_TOKEN: KEY, RATE_LIMIT_EXPECT: '3' }),
  );
  failed += await withServer('read-only', { key: '' }, (base) =>
    runTests(['readonly.contract.test.js'], { API_BASE: base, ADMIN_TOKEN: KEY, READONLY_EXPECT: '1' }),
  );
  // Visitor adding is off unless switched on, so each rule gets its own server with its own limits.
  const visitorRuns = [
    ['rules', { perDay: 100, maxColors: 200, expireSeconds: 3600 }],
    ['quota', { perDay: 2, maxColors: 200, expireSeconds: 3600 }],
    ['cap', { perDay: 100, maxColors: 2, expireSeconds: 3600 }],
    ['expiry', { perDay: 100, maxColors: 200, expireSeconds: 2 }],
  ];
  for (const [mode, visitor] of visitorRuns) {
    failed += await withServer(`visitor adds: ${mode}`, { writeLimit: 100000, visitor }, (base) =>
      runTests(['public.contract.test.js'], { API_BASE: base, ADMIN_TOKEN: KEY, PUBLIC_MODE: mode }),
    );
  }
  if (backend === 'php') {
    failed += await withServer('broken database', { brokenDb: true }, (base) =>
      runTests(['failure.contract.test.js'], { API_BASE: base, ADMIN_TOKEN: KEY, FAILURE_EXPECT: '1' }),
    );
  }
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
