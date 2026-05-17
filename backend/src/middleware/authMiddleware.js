'use strict';

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Use environment variable for JWT secret.  If not set in production, generate
// a random one per process instance — tokens will not survive restarts, which
// is intentional to nudge operators toward setting JWT_SECRET properly.
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  logger.warn(
    'JWT_SECRET env var is not set. ' +
    'Using a per-process random secret — tokens will not survive restarts. ' +
    'Set JWT_SECRET in your .env file for production.'
  );
  return crypto.randomBytes(32).toString('hex');
})();

// ─── Bearer token extractor ───────────────────────────────────────────────────

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access Denied: No Authentication Token Provided' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET); // { id, username, role, permissions }
    next();
  } catch {
    return res.status(403).json({ error: 'Access Denied: Invalid or Expired Token' });
  }
};

// ─── Role guard ───────────────────────────────────────────────────────────────

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access Denied: Requires Administrator Privileges' });
  }
  next();
};

// ─── Permission guard factory ─────────────────────────────────────────────────
/**
 * Returns Express middleware that allows the request only when the authenticated
 * user holds `permissionKey` (or is an ADMIN, who always passes).
 *
 * Usage:
 *   router.delete('/jobs/:id', authenticateToken, requirePermission('delete_jobs'), handler);
 *
 * @param {string} permissionKey  — one of the values from backend/src/utils/permissions.js
 */
const requirePermission = (permissionKey) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Access Denied: Not authenticated' });
  }
  // ADMIN always has every permission
  if (req.user.role === 'ADMIN') return next();

  const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
  if (!perms.includes(permissionKey)) {
    return res.status(403).json({
      error: `Access Denied: Missing permission '${permissionKey}'`,
      code:  'INSUFFICIENT_PERMISSIONS',
    });
  }
  next();
};

module.exports = { authenticateToken, requireAdmin, requirePermission, JWT_SECRET };
