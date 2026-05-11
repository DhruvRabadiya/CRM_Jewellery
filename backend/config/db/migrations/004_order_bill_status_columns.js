'use strict';

/**
 * Migration 004 — Order bill status columns
 *
 * Adds the three columns introduced by the Pending/Ready/Delivered status
 * workflow refactor.  Uses addColumnIfMissing so this is safe to apply to
 * any existing database regardless of how it was originally created.
 *
 * Fresh databases already get these columns via migration 001's
 * addColumnIfMissing block, but existing databases that ran through
 * schema_version 1–3 before these columns were added need this migration
 * to catch up.
 */

const description = 'Add bill_type, delivery_date, order_status to order_bills';

async function addColumnIfMissing(db, table, column, definition) {
  const columns = await db.pAll(`PRAGMA table_info(${table})`);
  const exists  = columns.some((c) => c.name === column);
  if (!exists) {
    await db.pRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[DB] Added column ${table}.${column}`);
  }
}

async function up(db) {
  await addColumnIfMissing(db, 'order_bills', 'bill_type',     "TEXT DEFAULT 'estimate'");
  await addColumnIfMissing(db, 'order_bills', 'delivery_date', "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'order_bills', 'order_status',  "TEXT DEFAULT 'Ready'");
  await addColumnIfMissing(db, 'order_bills', 'round_off',     'REAL DEFAULT 0');

  // One-time data fix: any existing estimate rows that have order_status =
  // 'Pending' because of the old (incorrect) default should be reset to
  // 'Ready' so stock behaviour is correct for pre-existing records.
  await db.pRun(`
    UPDATE order_bills
       SET order_status = 'Ready'
     WHERE order_status = 'Pending'
       AND (bill_type = 'estimate' OR bill_type IS NULL OR bill_type = '')
  `);
}

module.exports = { up, description };
