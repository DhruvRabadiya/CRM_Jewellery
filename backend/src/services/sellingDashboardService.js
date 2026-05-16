'use strict';

const db = require('../../config/dbConfig');
const {
  recalculateOpeningStock,
  recalculateInprocessWeight,
  recalculateTotalLoss,
} = require('./stockService');

const METAL_TYPES = ['Gold 24K', 'Gold 22K', 'Silver'];

/**
 * Dashboard summary for the Selling Counter area.
 *
 * Metal stock — live opening_stock + inprocess_weight from stock_master,
 * recalculated from production source tables on every call (same logic as
 * the Production Dashboard).  Changes in production immediately appear here.
 *
 * Bills — all-time totals + the 15 most recent estimates.
 *
 * Roj Med daily cash/bank/metal balances are fetched separately by the
 * frontend via GET /api/roj-med/today-summary so this endpoint stays
 * independent of whether today's Roj Med has been started.
 */
const getDashboard = async () => {
  // ── 1. Recalculate stock_master from production source tables ──────────────
  // Identical to what the Production Dashboard (stockController.getStock) does,
  // so both dashboards always show the same numbers.
  await Promise.all(
    METAL_TYPES.flatMap((m) => [
      recalculateOpeningStock(m),
      recalculateInprocessWeight(m),
      recalculateTotalLoss(m),
    ])
  );

  const stockRows = await db.pAll(
    `SELECT metal_type, opening_stock, inprocess_weight, total_loss
       FROM stock_master
      WHERE metal_type IN ('Gold 24K', 'Gold 22K', 'Silver')`
  );

  const defaultStock = (mt) => ({
    metal_type: mt,
    opening_stock: 0,
    inprocess_weight: 0,
    total_loss: 0,
  });
  const byMetal = Object.fromEntries((stockRows || []).map((r) => [r.metal_type, r]));
  const stock = {
    gold24k: byMetal['Gold 24K'] || defaultStock('Gold 24K'),
    gold22k: byMetal['Gold 22K'] || defaultStock('Gold 22K'),
    silver:  byMetal['Silver']   || defaultStock('Silver'),
  };

  // ── 2. All-time bill stats ─────────────────────────────────────────────────
  const statsRow = await db.pGet(
    `SELECT
       COUNT(*)                                                     AS bill_count,
       ROUND(COALESCE(SUM(total_amount), 0), 2)                    AS billed_total,
       ROUND(COALESCE(SUM(CASE WHEN amt_baki > 0 THEN amt_baki ELSE 0 END), 0), 2)
                                                                   AS receivable_total
     FROM order_bills`
  );

  // ── 3. Recent 15 bills — all-time, newest first ───────────────────────────
  // payment_mode is derived from the stored legacy columns (cash_amount,
  // online_amount, fine_jama / jama_gold_22k / jama_silver) to avoid parsing
  // payment_entries JSON in SQL.
  const recentBills = await db.pAll(
    `SELECT
       b.id,
       b.ob_no                                     AS bill_no,
       b.date,
       b.customer_name,
       b.customer_type,
       b.total_amount,
       b.amt_jama                                  AS amount_paid,
       b.amt_baki                                  AS outstanding_amount,
       b.refund_due,
       b.fine_jama                                 AS metal_gold24k,
       b.jama_gold_22k                             AS metal_gold22k,
       b.jama_silver                               AS metal_silver,
       CASE
         WHEN (b.fine_jama > 0 OR b.jama_gold_22k > 0 OR b.jama_silver > 0)
              AND (b.cash_amount > 0 OR b.online_amount > 0) THEN 'Mixed'
         WHEN (b.fine_jama > 0 OR b.jama_gold_22k > 0 OR b.jama_silver > 0) THEN 'Metal'
         WHEN b.cash_amount  > 0 AND b.online_amount > 0                     THEN 'Mixed'
         WHEN b.online_amount > 0                                             THEN 'Bank / UPI'
         WHEN b.cash_amount  > 0                                              THEN 'Cash'
         ELSE NULL
       END AS payment_mode
     FROM order_bills b
     ORDER BY b.id DESC
     LIMIT 15`
  );

  return {
    stock,
    bill_count:       (statsRow && statsRow.bill_count)       || 0,
    billed_total:     (statsRow && statsRow.billed_total)     || 0,
    receivable_total: (statsRow && statsRow.receivable_total) || 0,
    recent_bills:     recentBills || [],
  };
};

module.exports = { getDashboard };
