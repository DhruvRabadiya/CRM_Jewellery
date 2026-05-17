'use strict';

/**
 * Migration 010 — User Permissions
 * ──────────────────────────────────
 * Adds a `permissions` TEXT column to the `users` table.
 * Stored as a JSON array of permission-key strings (e.g. '["view_production","create_jobs"]').
 *
 * ADMIN users always have every permission by virtue of their role — this
 * column is only meaningful for EMPLOYEE-role accounts.
 *
 * The migration is idempotent: it checks for the column before adding it,
 * so replaying it on a database that already has the column is a safe no-op.
 */

const description = 'Add permissions JSON column to users table';

async function up(db) {
  const cols = await db.pAll('PRAGMA table_info("users")');
  if (!cols.some((c) => c.name === 'permissions')) {
    await db.pRun(`ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]'`);
    console.log('[DB] Added users.permissions');
  }
}

module.exports = { description, up };
