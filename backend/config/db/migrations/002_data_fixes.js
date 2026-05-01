'use strict';

/**
 * Migration 002 — One-Time Data Fixes
 * ─────────────────────────────────────
 * Corrects data written by older versions of the application.
 * Every statement here is idempotent: safe to re-run on a database that has
 * already had this migration applied (all UPDATEs / DELETEs are conditioned on
 * the data being in the legacy state).
 *
 * Covers:
 *   1.  Clamp negative total_loss values in stock_master
 *   2.  Migrate any leftover dhal_stock into opening_stock
 *   3.  Rename metal_type 'Gold' → 'Gold 24K' across all process tables
 *   4.  Remove the orphan 'Gold' row from stock_master
 *   5.  Rename 'Gold' → 'Gold 24K' in ob_labour_rates
 *   6.  Reseed ob_labour_rates if legacy size-label structure is detected
 *   7.  Delete selling-side metal receipts from the production stock ledger
 *   8.  Migrate rate_tier → customer_type in order_bills
 *   9.  Backfill products column from legacy product column in order_bills
 *   10. Backfill cash_amount from amt_jama in order_bills
 *   11. Backfill total_amount from subtotal in order_bills
 *   12. Backfill category / size_label in counter_inventory
 */

const description = 'One-time data corrections: clamp negatives, rename Gold, fix legacy columns';

async function up(db) {

  // ── 1. Clamp negative total_loss ──────────────────────────────────────────
  await db.pRun(`UPDATE stock_master SET total_loss = 0 WHERE total_loss < 0`);

  // ── 2. Migrate dhal_stock → opening_stock ─────────────────────────────────
  // dhal_stock was an old column that was folded into opening_stock.
  // The column may not exist on databases that never had it.
  const smCols = await db.pAll(`PRAGMA table_info("stock_master")`);
  if (smCols.some(c => c.name === 'dhal_stock')) {
    await db.pRun(`
      UPDATE stock_master
         SET opening_stock = opening_stock + dhal_stock,
             dhal_stock    = 0
       WHERE dhal_stock > 0
    `);
  }

  // ── 3. Rename 'Gold' → 'Gold 24K' across all process / audit tables ───────
  const goldTables = [
    'stock_master', 'stock_transactions', 'melting_process',
    'rolling_processes', 'press_processes', 'tpp_processes',
    'packing_processes', 'finished_goods', 'production_jobs',
  ];
  for (const tbl of goldTables) {
    await db.pRun(
      `UPDATE "${tbl}" SET metal_type = 'Gold 24K' WHERE metal_type = 'Gold'`
    );
  }

  // ── 4. Remove orphan 'Gold' row from stock_master ─────────────────────────
  await db.pRun(`
    DELETE FROM stock_master
     WHERE metal_type = 'Gold'
       AND EXISTS (SELECT 1 FROM stock_master WHERE metal_type = 'Gold 24K')
  `);

  // ── 5. ob_labour_rates: rename 'Gold' → 'Gold 24K' ───────────────────────
  await db.pRun(
    `UPDATE ob_labour_rates SET metal_type = 'Gold 24K' WHERE metal_type = 'Gold'`
  );

  // ── 6. ob_labour_rates: reseed if current size labels are missing ─────────
  // If a Gold 24K row with size_label='0.05g' does not exist the table was
  // seeded with an older size structure — wipe and reseed.
  const obSentinel = await db.pGet(
    `SELECT id FROM ob_labour_rates WHERE metal_type = 'Gold 24K' AND size_label = '0.05g'`
  );
  if (!obSentinel) {
    const obCount = await db.pGet(`SELECT COUNT(*) AS c FROM ob_labour_rates`);
    if (obCount && obCount.c > 0) {
      // Rows exist but with wrong structure — clear and replace.
      await db.pRun(`DELETE FROM ob_labour_rates`);
      await _seedObRates(db);
      console.log('[DB] Re-seeded ob_labour_rates with updated size structure');
    }
    // If table is empty (fresh DB), the seed runner will populate it.
  }

  // ── 7. Remove selling-side metal receipts from production stock ledger ────
  // These legacy rows inflated production opening stock incorrectly.
  await db.pRun(`
    DELETE FROM stock_transactions
     WHERE transaction_type IN ('ESTIMATE_METAL_IN', 'CUSTOMER_METAL_IN')
  `);

  // ── 8. order_bills: rate_tier → customer_type ────────────────────────────
  const obCols     = await db.pAll(`PRAGMA table_info("order_bills")`);
  const hasRateTier = obCols.some(c => c.name === 'rate_tier');
  const hasCustType = obCols.some(c => c.name === 'customer_type');
  if (hasRateTier && hasCustType) {
    await db.pRun(`
      UPDATE order_bills
         SET customer_type = CASE rate_tier
               WHEN 'R1' THEN 'Retail'
               WHEN 'R2' THEN 'Showroom'
               WHEN 'R3' THEN 'Wholesale'
               ELSE 'Retail'
             END
       WHERE rate_tier IS NOT NULL
         AND customer_type = 'Retail'
    `);
  }

  // ── 9. order_bills: backfill products from legacy product column ──────────
  const hasProduct  = obCols.some(c => c.name === 'product');
  const hasProducts = obCols.some(c => c.name === 'products');
  if (hasProduct && hasProducts) {
    await db.pRun(`
      UPDATE order_bills
         SET products = CASE
               WHEN product IS NULL OR TRIM(product) = '' THEN '["Gold 24K"]'
               ELSE '["' || product || '"]'
             END
       WHERE products IS NULL
          OR products = ''
          OR products = '["Gold 24K"]'
    `);
  }

  // ── 10. order_bills: backfill cash_amount from amt_jama ──────────────────
  if (obCols.some(c => c.name === 'amt_jama') && obCols.some(c => c.name === 'cash_amount')) {
    await db.pRun(`
      UPDATE order_bills
         SET cash_amount = amt_jama
       WHERE cash_amount = 0 AND amt_jama > 0
    `);
  }

  // ── 11. order_bills: backfill total_amount from subtotal ─────────────────
  if (obCols.some(c => c.name === 'subtotal') && obCols.some(c => c.name === 'total_amount')) {
    await db.pRun(`
      UPDATE order_bills
         SET total_amount = COALESCE(subtotal, 0)
       WHERE total_amount = 0 AND COALESCE(subtotal, 0) > 0
    `);
  }

  // ── 12. counter_inventory: backfill category / size_label ────────────────
  await db.pRun(`
    UPDATE counter_inventory
       SET category   = CASE WHEN COALESCE(category,   '') = '' THEN target_product ELSE category   END,
           size_label = CASE WHEN COALESCE(size_label, '') = '' THEN target_product ELSE size_label END
     WHERE COALESCE(category, '') = '' OR COALESCE(size_label, '') = ''
  `);
}

// ─── ob_labour_rates seed data (used only in step 6 reseed path) ─────────────

const OB_GOLD_SIZES = [
  ['0.05g',  0.05,  380, 250, 250, 0,  1],
  ['0.1g',   0.10,  300, 250, 250, 0,  2],
  ['0.25g',  0.25,  300, 250, 250, 0,  3],
  ['0.5g',   0.50,  500, 330, 330, 0,  4],
  ['1g',     1.0,   500, 330, 330, 0,  5],
  ['2g',     2.0,   720, 400, 400, 0,  6],
  ['5g',     5.0,   950, 500, 500, 0,  7],
  ['10g',   10.0,  1200, 600, 600, 0,  8],
  ['20g',   20.0,  2400,1200,1200, 0,  9],
  ['25g',   25.0,  3000,1700,1700, 0, 10],
  ['50g',   50.0,  5000,2500,2500, 0, 11],
  ['100g', 100.0,  6000,4000,4000, 0, 12],
];

const OB_SILVER_SIZES = [
  ['1g-Bar',     null,  380, 250, 250, 0,  1],
  ['2g-bar',     null,  300, 250, 250, 0,  2],
  ['5g-C|B',     null,  300, 250, 250, 0,  3],
  ['10g-C|B',    null,  500, 330, 330, 0,  4],
  ['10g Colour', null,  500, 330, 330, 0,  5],
  ['20g Colour', null,  720, 400, 400, 0,  6],
  ['50g Colour', null,  950, 500, 500, 0,  7],
  ['20g-C|B',    null, 1200, 600, 600, 0,  8],
  ['25g-C|B',    null, 2400,1200,1200, 0,  9],
  ['50g-C|B',    null, 3000,1700,1700, 0, 10],
  ['100g-C|B',   null, 5000,2500,2500, 0, 11],
  ['200g Bar',   null, 5000,5000,5000, 0, 12],
  ['500g-Bar',   null, 6000,6000,6000, 0, 13],
];

async function _seedObRates(db) {
  const sql = `
    INSERT OR IGNORE INTO ob_labour_rates
      (metal_type, size_label, size_value,
       lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, is_custom, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  for (const [sl, sv, r, s, w, ic, so] of OB_GOLD_SIZES) {
    await db.pRun(sql, ['Gold 24K', sl, sv, r, s, w, ic, so]);
    await db.pRun(sql, ['Gold 22K', sl, sv, r, s, w, ic, so]);
  }
  for (const [sl, sv, r, s, w, ic, so] of OB_SILVER_SIZES) {
    await db.pRun(sql, ['Silver', sl, sv, r, s, w, ic, so]);
  }
}

module.exports = { up, description };
