'use strict';

/**
 * DB Connection Layer
 * ──────────────────
 * Single responsibility: open the SQLite file, enable runtime pragmas,
 * attach promise helpers, and expose the raw db instance.
 *
 * NOTHING in this file creates tables, runs migrations, or inserts data.
 */

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');
const os      = require('os');

// ─── Path resolution ─────────────────────────────────────────────────────────

/**
 * Resolves the absolute path for the database file.
 *
 * Priority:
 *   1. DB_PATH env var — if it is already absolute (Electron production sets
 *      this to app.getPath('userData') + '/jewelry.db').
 *   2. OS user-data directory so the file is NEVER inside the project tree
 *      and therefore can NEVER be accidentally bundled.
 *
 * A 'dev' sub-folder is used in development so dev and production data are
 * always isolated even on the same machine.
 */
function resolveDbPath() {
  const envPath = process.env.DB_PATH;

  if (envPath && path.isAbsolute(envPath)) {
    return envPath;
  }

  // OS user-data root (cross-platform)
  const base =
    process.env.APPDATA                               // Windows  (%AppData%\Roaming)
    || process.env.XDG_DATA_HOME                     // Linux (explicit XDG)
    || path.join(os.homedir(), '.local', 'share');   // Linux / macOS fallback

  const appDir = path.join(base, 'JewelCRM');
  const dbDir  = process.env.NODE_ENV === 'development'
    ? path.join(appDir, 'dev')
    : appDir;

  return path.join(dbDir, 'jewelry.db');
}

// ─── Connection factory ───────────────────────────────────────────────────────

/**
 * Opens (or creates) the SQLite database.
 *
 * - Creates the parent directory if it does not exist.
 * - Enables WAL journal mode, foreign-key enforcement, and a busy timeout.
 * - Attaches promise helpers (pRun, pGet, pAll, runTransaction).
 * - Resolves only after all startup PRAGMAs have been applied.
 *
 * @returns {Promise<sqlite3.Database>}
 */
function openDatabase() {
  const dbPath = resolveDbPath();
  const dbDir  = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`[DB] Created data directory: ${dbDir}`);
  }

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (openErr) => {
      if (openErr) {
        return reject(
          new Error(`Failed to open database at "${dbPath}": ${openErr.message}`)
        );
      }

      console.log(`[DB] Connected → ${dbPath}`);
      attachPromiseHelpers(db);

      // WAL mode, FK enforcement, and lock-wait timeout.
      // Must be applied on every new connection; can't be stored in the DB.
      // db.serialize() guarantees sequential execution; we resolve only after
      // the final PRAGMA callback fires, so all settings are active before
      // any migration or seed code runs.
      db.serialize(() => {
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA foreign_keys = ON');
        db.run('PRAGMA busy_timeout = 5000');
        db.run('PRAGMA synchronous = NORMAL', (pragmaErr) => {
          if (pragmaErr) return reject(pragmaErr);
          resolve(db);
        });
      });
    });
  });
}

// ─── Promise helpers ──────────────────────────────────────────────────────────

/**
 * Attaches promise-based method wrappers directly onto the db instance.
 *
 *   db.pRun(sql, params)   → Promise<{ lastID, changes }>
 *   db.pGet(sql, params)   → Promise<row | undefined>
 *   db.pAll(sql, params)   → Promise<row[]>
 *   db.runTransaction(fn)  → Promise<result>
 *
 * runTransaction preserves the original two-argument signature used by all
 * existing service files: fn(run, get) where run/get are promise wrappers.
 */
function attachPromiseHelpers(db) {
  db.pRun = (sql, params = []) =>
    new Promise((resolve, reject) =>
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      })
    );

  db.pGet = (sql, params = []) =>
    new Promise((resolve, reject) =>
      db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      })
    );

  db.pAll = (sql, params = []) =>
    new Promise((resolve, reject) =>
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      })
    );

  /**
   * Backward-compatible transaction helper used throughout the services.
   * fn receives (run, get) — the same promise wrappers — so existing callers
   * do not need to change.
   */
  db.runTransaction = (fn) =>
    new Promise((resolve, reject) => {
      db.run('BEGIN IMMEDIATE TRANSACTION', async (beginErr) => {
        if (beginErr) return reject(beginErr);
        try {
          const result = await fn(db.pRun, db.pGet);
          db.run('COMMIT', (commitErr) => {
            if (commitErr) return reject(commitErr);
            resolve(result);
          });
        } catch (txErr) {
          db.run('ROLLBACK', () => reject(txErr));
        }
      });
    });
}

module.exports = { openDatabase, resolveDbPath };
