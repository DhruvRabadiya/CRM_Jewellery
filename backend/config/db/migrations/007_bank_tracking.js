'use strict';

/**
 * Migration 007 — Bank / UPI balance tracking on roj_med_days
 * ─────────────────────────────────────────────────────────────
 * Adds four columns so the daily accounting ledger tracks cash and bank
 * balances independently:
 *
 *   opening_bank   — Bank balance at start of day (carried from previous closing_bank)
 *   closing_bank   — Bank balance at end of day (computed / snapshotted at day-close)
 *   total_bank_in  — Total inflows via Bank / UPI mode for the day
 *   total_bank_out — Total outflows via Bank / UPI mode for the day
 *
 * The existing opening_cash / closing_cash / total_cash_in / total_cash_out
 * columns now exclusively represent Cash-mode transactions (semantics narrowed
 * from "all modes" to "cash-only").  Existing closed-day rows are fine since
 * historical entries were almost certainly cash-mode.
 *
 * Idempotent: uses addColumnIfMissing throughout.
 */

const description = 'Add bank balance tracking columns (opening_bank, closing_bank, total_bank_in, total_bank_out) to roj_med_days';

async function getColumns(db, table) {
  try {
    return await db.pAll(`PRAGMA table_info("${table}")`);
  } catch (_) {
    return [];
  }
}

async function addColumnIfMissing(db, table, column, definition) {
  const cols = await getColumns(db, table);
  if (!cols.some(c => c.name === column)) {
    await db.pRun(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition}`);
    console.log(`[DB] Added ${table}.${column}`);
  }
}

async function up(db) {
  await addColumnIfMissing(db, 'roj_med_days', 'opening_bank',   'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'roj_med_days', 'closing_bank',   'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'roj_med_days', 'total_bank_in',  'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'roj_med_days', 'total_bank_out', 'REAL DEFAULT 0');
}

module.exports = { up, description };
