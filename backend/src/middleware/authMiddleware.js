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
    req.user = jwt.verify(token, JWT_SECRET); // { id, username, role }
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

module.exports = { authenticateToken, requireAdmin, JWT_SECRET };
