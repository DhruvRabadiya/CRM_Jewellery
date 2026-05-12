'use strict';

const db = require('../../config/dbConfig');

/**
 * Dashboard summary for the Selling area.
 * Sources:
 *   customer_ledger_entries  — metal payments received (PAYMENT_METAL entries)
 *   counter_cash_ledger      — cash / online totals  (mode column: 'Cash' | 'Bank / UPI')
 *   customers                — outstanding receivables (outstanding_balance column)
 *   order_bills              — bill count and total billed
 */
const getDashboard = async () => {
  // Metal received as payment — weight_delta is negative (metal flowing IN)
  const metalReceivedRows = await db.pAll(
    `SELECT
       metal_type,
       ROUND(ABS(SUM(weight_delta)), 4) AS total_weight,
       ROUND(SUM(
         CASE WHEN reference_rate > 0
              THEN ABS(weight_delta) * reference_rate / 10.0
              ELSE 0 END
       ), 2) AS estimated_value
     FROM customer_ledger_entries
     WHERE line_type = 'PAYMENT_METAL' AND weight_delta < 0
     GROUP BY metal_type`
  );

  // Cash and bank totals from the counter cash ledger.
  // Column name: `mode`  Values: 'Cash' | 'Bank / UPI'
  const cashRow = await db.pGet(
    `SELECT
       ROUND(SUM(CASE WHEN mode = 'Cash'      THEN amount ELSE 0 END), 2) AS total_cash,
       ROUND(SUM(CASE WHEN mode = 'Bank / UPI' THEN amount ELSE 0 END), 2) AS total_online,
       ROUND(SUM(CASE WHEN amount > 0         THEN amount ELSE 0 END), 2) AS total_received
     FROM counter_cash_ledger`
  );

  // Outstanding receivables from customers.
  // Column name: `outstanding_balance` (not balance_cash)
  const outstandingRow = await db.pGet(
    `SELECT ROUND(SUM(outstanding_balance), 2) AS total_outstanding
       FROM customers
      WHERE outstanding_balance > 0`
  );

  const billRow = await db.pGet(
    `SELECT COUNT(*)                       AS total_bills,
            ROUND(SUM(total_amount), 2)    AS total_billed
       FROM order_bills`
  );

  return {
    metalReceived: metalReceivedRows,
    cash: {
      total_cash:     (cashRow && cashRow.total_cash)     || 0,
      total_online:   (cashRow && cashRow.total_online)   || 0,
      total_received: (cashRow && cashRow.total_received) || 0,
    },
    outstanding: (outstandingRow && outstandingRow.total_outstanding) || 0,
    bills: {
      total_bills:  (billRow && billRow.total_bills)  || 0,
      total_billed: (billRow && billRow.total_billed) || 0,
    },
  };
};

module.exports = { getDashboard };
