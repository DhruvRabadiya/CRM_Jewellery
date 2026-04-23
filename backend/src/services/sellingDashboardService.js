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

const getDashboard = async () => {
  const metalRows = await all(
    `SELECT metal_type, ROUND(COALESCE(SUM(weight_delta), 0), 4) AS available_weight
     FROM customer_ledger_entries
     WHERE metal_type IN ('Gold 24K', 'Gold 22K', 'Silver')
     GROUP BY metal_type`
  );

  const metalInventory = {
    "Gold 24K": 0,
    "Gold 22K": 0,
    Silver: 0,
  };

  metalRows.forEach((row) => {
    metalInventory[row.metal_type] = parseFloat(row.available_weight) || 0;
  });

  const cashRow = await get(
    `SELECT
        ROUND(COALESCE(SUM(CASE WHEN mode = 'Cash' THEN amount ELSE 0 END), 0), 2) AS cash_total,
        ROUND(COALESCE(SUM(CASE WHEN mode = 'Online' THEN amount ELSE 0 END), 0), 2) AS online_total
     FROM counter_cash_ledger`
  );

  const receivableRow = await get(
    `SELECT ROUND(COALESCE(SUM(outstanding_balance), 0), 2) AS receivable_total FROM customers`
  );

  const billRow = await get(
    `SELECT
        COUNT(*) AS bill_count,
        ROUND(COALESCE(SUM(total_amount), 0), 2) AS billed_total
     FROM selling_bills`
  );

  const recentBills = await all(
    `SELECT bill_no, date, customer_name, customer_type, total_amount, amount_paid, outstanding_amount
     FROM selling_bills
     ORDER BY id DESC
     LIMIT 8`
  );

  return {
    metal_inventory: metalInventory,
    cash_status: {
      cash_total: parseFloat(cashRow?.cash_total) || 0,
      online_total: parseFloat(cashRow?.online_total) || 0,
    },
    receivable_total: parseFloat(receivableRow?.receivable_total) || 0,
    bill_count: parseInt(billRow?.bill_count, 10) || 0,
    billed_total: parseFloat(billRow?.billed_total) || 0,
    recent_bills: recentBills,
  };
};

module.exports = { getDashboard };
