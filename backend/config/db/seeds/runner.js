'use strict';

/**
 * Seed Runner
 * ───────────
 * Runs all seed modules in order.  Called only when the database was freshly
 * created (isFreshDb === true), OR when a 'needs_seed' flag is found in
 * _db_meta (crash-recovery path where migrations completed but seeds didn't).
 *
 * Each seed uses INSERT OR IGNORE, so the runner is idempotent — safe to call
 * again if a previous attempt was interrupted partway through.
 *
 * After all seeds succeed the 'needs_seed' flag is removed from _db_meta so
 * seeds do not run again on subsequent startups.
 *
 * @param {import('sqlite3').Database} db
 */

const seedStockMaster    = require('./01_stock_master');
const seedUsers          = require('./02_users');
const seedLabourCharges  = require('./03_labour_charges');
const seedObRates        = require('./04_ob_labour_rates');

async function runSeeds(db) {
  console.log('[DB] Seeding fresh database...');

  await seedStockMaster(db);
  await seedUsers(db);
  await seedLabourCharges(db);
  await seedObRates(db);

  // Clear the flag so seeds do not re-run on the next startup.
  await db.pRun(`DELETE FROM _db_meta WHERE key = 'needs_seed'`);

  console.log('[DB] Seeds applied ✓');
}

module.exports = { runSeeds };
