'use strict';

/**
 * Migration 006 — Metal Purchase tracking column
 * ─────────────────────────────────────────────────
 * Adds total_metal_purchase_value to roj_med_days so the day-close snapshot
 * captures the full value of metal purchased that day (weight × rate / 10),
 * even when payment is partial / deferred.
 *
 * Idempotent: uses addColumnIfMissing pattern.
 */

const description = 'Add total_metal_purchase_value column to roj_med_days for metal purchase tracking';

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
  // Total purchase cost for all METAL_PURCHASE entries in a day.
  // This is the full contract value (weight × rate / 10), not just cash paid.
  // The actual cash paid is already captured in total_cash_out.
  await addColumnIfMissing(db, 'roj_med_days', 'total_metal_purchase_value', 'REAL DEFAULT 0');
}

module.exports = { up, description };
