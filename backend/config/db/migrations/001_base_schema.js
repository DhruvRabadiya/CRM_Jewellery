'use strict';

/**
 * Migration 001 — Base Schema
 * ────────────────────────────
 * Creates all 24 application tables using CREATE TABLE IF NOT EXISTS (safe
 * no-op on existing databases), then adds any columns that were introduced via
 * incremental ALTER TABLE migrations in the old monolithic dbConfig.js.
 *
 * This migration is fully idempotent:
 *   • Fresh DB  → creates every table with its full, current schema.
 *   • Existing  → CREATE IF NOT EXISTS is a no-op; addColumnIfMissing adds
 *                 only the columns that are actually absent.
 *
 * Special case: labour_charges had an incompatible schema in early versions.
 * If the old schema is detected (missing size_label / lc_pp_retail), the old
 * table is renamed, the new one is created, and seed data is inserted here
 * (the seed runner only fires on truly fresh DBs, so we must seed inline for
 * this migration path).
 */

const description = 'Create all tables and add any missing columns (idempotent)';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns PRAGMA table_info() rows.  Empty array if the table does not exist. */
async function getColumns(db, table) {
  try {
    return await db.pAll(`PRAGMA table_info("${table}")`);
  } catch (_) {
    return [];
  }
}

/** Adds a column to a table only when it is not already present. */
async function addColumnIfMissing(db, table, column, definition) {
  const cols = await getColumns(db, table);
  if (!cols.some(c => c.name === column)) {
    await db.pRun(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition}`);
    console.log(`[DB] Added ${table}.${column}`);
  }
}

// ─── Up ───────────────────────────────────────────────────────────────────────

async function up(db) {

  // ── 1. stock_master ───────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS stock_master (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      metal_type       TEXT    UNIQUE,
      opening_stock    REAL    DEFAULT 0,
      rolling_stock    REAL    DEFAULT 0,
      press_stock      REAL    DEFAULT 0,
      tpp_stock        REAL    DEFAULT 0,
      total_loss       REAL    DEFAULT 0,
      inprocess_weight REAL    DEFAULT 0
    )
  `);
  await addColumnIfMissing(db, 'stock_master', 'total_loss',        'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'stock_master', 'inprocess_weight',  'REAL DEFAULT 0');

  // ── 2. stock_transactions ─────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS stock_transactions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      date             TEXT    DEFAULT CURRENT_TIMESTAMP,
      metal_type       TEXT,
      transaction_type TEXT,
      weight           REAL,
      description      TEXT,
      reference_type   TEXT    DEFAULT '',
      reference_id     INTEGER
    )
  `);
  await addColumnIfMissing(db, 'stock_transactions', 'reference_type', "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'stock_transactions', 'reference_id',   'INTEGER');

  // ── 3. melting_process ────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS melting_process (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      job_number     TEXT,
      job_name       TEXT,
      metal_type     TEXT,
      unit           TEXT     DEFAULT 'g',
      issue_weight   REAL,
      issued_weight  REAL     DEFAULT 0,
      issue_size     REAL     DEFAULT 0,
      issue_pieces   REAL     DEFAULT 0,
      return_weight  REAL     DEFAULT 0,
      return_pieces  REAL     DEFAULT 0,
      scrap_weight   REAL     DEFAULT 0,
      loss_weight    REAL     DEFAULT 0,
      category       TEXT     DEFAULT '',
      description    TEXT     DEFAULT '',
      employee       TEXT     DEFAULT 'Unknown',
      status         TEXT     DEFAULT 'RUNNING',
      created_at     TEXT     DEFAULT CURRENT_TIMESTAMP,
      completed_at   TEXT,
      start_time     DATETIME,
      end_time       DATETIME
    )
  `);
  await addColumnIfMissing(db, 'melting_process', 'job_number',    'TEXT');
  await addColumnIfMissing(db, 'melting_process', 'job_name',      'TEXT');
  await addColumnIfMissing(db, 'melting_process', 'category',      "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'melting_process', 'issued_weight', 'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'melting_process', 'issue_size',    'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'melting_process', 'start_time',    'DATETIME');
  await addColumnIfMissing(db, 'melting_process', 'end_time',      'DATETIME');
  await addColumnIfMissing(db, 'melting_process', 'description',   "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'melting_process', 'employee',      "TEXT DEFAULT 'Unknown'");

  // ── 4a. rolling_processes ─────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS rolling_processes (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      job_number     TEXT,
      job_name       TEXT,
      date           TEXT     DEFAULT CURRENT_TIMESTAMP,
      metal_type     TEXT,
      unit           TEXT     DEFAULT 'g',
      employee       TEXT     DEFAULT 'Unknown',
      issue_size     REAL,
      category       TEXT,
      status         TEXT     DEFAULT 'PENDING',
      issued_weight  REAL     DEFAULT 0,
      issue_pieces   INTEGER  DEFAULT 0,
      return_weight  REAL     DEFAULT 0,
      return_pieces  INTEGER  DEFAULT 0,
      scrap_weight   REAL     DEFAULT 0,
      loss_weight    REAL     DEFAULT 0,
      description    TEXT     DEFAULT '',
      start_time     DATETIME,
      end_time       DATETIME
    )
  `);
  await addColumnIfMissing(db, 'rolling_processes', 'description', "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'rolling_processes', 'employee',    "TEXT DEFAULT 'Unknown'");

  // ── 4b. press_processes ───────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS press_processes (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      job_number     TEXT,
      job_name       TEXT,
      date           TEXT     DEFAULT CURRENT_TIMESTAMP,
      metal_type     TEXT,
      unit           TEXT     DEFAULT 'g',
      employee       TEXT     DEFAULT 'Unknown',
      issue_size     REAL,
      category       TEXT,
      status         TEXT     DEFAULT 'PENDING',
      issued_weight  REAL     DEFAULT 0,
      issue_pieces   INTEGER  DEFAULT 0,
      return_weight  REAL     DEFAULT 0,
      return_pieces  INTEGER  DEFAULT 0,
      scrap_weight   REAL     DEFAULT 0,
      loss_weight    REAL     DEFAULT 0,
      description    TEXT     DEFAULT '',
      start_time     DATETIME,
      end_time       DATETIME
    )
  `);
  await addColumnIfMissing(db, 'press_processes', 'description', "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'press_processes', 'employee',    "TEXT DEFAULT 'Unknown'");

  // ── 4c. tpp_processes ─────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS tpp_processes (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      job_number     TEXT,
      job_name       TEXT,
      date           TEXT     DEFAULT CURRENT_TIMESTAMP,
      metal_type     TEXT,
      unit           TEXT     DEFAULT 'g',
      employee       TEXT     DEFAULT 'Unknown',
      issue_size     REAL,
      category       TEXT,
      status         TEXT     DEFAULT 'PENDING',
      issued_weight  REAL     DEFAULT 0,
      issue_pieces   INTEGER  DEFAULT 0,
      return_weight  REAL     DEFAULT 0,
      return_pieces  INTEGER  DEFAULT 0,
      scrap_weight   REAL     DEFAULT 0,
      loss_weight    REAL     DEFAULT 0,
      description    TEXT     DEFAULT '',
      start_time     DATETIME,
      end_time       DATETIME
    )
  `);
  await addColumnIfMissing(db, 'tpp_processes', 'description', "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'tpp_processes', 'employee',    "TEXT DEFAULT 'Unknown'");

  // ── 4d. packing_processes ─────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS packing_processes (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      job_number     TEXT,
      job_name       TEXT,
      date           TEXT     DEFAULT CURRENT_TIMESTAMP,
      metal_type     TEXT,
      unit           TEXT     DEFAULT 'g',
      employee       TEXT     DEFAULT 'Unknown',
      issue_size     REAL,
      category       TEXT,
      status         TEXT     DEFAULT 'PENDING',
      issued_weight  REAL     DEFAULT 0,
      issue_pieces   INTEGER  DEFAULT 0,
      return_weight  REAL     DEFAULT 0,
      return_pieces  INTEGER  DEFAULT 0,
      scrap_weight   REAL     DEFAULT 0,
      loss_weight    REAL     DEFAULT 0,
      description    TEXT     DEFAULT '',
      start_time     DATETIME,
      end_time       DATETIME
    )
  `);
  await addColumnIfMissing(db, 'packing_processes', 'description', "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'packing_processes', 'employee',    "TEXT DEFAULT 'Unknown'");

  // ── 5. production_jobs ────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS production_jobs (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      job_number     TEXT,
      metal_type     TEXT,
      target_product TEXT,
      current_step   TEXT,
      status         TEXT     DEFAULT 'PENDING',
      issue_weight   REAL     DEFAULT 0,
      current_weight REAL     DEFAULT 0,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── 6. job_steps ──────────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS job_steps (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      job_id         INTEGER,
      step_name      TEXT,
      issue_weight   REAL     DEFAULT 0,
      return_weight  REAL     DEFAULT 0,
      scrap_weight   REAL     DEFAULT 0,
      loss_weight    REAL     DEFAULT 0,
      return_pieces  INTEGER  DEFAULT 0,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES production_jobs(id)
    )
  `);

  // ── 7. process_return_items ───────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS process_return_items (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      process_id     INTEGER  NOT NULL,
      process_type   TEXT     NOT NULL,
      category       TEXT     DEFAULT '',
      return_weight  REAL     DEFAULT 0,
      return_pieces  INTEGER  DEFAULT 0,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── 8. finished_goods ─────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS finished_goods (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      metal_type     TEXT,
      target_product TEXT,
      pieces         INTEGER,
      weight         REAL,
      reference_type TEXT     DEFAULT '',
      reference_id   INTEGER,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await addColumnIfMissing(db, 'finished_goods', 'reference_type', "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'finished_goods', 'reference_id',   'INTEGER');

  // ── 9. counter_inventory ──────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS counter_inventory (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      metal_type     TEXT,
      target_product TEXT,
      category       TEXT     DEFAULT '',
      size_label     TEXT     DEFAULT '',
      size_value     REAL     DEFAULT 0,
      pieces         INTEGER,
      reference_type TEXT     DEFAULT '',
      reference_id   INTEGER,
      notes          TEXT     DEFAULT '',
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await addColumnIfMissing(db, 'counter_inventory', 'category',       "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'counter_inventory', 'size_label',     "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'counter_inventory', 'size_value',     'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'counter_inventory', 'reference_type', "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'counter_inventory', 'reference_id',   'INTEGER');
  await addColumnIfMissing(db, 'counter_inventory', 'notes',          "TEXT DEFAULT ''");

  // ── 10. svg_inventory ─────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS svg_inventory (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      metal_type     TEXT,
      target_product TEXT,
      pieces         INTEGER,
      weight         REAL,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── 11. customers ─────────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS customers (
      id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
      party_name          TEXT     NOT NULL,
      firm_name           TEXT     NOT NULL,
      address             TEXT     NOT NULL,
      city                TEXT     NOT NULL,
      phone_no            TEXT     NOT NULL,
      telephone_no        TEXT     DEFAULT '',
      customer_type       TEXT     DEFAULT 'Retail',
      outstanding_balance REAL     DEFAULT 0,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await addColumnIfMissing(db, 'customers', 'customer_type',       "TEXT DEFAULT 'Retail'");
  await addColumnIfMissing(db, 'customers', 'outstanding_balance', 'REAL DEFAULT 0');

  // ── 12. users ─────────────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER  PRIMARY KEY AUTOINCREMENT,
      username      TEXT     UNIQUE NOT NULL,
      password_hash TEXT     NOT NULL,
      role          TEXT     CHECK( role IN ('ADMIN', 'EMPLOYEE') ) NOT NULL DEFAULT 'EMPLOYEE',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── 13. labour_charges ────────────────────────────────────────────────────
  // Detect and migrate old schema (missing size_label / lc_pp_retail columns).
  // When migrating, we re-seed inline because the seed runner only fires for
  // truly fresh databases.
  const lcCols       = await getColumns(db, 'labour_charges');
  const lcExists     = lcCols.length > 0;
  const lcHasNew     = lcExists
    && lcCols.some(c => c.name === 'size_label')
    && lcCols.some(c => c.name === 'lc_pp_retail');

  if (lcExists && !lcHasNew) {
    // Old-schema table present — rename it out of the way, create new schema.
    await db.pRun(`DROP TABLE IF EXISTS labour_charges_old`);
    await db.pRun(`ALTER TABLE labour_charges RENAME TO labour_charges_old`);
    await _createLabourChargesTable(db);
    await _seedLabourChargesRows(db);
    await db.pRun(`DROP TABLE IF EXISTS labour_charges_old`);
    console.log('[DB] Migrated labour_charges to 3-tier schema and re-seeded');
  } else {
    await _createLabourChargesTable(db);
    // Note: seeding on a fresh DB is handled by seeds/03_labour_charges.js
  }

  // ── 14. selling_bills ─────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS selling_bills (
      id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
      bill_no             INTEGER  UNIQUE NOT NULL,
      date                TEXT     NOT NULL,
      customer_id         INTEGER  REFERENCES customers(id),
      customer_name       TEXT     DEFAULT '',
      customer_type       TEXT     DEFAULT 'Retail',
      payment_mode        TEXT     DEFAULT 'Cash',
      cash_amount         REAL     DEFAULT 0,
      online_amount       REAL     DEFAULT 0,
      metal_payment_type  TEXT     DEFAULT '',
      metal_purity        TEXT     DEFAULT '',
      metal_weight        REAL     DEFAULT 0,
      metal_rate          REAL     DEFAULT 0,
      metal_value         REAL     DEFAULT 0,
      subtotal            REAL     DEFAULT 0,
      total_lc            REAL     DEFAULT 0,
      discount            REAL     DEFAULT 0,
      total_amount        REAL     DEFAULT 0,
      amount_paid         REAL     DEFAULT 0,
      outstanding_amount  REAL     DEFAULT 0,
      notes               TEXT     DEFAULT '',
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await addColumnIfMissing(db, 'selling_bills', 'discount', 'REAL DEFAULT 0');

  // ── 15. selling_bill_items ────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS selling_bill_items (
      id            INTEGER  PRIMARY KEY AUTOINCREMENT,
      bill_id       INTEGER  NOT NULL REFERENCES selling_bills(id) ON DELETE CASCADE,
      metal_type    TEXT     NOT NULL,
      category      TEXT     NOT NULL,
      custom_label  TEXT     DEFAULT '',
      size          REAL,
      pieces        INTEGER  DEFAULT 0,
      weight        REAL     DEFAULT 0,
      rate_per_gram REAL     DEFAULT 0,
      metal_value   REAL     DEFAULT 0,
      lc_pp         REAL     DEFAULT 0,
      t_lc          REAL     DEFAULT 0,
      sort_order    INTEGER  DEFAULT 0
    )
  `);

  // ── 16. selling_bill_metal_payments ───────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS selling_bill_metal_payments (
      id           INTEGER  PRIMARY KEY AUTOINCREMENT,
      bill_id      INTEGER  NOT NULL REFERENCES selling_bills(id) ON DELETE CASCADE,
      metal_type   TEXT     NOT NULL,
      purity       TEXT     NOT NULL DEFAULT '99.99',
      weight       REAL     DEFAULT 0,
      rate         REAL     DEFAULT 0,
      metal_value  REAL     DEFAULT 0
    )
  `);

  // ── 17. customer_ledger_entries ───────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS customer_ledger_entries (
      id               INTEGER  PRIMARY KEY AUTOINCREMENT,
      customer_id      INTEGER  NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      entry_date       TEXT     NOT NULL,
      reference_type   TEXT     NOT NULL,
      reference_id     INTEGER,
      reference_no     TEXT     DEFAULT '',
      transaction_type TEXT     DEFAULT '',
      payment_mode     TEXT     DEFAULT '',
      line_type        TEXT     NOT NULL,
      metal_type       TEXT     DEFAULT '',
      metal_purity     TEXT     DEFAULT '',
      reference_rate   REAL     DEFAULT 0,
      weight_delta     REAL     DEFAULT 0,
      amount_delta     REAL     DEFAULT 0,
      notes            TEXT     DEFAULT '',
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await addColumnIfMissing(db, 'customer_ledger_entries', 'transaction_type', "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'customer_ledger_entries', 'payment_mode',     "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'customer_ledger_entries', 'reference_rate',   'REAL DEFAULT 0');

  // ── 18. counter_cash_ledger ───────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS counter_cash_ledger (
      id             INTEGER  PRIMARY KEY AUTOINCREMENT,
      entry_date     TEXT     NOT NULL,
      reference_type TEXT     NOT NULL,
      reference_id   INTEGER,
      reference_no   TEXT     DEFAULT '',
      mode           TEXT     NOT NULL,
      amount         REAL     DEFAULT 0,
      notes          TEXT     DEFAULT '',
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── 19. ob_labour_rates ───────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS ob_labour_rates (
      id              INTEGER  PRIMARY KEY AUTOINCREMENT,
      metal_type      TEXT     NOT NULL,
      size_label      TEXT     NOT NULL,
      size_value      REAL,
      lc_pp_retail    REAL     DEFAULT 0,
      lc_pp_showroom  REAL     DEFAULT 0,
      lc_pp_wholesale REAL     DEFAULT 0,
      is_custom       INTEGER  DEFAULT 0,
      sort_order      INTEGER  DEFAULT 0,
      UNIQUE(metal_type, size_label)
    )
  `);

  // ── 20. order_bills ───────────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS order_bills (
      id               INTEGER  PRIMARY KEY AUTOINCREMENT,
      ob_no            INTEGER  UNIQUE NOT NULL,
      date             TEXT     NOT NULL,
      product          TEXT     DEFAULT '',
      products         TEXT     DEFAULT '["Gold 24K"]',
      customer_id      INTEGER  DEFAULT NULL,
      customer_name    TEXT     DEFAULT '',
      customer_city    TEXT     DEFAULT '',
      customer_address TEXT     DEFAULT '',
      customer_phone   TEXT     DEFAULT '',
      customer_type    TEXT     DEFAULT 'Retail',
      fine_jama        REAL     DEFAULT 0,
      rate_10g         REAL     DEFAULT 0,
      jama_gold_22k    REAL     DEFAULT 0,
      rate_gold_22k    REAL     DEFAULT 0,
      jama_silver      REAL     DEFAULT 0,
      rate_silver      REAL     DEFAULT 0,
      amt_jama         REAL     DEFAULT 0,
      cash_amount      REAL     DEFAULT 0,
      online_amount    REAL     DEFAULT 0,
      payment_mode     TEXT     DEFAULT 'Cash',
      payment_entries  TEXT     DEFAULT '[]',
      balance_snapshot TEXT     DEFAULT '{}',
      total_pcs        INTEGER  DEFAULT 0,
      total_weight     REAL     DEFAULT 0,
      labour_total     REAL     DEFAULT 0,
      fine_diff        REAL     DEFAULT 0,
      gold_rs          REAL     DEFAULT 0,
      subtotal         REAL     DEFAULT 0,
      discount         REAL     DEFAULT 0,
      total_amount     REAL     DEFAULT 0,
      amt_baki         REAL     DEFAULT 0,
      refund_due       REAL     DEFAULT 0,
      ofg_status       TEXT     DEFAULT 'OF.G HDF',
      fine_carry       REAL     DEFAULT 0,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await addColumnIfMissing(db, 'order_bills', 'customer_type',    "TEXT DEFAULT 'Retail'");
  await addColumnIfMissing(db, 'order_bills', 'products',         `TEXT DEFAULT '["Gold 24K"]'`);
  await addColumnIfMissing(db, 'order_bills', 'customer_id',      'INTEGER DEFAULT NULL');
  await addColumnIfMissing(db, 'order_bills', 'cash_amount',      'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'order_bills', 'online_amount',    'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'order_bills', 'payment_mode',     "TEXT DEFAULT 'Cash'");
  await addColumnIfMissing(db, 'order_bills', 'payment_entries',  "TEXT DEFAULT '[]'");
  await addColumnIfMissing(db, 'order_bills', 'balance_snapshot', "TEXT DEFAULT '{}'");
  await addColumnIfMissing(db, 'order_bills', 'customer_address', "TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'order_bills', 'discount',         'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'order_bills', 'total_amount',     'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'order_bills', 'refund_due',       'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'order_bills', 'jama_gold_22k',    'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'order_bills', 'rate_gold_22k',    'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'order_bills', 'jama_silver',      'REAL DEFAULT 0');
  await addColumnIfMissing(db, 'order_bills', 'rate_silver',      'REAL DEFAULT 0');

  // ── 21. order_bill_items ──────────────────────────────────────────────────
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS order_bill_items (
      id         INTEGER  PRIMARY KEY AUTOINCREMENT,
      bill_id    INTEGER  NOT NULL REFERENCES order_bills(id) ON DELETE CASCADE,
      metal_type TEXT     DEFAULT 'Gold 24K',
      category   TEXT     NOT NULL DEFAULT 'Standard',
      size_label TEXT     NOT NULL,
      size_value REAL     DEFAULT 0,
      pcs        INTEGER  DEFAULT 0,
      weight     REAL     DEFAULT 0,
      lc_pp      REAL     DEFAULT 0,
      t_lc       REAL     DEFAULT 0,
      is_custom  INTEGER  DEFAULT 0,
      sort_order INTEGER  DEFAULT 0
    )
  `);
  await addColumnIfMissing(db, 'order_bill_items', 'metal_type', "TEXT DEFAULT 'Gold 24K'");
  await addColumnIfMissing(db, 'order_bill_items', 'category',   "TEXT NOT NULL DEFAULT 'Standard'");
}

// ─── labour_charges table + seed helpers ─────────────────────────────────────

async function _createLabourChargesTable(db) {
  await db.pRun(`
    CREATE TABLE IF NOT EXISTS labour_charges (
      id              INTEGER  PRIMARY KEY AUTOINCREMENT,
      metal_type      TEXT     NOT NULL,
      category        TEXT     NOT NULL DEFAULT 'Standard',
      size_label      TEXT     NOT NULL,
      size_value      REAL,
      lc_pp_retail    REAL     DEFAULT 0,
      lc_pp_showroom  REAL     DEFAULT 0,
      lc_pp_wholesale REAL     DEFAULT 0,
      sort_order      INTEGER  DEFAULT 0,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(metal_type, category, size_label)
    )
  `);
}

// Seeded here only when migrating FROM the old schema.
// For fresh databases the seed runner uses seeds/03_labour_charges.js.
const LABOUR_CHARGES_ROWS = [
  // [metal_type, category, size_label, size_value, retail, showroom, wholesale, sort]
  ['Gold 24K', 'Standard', '0.05g',  0.05,   380,  250,  250,  1],
  ['Gold 24K', 'Standard', '0.1g',   0.10,   300,  250,  250,  2],
  ['Gold 24K', 'Standard', '0.25g',  0.25,   300,  250,  250,  3],
  ['Gold 24K', 'Standard', '0.5g',   0.50,   500,  330,  330,  4],
  ['Gold 24K', 'Standard', '1g',     1,      500,  330,  330,  5],
  ['Gold 24K', 'Standard', '2g',     2,      720,  400,  400,  6],
  ['Gold 24K', 'Standard', '5g',     5,      950,  500,  500,  7],
  ['Gold 24K', 'Standard', '10g',    10,    1200,  600,  600,  8],
  ['Gold 24K', 'Standard', '20g',    20,    2400, 1200, 1200,  9],
  ['Gold 24K', 'Standard', '25g',    25,    3000, 1700, 1700, 10],
  ['Gold 24K', 'Standard', '50g',    50,    5000, 2500, 2500, 11],
  ['Gold 24K', 'Standard', '100g',   100,   6000, 4000, 4000, 12],
  ['Gold 22K', 'Standard', '0.05g',  0.05,   400,  300,  300,  1],
  ['Gold 22K', 'Standard', '0.1g',   0.10,   400,  300,  300,  2],
  ['Gold 22K', 'Standard', '0.25g',  0.25,   400,  300,  300,  3],
  ['Gold 22K', 'Standard', '0.5g',   0.50,   550,  400,  400,  4],
  ['Gold 22K', 'Standard', '1g',     1,      600,  400,  400,  5],
  ['Gold 22K', 'Standard', '2g',     2,      800,  450,  450,  6],
  ['Gold 22K', 'Standard', '5g',     5,     1000,  550,  550,  7],
  ['Gold 22K', 'Standard', '10g',    10,    1300,  700,  700,  8],
  ['Gold 22K', 'Standard', '20g',    20,    2500, 1300, 1300,  9],
  ['Gold 22K', 'Standard', '25g',    25,    3200, 1900, 1900, 10],
  ['Gold 22K', 'Standard', '50g',    50,    5500, 5500, 3200, 11],
  ['Gold 22K', 'Standard', '100g',   100,   6300, 4300, 4300, 12],
  ['Silver',   'Bar',      '1g',     1,      380,  250,  250,  1],
  ['Silver',   'Bar',      '2g',     2,      300,  250,  250,  2],
  ['Silver',   'Bar',      '200g',   200,   5000, 5000, 5000,  3],
  ['Silver',   'Bar',      '500g',   500,   6000, 6000, 6000,  4],
  ['Silver',   'C|B',      '5g',     5,      300,  250,  250,  1],
  ['Silver',   'C|B',      '10g',    10,     500,  330,  330,  2],
  ['Silver',   'C|B',      '20g',    20,    1200,  600,  600,  3],
  ['Silver',   'C|B',      '25g',    25,    2400, 1200, 1200,  4],
  ['Silver',   'C|B',      '50g',    50,    3000, 1700, 1700,  5],
  ['Silver',   'C|B',      '100g',   100,   5000, 2500, 2500,  6],
  ['Silver',   'Colour',   '10g',    10,     500,  330,  330,  1],
  ['Silver',   'Colour',   '20g',    20,     720,  400,  400,  2],
  ['Silver',   'Colour',   '50g',    50,     950,  500,  500,  3],
];

async function _seedLabourChargesRows(db) {
  for (const row of LABOUR_CHARGES_ROWS) {
    await db.pRun(
      `INSERT OR IGNORE INTO labour_charges
         (metal_type, category, size_label, size_value,
          lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row
    );
  }
}

module.exports = { up, description };
