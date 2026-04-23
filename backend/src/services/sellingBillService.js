const db = require("../../config/dbConfig");
const customerService = require("./customerService");

const PURITY_FACTORS = { "99.99": 0.9999, "91.60": 0.916 };
const REFERENCE_TYPE = "SELLING_BILL";

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

// If the bill is for a walk-in customer (no customer_id) but the UI collected
// a name + phone (and optionally address), auto-create a customer record and
// return the new id. De-dupes by phone number.
const _resolveCustomerId = async (data) => {
  if (data.customer_id) return data.customer_id;
  const phone = (data.customer_phone || "").toString().trim();
  const name = (data.customer_name || "").toString().trim();
  if (!phone || !name) return null;
  const customer = await customerService.findOrCreateByPhone({
    party_name: name,
    phone_no: phone,
    address: data.customer_address || "",
    city: data.customer_city || "",
    firm_name: data.customer_firm || "",
    telephone_no: data.customer_telephone || "",
    customer_type: data.customer_type || "Retail",
  });
  return customer ? customer.id : null;
};

const getNextBillNo = () =>
  new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(MAX(bill_no), 0) + 1 AS next_no FROM selling_bills`,
      [],
      (err, row) => {
        if (err) return reject(err);
        resolve(row.next_no);
      }
    );
  });

const listBills = () =>
  new Promise((resolve, reject) => {
    db.all(
      `SELECT b.*,
        c.party_name AS customer_party_name,
        COALESCE((SELECT COUNT(*) FROM selling_bill_items WHERE bill_id = b.id), 0) AS item_count
       FROM selling_bills b
       LEFT JOIN customers c ON b.customer_id = c.id
       ORDER BY b.bill_no DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });

const getBillById = (id) =>
  new Promise((resolve, reject) => {
    db.get(
      `SELECT b.*, c.party_name AS customer_party_name, c.phone_no AS customer_phone
       FROM selling_bills b
       LEFT JOIN customers c ON b.customer_id = c.id
       WHERE b.id = ?`,
      [id],
      (err, bill) => {
        if (err) return reject(err);
        if (!bill) return resolve(null);
        db.all(
          `SELECT * FROM selling_bill_items WHERE bill_id = ? ORDER BY metal_type, sort_order`,
          [id],
          (err2, items) => {
            if (err2) return reject(err2);
            db.all(
              `SELECT * FROM selling_bill_metal_payments WHERE bill_id = ? ORDER BY id`,
              [id],
              (err3, metalPayments) => {
                if (err3) return reject(err3);
                let finalMetalPayments = metalPayments || [];
                if (
                  finalMetalPayments.length === 0 &&
                  (bill.metal_value || 0) > 0 &&
                  bill.metal_payment_type
                ) {
                  finalMetalPayments = [
                    {
                      metal_type: bill.metal_payment_type,
                      purity: bill.metal_purity || "99.99",
                      weight: bill.metal_weight || 0,
                      rate: bill.metal_rate || 0,
                      metal_value: bill.metal_value || 0,
                    },
                  ];
                }
                resolve({ ...bill, items: items || [], metal_payments: finalMetalPayments });
              }
            );
          }
        );
      }
    );
  });

const _insertItems = async (run, billId, items) => {
  for (const [i, item] of items.entries()) {
    const pieces = Math.max(parseInt(item.pieces, 10) || 0, 0);
    const size = item.size != null ? parseFloat(item.size) : null;
    const weight = size != null ? parseFloat((size * pieces).toFixed(4)) : parseFloat(item.weight) || 0;
    const rate = parseFloat(item.rate_per_gram) || 0;
    const metalValue = parseFloat((weight * rate).toFixed(2));
    const lcPp = parseFloat(item.lc_pp) || 0;
    const totalLc = parseFloat((lcPp * pieces).toFixed(2));
    await run(
      `INSERT INTO selling_bill_items
        (bill_id, metal_type, category, custom_label, size, pieces, weight, rate_per_gram, metal_value, lc_pp, t_lc, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billId,
        item.metal_type,
        item.category,
        item.custom_label || "",
        size,
        pieces,
        weight,
        rate,
        metalValue,
        lcPp,
        totalLc,
        item.sort_order != null ? item.sort_order : i,
      ]
    );
  }
};

const _insertMetalPayments = async (run, billId, entries) => {
  for (const entry of entries || []) {
    const factor = PURITY_FACTORS[entry.purity] || 0;
    const weight = parseFloat(entry.weight) || 0;
    const rate = parseFloat(entry.rate) || 0;
    const metalValue = parseFloat((weight * rate * factor).toFixed(2));
    await run(
      `INSERT INTO selling_bill_metal_payments (bill_id, metal_type, purity, weight, rate, metal_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [billId, entry.metal_type, entry.purity || "99.99", weight, rate, metalValue]
    );
  }
};

const _computeTotalMetalValue = (entries) =>
  parseFloat(
    (entries || [])
      .reduce((sum, entry) => {
        const factor = PURITY_FACTORS[entry.purity] || 0;
        return sum + (parseFloat(entry.weight) || 0) * (parseFloat(entry.rate) || 0) * factor;
      }, 0)
      .toFixed(2)
  );

const _deductCounterStock = async (run, get, items) => {
  for (const item of items || []) {
    const pieces = parseInt(item.pieces, 10) || 0;
    if (pieces <= 0) continue;
    const stock = await get(
      `SELECT COALESCE(SUM(pieces), 0) AS total FROM counter_inventory WHERE metal_type = ? AND target_product = ?`,
      [item.metal_type, item.category]
    );
    const available = stock?.total || 0;
    if (available < pieces) {
      throw new Error(
        `Insufficient stock: "${item.category}" (${item.metal_type}) needs ${pieces}, only ${available} available`
      );
    }
    await run(
      `INSERT INTO counter_inventory (metal_type, target_product, pieces) VALUES (?, ?, ?)`,
      [item.metal_type, item.category, -pieces]
    );
  }
};

const _restoreCounterStock = async (run, items) => {
  for (const item of items || []) {
    const pieces = parseInt(item.pieces, 10) || 0;
    if (pieces <= 0) continue;
    await run(
      `INSERT INTO counter_inventory (metal_type, target_product, pieces) VALUES (?, ?, ?)`,
      [item.metal_type, item.category, pieces]
    );
  }
};

const _deleteAccountingEntries = async (run, billId) => {
  await run(`DELETE FROM customer_ledger_entries WHERE reference_type = ? AND reference_id = ?`, [REFERENCE_TYPE, billId]);
  await run(`DELETE FROM counter_cash_ledger WHERE reference_type = ? AND reference_id = ?`, [REFERENCE_TYPE, billId]);
};

const _applyOutstandingDelta = async (run, customerId, delta) => {
  if (!customerId || !delta) return;
  await run(
    `UPDATE customers
     SET outstanding_balance = MAX(0, outstanding_balance + ?),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [delta, customerId]
  );
};

const _insertAccountingEntries = async (run, billId, data, resolvedCustomerId, billNo) => {
  if (resolvedCustomerId) {
    await run(
      `INSERT INTO customer_ledger_entries
        (customer_id, entry_date, reference_type, reference_id, reference_no, line_type, amount_delta, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedCustomerId,
        data.date,
        REFERENCE_TYPE,
        billId,
        String(billNo),
        "BILL_TOTAL",
        parseFloat(data.total_amount) || 0,
        data.notes || "",
      ]
    );

    const cashAmount = parseFloat(data.cash_amount) || 0;
    if (cashAmount > 0) {
      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, line_type, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [resolvedCustomerId, data.date, REFERENCE_TYPE, billId, String(billNo), "PAYMENT_CASH", -cashAmount, "Cash payment"]
      );
    }

    const onlineAmount = parseFloat(data.online_amount) || 0;
    if (onlineAmount > 0) {
      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, line_type, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [resolvedCustomerId, data.date, REFERENCE_TYPE, billId, String(billNo), "PAYMENT_ONLINE", -onlineAmount, "Online payment"]
      );
    }

    for (const entry of data.metal_payments || []) {
      const factor = PURITY_FACTORS[entry.purity] || 0;
      const weight = parseFloat(entry.weight) || 0;
      const rate = parseFloat(entry.rate) || 0;
      const metalValue = parseFloat((weight * rate * factor).toFixed(2));
      if (weight <= 0 && metalValue <= 0) continue;
      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, line_type, metal_type, metal_purity, weight_delta, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resolvedCustomerId,
          data.date,
          REFERENCE_TYPE,
          billId,
          String(billNo),
          "METAL_IN",
          entry.metal_type || "",
          entry.purity || "99.99",
          weight,
          -metalValue,
          "Metal exchange received",
        ]
      );
    }
  }

  const cashAmount = parseFloat(data.cash_amount) || 0;
  if (cashAmount !== 0) {
    await run(
      `INSERT INTO counter_cash_ledger
        (entry_date, reference_type, reference_id, reference_no, mode, amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.date, REFERENCE_TYPE, billId, String(billNo), "Cash", cashAmount, data.notes || ""]
    );
  }

  const onlineAmount = parseFloat(data.online_amount) || 0;
  if (onlineAmount !== 0) {
    await run(
      `INSERT INTO counter_cash_ledger
        (entry_date, reference_type, reference_id, reference_no, mode, amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.date, REFERENCE_TYPE, billId, String(billNo), "Online", onlineAmount, data.notes || ""]
    );
  }
};

const createBill = async (data) => {
  const billNo = await getNextBillNo();
  const metalValue = _computeTotalMetalValue(data.metal_payments);
  const resolvedCustomerId = await _resolveCustomerId(data);

  return db.runTransaction(async (run, get) => {
    const { lastID } = await run(
      `INSERT INTO selling_bills
        (bill_no, date, customer_id, customer_name, customer_type,
         payment_mode, cash_amount, online_amount,
         metal_payment_type, metal_purity, metal_weight, metal_rate, metal_value,
         subtotal, total_lc, discount, total_amount, amount_paid, outstanding_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billNo,
        data.date,
        resolvedCustomerId || null,
        data.customer_name || "",
        data.customer_type || "Retail",
        data.payment_mode || "Cash",
        parseFloat(data.cash_amount) || 0,
        parseFloat(data.online_amount) || 0,
        "",
        "",
        0,
        0,
        metalValue,
        parseFloat(data.subtotal) || 0,
        parseFloat(data.total_lc) || 0,
        parseFloat(data.discount) || 0,
        parseFloat(data.total_amount) || 0,
        parseFloat(data.amount_paid) || 0,
        parseFloat(data.outstanding_amount) || 0,
        data.notes || "",
      ]
    );

    await _insertItems(run, lastID, data.items || []);
    await _insertMetalPayments(run, lastID, data.metal_payments || []);
    await _deductCounterStock(run, get, data.items || []);
    await _insertAccountingEntries(run, lastID, data, resolvedCustomerId, billNo);
    await _applyOutstandingDelta(run, resolvedCustomerId, parseFloat(data.outstanding_amount) || 0);

    return lastID;
  });
};

const updateBill = async (id, data) => {
  const metalValue = _computeTotalMetalValue(data.metal_payments);
  const resolvedCustomerId = await _resolveCustomerId(data);
  const oldItems = await all(`SELECT metal_type, category, pieces FROM selling_bill_items WHERE bill_id = ?`, [id]);

  return db.runTransaction(async (run, get) => {
    const oldBill = await get(`SELECT bill_no, customer_id, outstanding_amount FROM selling_bills WHERE id = ?`, [id]);
    if (!oldBill) throw new Error("Bill not found");

    await run(
      `UPDATE selling_bills SET
        date=?, customer_id=?, customer_name=?, customer_type=?,
        payment_mode=?, cash_amount=?, online_amount=?,
        metal_payment_type=?, metal_purity=?, metal_weight=?, metal_rate=?, metal_value=?,
        subtotal=?, total_lc=?, discount=?, total_amount=?, amount_paid=?, outstanding_amount=?, notes=?
       WHERE id=?`,
      [
        data.date,
        resolvedCustomerId || null,
        data.customer_name || "",
        data.customer_type || "Retail",
        data.payment_mode || "Cash",
        parseFloat(data.cash_amount) || 0,
        parseFloat(data.online_amount) || 0,
        "",
        "",
        0,
        0,
        metalValue,
        parseFloat(data.subtotal) || 0,
        parseFloat(data.total_lc) || 0,
        parseFloat(data.discount) || 0,
        parseFloat(data.total_amount) || 0,
        parseFloat(data.amount_paid) || 0,
        parseFloat(data.outstanding_amount) || 0,
        data.notes || "",
        id,
      ]
    );

    await _restoreCounterStock(run, oldItems);
    await run(`DELETE FROM selling_bill_items WHERE bill_id = ?`, [id]);
    await _insertItems(run, id, data.items || []);
    await _deductCounterStock(run, get, data.items || []);

    await run(`DELETE FROM selling_bill_metal_payments WHERE bill_id = ?`, [id]);
    await _insertMetalPayments(run, id, data.metal_payments || []);

    await _deleteAccountingEntries(run, id);
    await _applyOutstandingDelta(run, oldBill.customer_id, -(parseFloat(oldBill.outstanding_amount) || 0));
    await _insertAccountingEntries(run, id, data, resolvedCustomerId, oldBill.bill_no);
    await _applyOutstandingDelta(run, resolvedCustomerId, parseFloat(data.outstanding_amount) || 0);
  });
};

const deleteBill = (id) =>
  db.runTransaction(async (run, get) => {
    const bill = await get(
      `SELECT bill_no, customer_id, outstanding_amount FROM selling_bills WHERE id = ?`,
      [id]
    );
    if (!bill) return 0;

    const items = await all(
      `SELECT metal_type, category, pieces FROM selling_bill_items WHERE bill_id = ?`,
      [id]
    );

    await _restoreCounterStock(run, items);
    await _deleteAccountingEntries(run, id);
    await _applyOutstandingDelta(run, bill.customer_id, -(parseFloat(bill.outstanding_amount) || 0));

    await run(`DELETE FROM selling_bill_items WHERE bill_id = ?`, [id]);
    await run(`DELETE FROM selling_bill_metal_payments WHERE bill_id = ?`, [id]);
    const result = await run(`DELETE FROM selling_bills WHERE id = ?`, [id]);
    return result.changes || 0;
  });

module.exports = {
  getNextBillNo,
  listBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
};
