'use strict';

const bcrypt = require('bcryptjs');

/**
 * Seed: users
 * ────────────
 * Creates the default admin account.
 *
 * Password source (in priority order):
 *   1. DEFAULT_ADMIN_PASSWORD environment variable
 *   2. Hardcoded fallback 'admin123'
 *
 * In production always set DEFAULT_ADMIN_PASSWORD to a strong value.
 * INSERT OR IGNORE makes this seed idempotent.
 */
module.exports = async function seedUsers(db) {
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

  if (!process.env.DEFAULT_ADMIN_PASSWORD) {
    console.warn(
      "[Seed] WARNING: DEFAULT_ADMIN_PASSWORD is not set. " +
      "Using 'admin123'. Set DEFAULT_ADMIN_PASSWORD in .env for production."
    );
  }

  const salt   = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(defaultPassword, salt);

  await db.pRun(
    `INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, 'ADMIN')`,
    ['admin', hashed]
  );
  console.log('[Seed] users — default admin inserted');
};
