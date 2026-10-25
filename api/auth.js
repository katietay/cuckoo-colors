'use strict';

const crypto = require('node:crypto');

const MIN_TOKEN_LENGTH = 16;

function digest(value) {
  return crypto.createHash('sha256').update(value).digest();
}

/** Constant-time string comparison (hashing first makes the lengths equal). */
function safeEqual(a, b) {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

/**
 * Middleware that protects write routes.
 *  - No token configured: editing is disabled (secure by default).
 *  - Otherwise the request needs the header "X-Admin-Key: <token>".
 *    (A custom header is used because shared Apache hosts often strip "Authorization".)
 */
function requireAdmin(adminToken) {
  return (req, res, next) => {
    if (!adminToken) {
      return res.status(503).json({ error: 'Editing is disabled on this server.' });
    }
    const key = req.get('x-admin-key') || '';
    if (!key || !safeEqual(key, adminToken)) {
      return res.status(401).json({ error: 'A valid admin key is required.' });
    }
    next();
  };
}

module.exports = { MIN_TOKEN_LENGTH, requireAdmin, safeEqual };
