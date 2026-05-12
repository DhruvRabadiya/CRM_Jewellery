'use strict';

/**
 * Migration 008 — Performance Indexes
 * ─────────────────────────────────────
 * Adds composite and single-column indexes on the columns most frequently
 * used in WHERE clauses, JOINs, and ORDER BY expressions.
 *
 * Without these indexes, every lookup against stock_transactions,
 * order_bills, customer_ledger_entries, etc. performs a full table scan —
 * acceptable today with hundreds of rows, but painful once the database
 * grows into the tens of thousands.
 *
 * All CREATE INDEX statements use IF NOT EXISTS so this migration is fully
 * idempotent and safe to replay.
 *
 * Index naming convention:
 *   idx_<table>_<column(s)>
 */

const description = 'Add performance indexes on high-frequency query columns';

async function up(db) {

  // ── stock_transactions ────────────────────────────────────────────────────
  // Queried by: metal_type, transaction_type, reference_type+reference_id
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_stock_tx_metal_type
    ON stock_transactions (metal_type)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_stock_tx_type
    ON stock_transactions (transaction_type)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_stock_tx_reference
    ON stock_transactions (reference_type, reference_id)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_stock_tx_date
    ON stock_transactions (date DESC)`);

  // ── order_bills ───────────────────────────────────────────────────────────
  // Queried by: date (list view), customer_id (ledger), ob_no (uniqueness check)
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_order_bills_date
    ON order_bills (date DESC)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_order_bills_customer_id
    ON order_bills (customer_id)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_order_bills_ob_no
    ON order_bills (ob_no)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_order_bills_order_status
    ON order_bills (order_status)`);

  // ── order_bill_items ──────────────────────────────────────────────────────
  // Queried by: bill_id (always filtered by parent bill)
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_order_bill_items_bill_id
    ON order_bill_items (bill_id)`);

  // ── customer_ledger_entries ───────────────────────────────────────────────
  // Queried by: customer_id (balance calc), reference_type+reference_id (reversal)
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_cle_customer_id
    ON customer_ledger_entries (customer_id)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_cle_reference
    ON customer_ledger_entries (reference_type, reference_id)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_cle_entry_date
    ON customer_ledger_entries (entry_date DESC)`);

  // ── counter_cash_ledger ───────────────────────────────────────────────────
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_ccl_reference
    ON counter_cash_ledger (reference_type, reference_id)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_ccl_entry_date
    ON counter_cash_ledger (entry_date DESC)`);

  // ── melting_process ───────────────────────────────────────────────────────
  // Queried by: status (PENDING/RUNNING/COMPLETED), metal_type
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_melting_status
    ON melting_process (status)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_melting_metal_status
    ON melting_process (metal_type, status)`);

  // ── rolling_processes ─────────────────────────────────────────────────────
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_rolling_status
    ON rolling_processes (status)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_rolling_metal_status
    ON rolling_processes (metal_type, status)`);

  // ── press_processes ───────────────────────────────────────────────────────
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_press_status
    ON press_processes (status)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_press_metal_status
    ON press_processes (metal_type, status)`);

  // ── tpp_processes ─────────────────────────────────────────────────────────
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_tpp_status
    ON tpp_processes (status)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_tpp_metal_status
    ON tpp_processes (metal_type, status)`);

  // ── packing_processes ─────────────────────────────────────────────────────
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_packing_status
    ON packing_processes (status)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_packing_metal_status
    ON packing_processes (metal_type, status)`);

  // ── process_return_items ──────────────────────────────────────────────────
  // Queried by: process_id + process_type (always together)
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_pri_process
    ON process_return_items (process_id, process_type)`);

  // ── finished_goods ────────────────────────────────────────────────────────
  // Queried by: metal_type + target_product (inventory aggregation)
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_fg_metal_product
    ON finished_goods (metal_type, target_product)`);

  // ── counter_inventory ────────────────────────────────────────────────────
  // Queried by: metal_type, bill_id
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_ci_metal_type
    ON counter_inventory (metal_type)`);

  // ── customers ─────────────────────────────────────────────────────────────
  // Queried by: party_name (search), phone_no (find-or-create)
  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_customers_party_name
    ON customers (party_name)`);

  await db.pRun(`CREATE INDEX IF NOT EXISTS idx_customers_phone
    ON customers (phone_no)`);

  console.log('[DB] Performance indexes created ✓');
}

module.exports = { up, description };
