'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const { MIN_COLORS, MAX_COLORS, createColorRepository, isUniqueViolation } = require('./db');
const { requireAdmin } = require('./auth');
const {
  VISITOR_NAME_MAX,
  VISITOR_NAME_MIN,
  validateColorInput,
  validateVisitorColorInput,
  parseId,
} = require('./validate');

const DUPLICATE_MESSAGE = 'A color with that name or hex value already exists.';

/** Allows each client address `perDay` successful additions per rolling day. Kept in memory. */
function createDailyQuota(perDay, dayMs = 24 * 60 * 60 * 1000) {
  const seen = new Map();
  return {
    take(key) {
      const now = Date.now();
      for (const [k, v] of seen) if (now - v.start >= dayMs) seen.delete(k);
      const entry = seen.get(key) ?? { start: now, count: 0 };
      if (entry.count >= perDay) return false;
      entry.count += 1;
      seen.set(key, entry);
      return true;
    },
  };
}

/**
 * Build the Express app.
 *
 * @param {object} options
 * @param {import('better-sqlite3').Database} options.db
 * @param {string} [options.adminToken]  Required for POST, PUT and DELETE. Unset = read-only.
 * @param {string} [options.staticDir]   Built Angular app to serve (optional).
 * @param {boolean|number|string} [options.trustProxy]  Express "trust proxy" setting.
 * @param {{enabled?: boolean, maxColors?: number, perDay?: number, expireSeconds?: number}} [options.visitor]
 *        Visitors (no admin key) may add colors when enabled. Off by default.
 * @param {string} [options.contactEmail]  Shown to visitors when the list is full.
 * @param {boolean} [options.production]
 * @param {{readLimit?: number, writeLimit?: number, windowMs?: number}} [options.limits]
 * @param {(err: Error) => void} [options.logError]
 */
function createApp({
  db,
  adminToken = '',
  staticDir = '',
  trustProxy = false,
  production = false,
  limits = {},
  visitor = {},
  contactEmail = '',
  logError = (err) => console.error(err),
}) {
  const visitorRules = {
    enabled: Boolean(visitor.enabled),
    maxColors: visitor.maxColors ?? 10,
    perDay: visitor.perDay ?? 3,
    expireSeconds: visitor.expireSeconds ?? 3 * 24 * 60 * 60,
  };
  const colors = createColorRepository(db, { expireSeconds: visitorRules.expireSeconds });
  const dayQuota = createDailyQuota(visitorRules.perDay);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          // Angular injects component styles at runtime, which needs inline styles.
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': production ? [] : null,
        },
      },
      hsts: production,
    }),
  );

  const windowMs = limits.windowMs ?? 15 * 60 * 1000;
  const tooMany = { error: 'Too many requests. Please try again later.' };
  const readLimiter = rateLimit({
    windowMs,
    limit: limits.readLimit ?? 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: tooMany,
  });
  const writeLimiter = rateLimit({
    windowMs,
    limit: limits.writeLimit ?? 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: tooMany,
    skip: (req) => req.method === 'GET' || req.method === 'HEAD',
  });

  const api = express.Router();
  api.use(readLimiter);
  api.use(writeLimiter);
  api.use(express.json({ limit: '2kb' }));
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const admin = requireAdmin(adminToken);

  api.get('/health', (_req, res) => res.json({ status: 'ok' }));

  api.get('/config', (_req, res) =>
    res.json({
      editingEnabled: Boolean(adminToken),
      minColors: MIN_COLORS,
      maxColors: MAX_COLORS,
      publicAdding: visitorRules.enabled,
      contactEmail,
      visitorLimits: {
        maxColors: visitorRules.maxColors,
        perDay: visitorRules.perDay,
        expireSeconds: visitorRules.expireSeconds,
        nameMin: VISITOR_NAME_MIN,
        nameMax: VISITOR_NAME_MAX,
      },
    }),
  );

  api.get('/colors', (_req, res) => res.json(colors.list()));

  const createAsAdmin = (req, res) => {
    const { value, error } = validateColorInput(req.body);
    if (error) return res.status(400).json({ error });
    if (colors.count() >= MAX_COLORS) {
      return res.status(409).json({ error: `The color list is limited to ${MAX_COLORS} colors.` });
    }
    try {
      return res.status(201).json(colors.create(value, 'admin'));
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: DUPLICATE_MESSAGE });
      throw err;
    }
  };

  const createAsVisitor = (req, res) => {
    const { value, error } = validateVisitorColorInput(req.body);
    if (error) return res.status(400).json({ error });
    if (colors.countVisitor() >= visitorRules.maxColors || colors.count() >= MAX_COLORS) {
      return res.status(409).json({
        error: 'The visitor color list is full right now. Visitor colors are removed automatically, so please try again later.',
      });
    }
    if (!dayQuota.take(req.ip)) {
      return res
        .status(429)
        .json({ error: `You can add up to ${visitorRules.perDay} colors per day. Please try again tomorrow.` });
    }
    try {
      return res.status(201).json(colors.create(value, 'visitor'));
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: DUPLICATE_MESSAGE });
      throw err;
    }
  };

  // With an admin key: the normal admin rules. Without one: a visitor submission, if that is switched on.
  api.post('/colors', (req, res, next) => {
    if (req.get('x-admin-key') || !visitorRules.enabled) {
      return admin(req, res, () => createAsAdmin(req, res));
    }
    return createAsVisitor(req, res, next);
  });

  api.put('/colors/:id', admin, (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid color id.' });
    if (!colors.get(id)) return res.status(404).json({ error: 'Color not found.' });
    const { value, error } = validateColorInput(req.body);
    if (error) return res.status(400).json({ error });
    try {
      return res.json(colors.update(id, value));
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: DUPLICATE_MESSAGE });
      throw err;
    }
  });

  api.delete('/colors/:id', admin, (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid color id.' });
    if (!colors.get(id)) return res.status(404).json({ error: 'Color not found.' });
    if (colors.count() <= MIN_COLORS) {
      return res.status(409).json({ error: `You must keep at least ${MIN_COLORS} colors.` });
    }
    colors.remove(id);
    return res.sendStatus(204);
  });

  api.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/api', api);

  const indexFile = staticDir ? path.join(staticDir, 'index.html') : '';
  if (indexFile && fs.existsSync(indexFile)) {
    app.use(
      express.static(staticDir, {
        index: false,
        dotfiles: 'ignore',
        setHeaders(res, filePath) {
          // Hashed build assets can be cached forever. Everything else revalidates.
          const hashed = /-[A-Z0-9]{8}\.(js|css|woff2?)$/.test(filePath);
          res.set('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    // Single-page-app fallback for client-side routes (GET only).
    app.get('/{*splat}', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(indexFile);
    });
  }

  // Error handler: never leak internals to the client.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body is not valid JSON.' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    logError(err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}

module.exports = { createApp };
