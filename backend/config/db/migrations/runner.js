'use strict';

/**
 * Migration Runner
 * ────────────────
 * Detects whether this is a brand-new database, creates the _db_meta
 * version-tracking table if needed, then runs every pending migration in
 * version order — each in its own transaction so a crash leaves the version
 * counter and schema in a consistent state.
 *
 * Returns { isFreshDb } so the caller can decide whether to seed.
 * Also writes a 'needs_seed' flag to _db_meta on a fresh DB so that seeds
 * still run even if the process crashes between migrations.
 */

const MIGRATIONS = [
  require('./001_base_schema'),
  require('./002_data_fixes'),
  require('./003_backfills'),
];

const CURRENT_VERSION = MIGRATIONS.length; // 3

/**
 * @param {import('sqlite3').Database} db  opened, pragma-configured db instance
 * @returns {Promise<{ isFreshDb: boolean }>}
 */
async function runMigrations(db) {
  // ── 1. Detect fresh database BEFORE touching _db_meta ────────────────────
  // A "fresh" DB has zero user tables.  We exclude sqlite internals and the
  // version-tracker itself so a previous partial initialisation (where only
  // _db_meta was created) is still treated as fresh.
  const userTables = await db.pAll(
    `SELECT name
       FROM sqlite_master
      WHERE type  = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name != '_db_meta'`
  );
  const isFreshDb = userTables.length === 0;

  // ── 2. Create version-tracking table (autocommit — outside any migration tx)
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS _db_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // ── 3. Persist the fresh-DB flag so seeds can run even after a crash ──────
  if (isFreshDb) {
    await db.pRun(
      `INSERT OR IGNORE INTO _db_meta (key, value) VALUES ('needs_seed', '1')`
    );
  }

  // ── 4. Read current schema version (0 = legacy DB with no version row) ────
  const versionRow = await db.pGet(
    `SELECT value FROM _db_meta WHERE key = 'schema_version'`
  );
  const currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;

  if (currentVersion >= CURRENT_VERSION) {
    console.log(`[DB] Schema up to date (v${currentVersion})`);
    return { isFreshDb };
  }

  // ── 5. Apply every pending migration, each in its own transaction ─────────
  for (let i = currentVersion; i < CURRENT_VERSION; i++) {
    const migration = MIGRATIONS[i];
    const version   = i + 1;

    console.log(`[DB] Applying migration ${version}: ${migration.description}`);

    await db.pRun('BEGIN IMMEDIATE TRANSACTION');
    try {
      await migration.up(db);
      await db.pRun(
        `INSERT OR REPLACE INTO _db_meta (key, value) VALUES ('schema_version', ?)`,
        [String(version)]
      );
      await db.pRun('COMMIT');
      console.log(`[DB] Migration ${version} applied ✓`);
    } catch (err) {
      try { await db.pRun('ROLLBACK'); } catch (_) { /* swallow rollback errors */ }
      throw new Error(`[DB] Migration ${version} failed: ${err.message}`);
    }
  }

  return { isFreshDb };
}

module.exports = { runMigrations };
