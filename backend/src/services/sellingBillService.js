const db = require("../../config/dbConfig");
const customerService = require("./customerService");

const PURITY_FACTORS = { "99.99": 0.9999, "91.60": 0.916 };

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
                // Backward compat: if no metal_payments rows but old bill has single-metal data, expose as one entry
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
    const pieces = Math.max(parseInt(item.pieces) || 0, 0);
    const size = item.size != null ? parseFloat(item.size) : null;
    const weight = size != null ? parseFloat((size * pieces).toFixed(4)) : parseFloat(item.weight) || 0;
    const rate = parseFloat(item.rate_per_gram) || 0;
    const metal_value = parseFloat((weight * rate).toFixed(2));
    const lc_pp = parseFloat(item.lc_pp) || 0;
    const t_lc = parseFloat((lc_pp * pieces).toFixed(2));
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
        metal_value,
        lc_pp,
        t_lc,
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
    const metal_value = parseFloat((weight * rate * factor).toFixed(2));
    await run(
      `INSERT INTO selling_bill_metal_payments (bill_id, metal_type, purity, weight, rate, metal_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [billId, entry.metal_type, entry.purity || "99.99", weight, rate, metal_value]
    );
  }
};

const _computeTotalMetalValue = (entries) =>
  parseFloat(
    (entries || [])
      .reduce((sum, e) => {
        const factor = PURITY_FACTORS[e.purity] || 0;
        return sum + (parseFloat(e.weight) || 0) * (parseFloat(e.rate) || 0) * factor;
      }, 0)
      .toFixed(2)
  );

const _deductCounterStock = async (run, get, items) => {
  for (const item of items || []) {
    const pieces = parseInt(item.pieces) || 0;
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
    const pieces = parseInt(item.pieces) || 0;
    if (pieces <= 0) continue;
    await run(
      `INSERT INTO counter_inventory (metal_type, target_product, pieces) VALUES (?, ?, ?)`,
      [item.metal_type, item.category, pieces]
    );
  }
};

const createBill = async (data) => {
  const bill_no = await getNextBillNo();
  const metalValue = _computeTotalMetalValue(data.metal_payments);
  // Auto-create customer if walk-in with name+phone provided (outside txn for simpler flow)
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
        bill_no,
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

    if (resolvedCustomerId && parseFloat(data.outstanding_amount) > 0) {
      await run(
        `UPDATE customers SET outstanding_balance = outstanding_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [parseFloat(data.outstanding_amount), resolvedCustomerId]
      );
    }
    return lastID;
  });
};

const updateBill = async (id, data) => {
  const metalValue = _computeTotalMetalValue(data.metal_payments);
  // Auto-create customer during edit too (if walk-in now has phone+name entered)
  const resolvedCustomerId = await _resolveCustomerId(data);

  // Fetch old items outside transaction to restore their stock inside
  const oldItems = await new Promise((resolve, reject) =>
    db.all(`SELECT metal_type, category, pieces FROM selling_bill_items WHERE bill_id = ?`, [id],
      (err, rows) => err ? reject(err) : resolve(rows || []))
  );

  return db.runTransaction(async (run, get) => {
    const oldBill = await get(`SELECT customer_id, outstanding_amount FROM selling_bills WHERE id = ?`, [id]);

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

    // Restore old stock, replace items, deduct new stock
    await _restoreCounterStock(run, oldItems);
    await run(`DELETE FROM selling_bill_items WHERE bill_id = ?`, [id]);
    await _insertItems(run, id, data.items || []);
    await _deductCounterStock(run, get, data.items || []);

    await run(`DELETE FROM selling_bill_metal_payments WHERE bill_id = ?`, [id]);
    await _insertMetalPayments(run, id, data.metal_payments || []);

    if (oldBill) {
      const oldCustomerId = oldBill.customer_id;
      const oldOutstanding = parseFloat(oldBill.outstanding_amount) || 0;
      const newCustomerId = resolvedCustomerId || null;
      const newOutstanding = parseFloat(data.outstanding_amount) || 0;

      if (oldCustomerId && oldOutstanding !== 0) {
        await run(
          `UPDATE customers SET outstanding_balance = outstanding_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [oldOutstanding, oldCustomerId]
        );
      }
      if (newCustomerId && newOutstanding > 0) {
        await run(
          `UPDATE customers SET outstanding_balance = outstanding_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newOutstanding, newCustomerId]
        );
      }
    }
  });
};

const deleteBill = (id) =>
  db.runTransaction(async (run, get) => {
    // Fetch bill to reverse outstanding + restore stock
    const bill = await get(
      `SELECT customer_id, outstanding_amount FROM selling_bills WHERE id = ?`,
      [id]
    );
    if (!bill) return 0;

    const items = await new Promise((resolve, reject) =>
      db.all(
        `SELECT metal_type, category, pieces FROM selling_bill_items WHERE bill_id = ?`,
        [id],
        (err, rows) => (err ? reject(err) : resolve(rows || []))
      )
    );

    await _restoreCounterStock(run, items);

    if (bill.customer_id && parseFloat(bill.outstanding_amount) !== 0) {
      await run(
        `UPDATE customers SET outstanding_balance = outstanding_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [parseFloat(bill.outstanding_amount) || 0, bill.customer_id]
      );
    }

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
