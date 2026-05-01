'use strict';

/**
 * dbConfig.js -- Database Orchestrator
 *
 * Thin entry point that:
 *   1. Opens the SQLite connection (WAL, FK enforcement, busy timeout).
 *   2. Runs pending schema migrations exactly once via version tracking.
 *   3. Seeds reference data on a fresh database.
 *
 * Exports a transparent Proxy so all existing service files can continue to
 * call db.runTransaction(), db.pRun(), db.pGet(), and db.pAll() without any
 * changes.  The Proxy forwards every property access to the live sqlite3
 * Database instance populated when db.initializeDatabase() resolves.
 *
 * Usage in app.js:
 *   const db = require('../config/dbConfig');
 *   await db.initializeDatabase();  // must complete before app.listen()
 */

const { openDatabase }  = require('./db/connection');
const { runMigrations } = require('./db/migrations/runner');
const { runSeeds }      = require('./db/seeds/runner');

// Populated by initializeDatabase().  Null until then.
let _db = null;

/**
 * Opens the database, applies pending migrations, and seeds a fresh DB.
 * app.js must await this before calling app.listen() so every request
 * handler is guaranteed to see an initialised database.
 *
 * @returns {Promise<void>}
 */
async function initializeDatabase() {
  _db = await openDatabase();

  const { isFreshDb } = await runMigrations(_db);

  // Seeds run when:
  //   a) this is a brand-new database (isFreshDb)
  //   b) a previous startup crash left a 'needs_seed' flag in _db_meta
  const needsSeedRow = await _db.pGet(
    "SELECT value FROM _db_meta WHERE key = 'needs_seed'"
  );
  if (isFreshDb || needsSeedRow) {
    await runSeeds(_db);
  }

  console.log('[DB] Initialization complete');
}

/**
 * Transparent Proxy forwarding all property reads/writes to _db.
 *
 * Why a Proxy and not a plain object?
 *   Service files are required synchronously at module load time, before
 *   initializeDatabase() has been called.  Exporting _db directly would
 *   export null.  The Proxy defers the lookup to call time, by which point
 *   _db is always set (app.js guarantees this by awaiting
 *   initializeDatabase() before app.listen()).
 *
 * Accessing the proxy before initializeDatabase() resolves will throw a
 * clear, actionable error rather than a cryptic "cannot read property of
 * null".
 */
const db = new Proxy(Object.create(null), {
  get(_, prop) {
    if (prop === 'initializeDatabase') return initializeDatabase;
    if (!_db) {
      throw new Error(
        '[DB] Attempted to use the database before initialization. ' +
        'Ensure app.js awaits db.initializeDatabase() before app.listen().'
      );
    }
    const val = _db[prop];
    return typeof val === 'function' ? val.bind(_db) : val;
  },

  set(_, prop, value) {
    if (!_db) throw new Error('[DB] Cannot set property before initialization.');
    _db[prop] = value;
    return true;
  },

  has(_, prop) {
    if (prop === 'initializeDatabase') return true;
    return _db ? prop in _db : false;
  },
});

module.exports = db;
