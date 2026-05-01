const db = require("../../config/dbConfig");

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

// Dashboard summary for the Selling area.
// Reads from:
//   - customer_ledger_entries : metal payments received (PAYMENT_METAL entries)
//   - counter_cash_ledger     : cash/online totals
//   - customers               : outstanding receivables
//   - order_bills (estimates) : bill count and total billed
const getDashboard = async () => {
  // 1. Total metal received as payment per metal type.
  // weight_delta is stored as negative for payments (metal flowing IN to counter).
  const metalReceivedRows = await all(
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

  const metalPaymentsReceived = {
    "Gold 24K": { weight: 0, value: 0 },
    "Gold 22K": { weight: 0, value: 0 },
    Silver: { weight: 0, value: 0 },
  };
  let totalMetalPaymentValue = 0;
  metalReceivedRows.forEach((row) => {
    if (metalPaymentsReceived[row.metal_type]) {
      metalPaymentsReceived[row.metal_type].weight = parseFloat(row.total_weight) || 0;
      metalPaymentsReceived[row.metal_type].value = parseFloat(row.estimated_value) || 0;
      totalMetalPaymentValue += parseFloat(row.estimated_value) || 0;
    }
  });

  // 2. Cash / online totals from counter_cash_ledger
  const cashRow = await get(
    "SELECT" +
    " ROUND(COALESCE(SUM(CASE WHEN mode = 'Cash'       THEN amount ELSE 0 END), 0), 2) AS cash_total," +
    " ROUND(COALESCE(SUM(CASE WHEN mode = 'Bank / UPI' THEN amount ELSE 0 END), 0), 2) AS online_total" +
    " FROM counter_cash_ledger"
  );

  // 3. Customer outstanding receivable balance
  const receivableRow = await get(
    "SELECT ROUND(COALESCE(SUM(outstanding_balance), 0), 2) AS receivable_total FROM customers"
  );

  // 4. Estimates count and total billed
  const billRow = await get(
    "SELECT COUNT(*) AS bill_count," +
    " ROUND(COALESCE(SUM(total_amount), 0), 2) AS billed_total" +
    " FROM order_bills"
  );

  // 5. Recent estimates with cash paid, metal received per type, payment mode, and balance.
  //    fine_jama     = Gold 24K weight received (g)
  //    jama_gold_22k = Gold 22K weight received (g)
  //    jama_silver   = Silver weight received (g)
  const recentBills = await all(
    "SELECT" +
    "  ob_no AS bill_no," +
    "  date, customer_name, customer_type, total_amount, payment_mode," +
    "  ROUND(MAX(COALESCE(amt_jama, 0) - COALESCE(refund_due, 0), 0), 2) AS amount_paid," +
    "  ROUND(COALESCE(fine_jama, 0), 4) AS metal_gold24k," +
    "  ROUND(COALESCE(jama_gold_22k, 0), 4) AS metal_gold22k," +
    "  ROUND(COALESCE(jama_silver, 0), 4) AS metal_silver," +
    "  amt_baki AS outstanding_amount," +
    "  refund_due" +
    " FROM order_bills" +
    " ORDER BY id DESC LIMIT 8"
  );

  return {
    metal_payments_received: metalPaymentsReceived,
    total_metal_payment_value: parseFloat(totalMetalPaymentValue.toFixed(2)),
    cash_status: {
      cash_total: parseFloat(cashRow ? cashRow.cash_total : 0) || 0,
      online_total: parseFloat(cashRow ? cashRow.online_total : 0) || 0,
    },
    receivable_total: parseFloat(receivableRow ? receivableRow.receivable_total : 0) || 0,
    bill_count: parseInt(billRow ? billRow.bill_count : 0, 10) || 0,
    billed_total: parseFloat(billRow ? billRow.billed_total : 0) || 0,
    recent_bills: recentBills,
  };
};

module.exports = { getDashboard };
