'use strict';

/**
 * Migration 005 — Roj Med (Daily Accounting)
 * ────────────────────────────────────────────
 * Two tables:
 *
 *  roj_med_days
 *    One row per calendar date.  Tracks open/closed status and carries
 *    opening + closing cash/metal balances so each day continues from
 *    where the previous one ended.
 *
 *  roj_med_entries
 *    Individual debit/credit lines within a day.
 *    Types: CASH_IN | CASH_OUT | METAL_IN | METAL_OUT | EXPENSE | COUNTER_SALE
 *    Optionally linked to a customer (party_id → customers.id).
 *    Optionally linked to an order_bill or selling_bill (reference_type / reference_id).
 *
 * Both tables are idempotent (CREATE IF NOT EXISTS + addColumnIfMissing).
 */

const description = 'Create roj_med_days and roj_med_entries tables (daily accounting / Roj Med)';

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

  // ── 1. roj_med_days ──────────────────────────────────────────────────────
  // One row per business day.  Status: OPEN (editable) → CLOSED (locked).
  // Opening balances are copied from previous day's closing balances on creation.
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS roj_med_days (
      id                      INTEGER  PRIMARY KEY AUTOINCREMENT,
      day_date                TEXT     UNIQUE NOT NULL,          -- YYYY-MM-DD
      status                  TEXT     NOT NULL DEFAULT 'OPEN',  -- OPEN | CLOSED

      -- Opening balances (carried from previous day's closing)
      opening_cash            REAL     DEFAULT 0,
      opening_metal_gold24k   REAL     DEFAULT 0,
      opening_metal_gold22k   REAL     DEFAULT 0,
      opening_metal_silver    REAL     DEFAULT 0,

      -- Closing balances (computed at day-close, stored for carry-forward)
      closing_cash            REAL     DEFAULT 0,
      closing_metal_gold24k   REAL     DEFAULT 0,
      closing_metal_gold22k   REAL     DEFAULT 0,
      closing_metal_silver    REAL     DEFAULT 0,

      -- Totals snapshot written at day-close
      total_cash_in           REAL     DEFAULT 0,
      total_cash_out          REAL     DEFAULT 0,
      total_metal_in_gold24k  REAL     DEFAULT 0,
      total_metal_out_gold24k REAL     DEFAULT 0,
      total_metal_in_gold22k  REAL     DEFAULT 0,
      total_metal_out_gold22k REAL     DEFAULT 0,
      total_metal_in_silver   REAL     DEFAULT 0,
      total_metal_out_silver  REAL     DEFAULT 0,
      total_expenses          REAL     DEFAULT 0,
      total_counter_sales     REAL     DEFAULT 0,

      notes                   TEXT     DEFAULT '',
      closed_at               DATETIME,
      created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Future-proof column additions
  await addColumnIfMissing(db, 'roj_med_days', 'notes',    "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'roj_med_days', 'closed_at','DATETIME');

  // ── 2. roj_med_entries ───────────────────────────────────────────────────
  // Individual debit/credit lines within a day.
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS roj_med_entries (
      id              INTEGER  PRIMARY KEY AUTOINCREMENT,
      day_id          INTEGER  NOT NULL REFERENCES roj_med_days(id) ON DELETE CASCADE,
      entry_date      TEXT     NOT NULL,           -- YYYY-MM-DD (denormalized for fast queries)
      entry_time      TEXT     DEFAULT '',         -- HH:MM optional
      sort_order      INTEGER  DEFAULT 0,

      -- Entry classification
      entry_type      TEXT     NOT NULL,
      -- CASH_IN   : money received (from customer/sale/other)
      -- CASH_OUT  : money paid out (to supplier/expense/etc.)
      -- METAL_IN  : metal received (from customer as payment / return)
      -- METAL_OUT : metal given out (to customer / sent for work)
      -- EXPENSE   : operating expense (labour, rent, electricity, etc.)
      -- COUNTER_SALE : sale at counter (links to order_bill)

      -- Party (optional)
      party_id        INTEGER  REFERENCES customers(id) ON DELETE SET NULL,
      party_name      TEXT     DEFAULT '',         -- denormalized snapshot

      -- Cash / monetary fields
      payment_mode    TEXT     DEFAULT 'Cash',     -- Cash | Bank/UPI | Other
      amount          REAL     DEFAULT 0,          -- positive value; direction is entry_type

      -- Metal fields (only for METAL_IN / METAL_OUT)
      metal_type      TEXT     DEFAULT '',         -- Gold 24K | Gold 22K | Silver
      metal_purity    TEXT     DEFAULT '',
      metal_weight    REAL     DEFAULT 0,          -- grams
      metal_rate      REAL     DEFAULT 0,          -- ₹ per 10g (for valuation)
      metal_value     REAL     DEFAULT 0,          -- computed: weight * rate / 10

      -- Expense sub-type (only for EXPENSE)
      expense_category TEXT    DEFAULT '',         -- Labour | Rent | Electricity | Travel | Other

      -- Reference linkage
      reference_type  TEXT     DEFAULT '',         -- order_bill | selling_bill | manual
      reference_id    INTEGER,
      reference_no    TEXT     DEFAULT '',

      notes           TEXT     DEFAULT '',
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Index for fast day-based lookups
  await db.pRun(`
    CREATE INDEX IF NOT EXISTS idx_roj_med_entries_day_id
    ON roj_med_entries(day_id)
  `);
  await db.pRun(`
    CREATE INDEX IF NOT EXISTS idx_roj_med_entries_entry_date
    ON roj_med_entries(entry_date)
  `);
  await db.pRun(`
    CREATE INDEX IF NOT EXISTS idx_roj_med_entries_party_id
    ON roj_med_entries(party_id)
  `);

  // Future-proof column additions
  await addColumnIfMissing(db, 'roj_med_entries', 'entry_time',        "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'roj_med_entries', 'expense_category',  "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'roj_med_entries', 'metal_purity',      "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'roj_med_entries', 'metal_rate',        'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'roj_med_entries', 'metal_value',       'REAL DEFAULT 0');
}

module.exports = { up, description };
