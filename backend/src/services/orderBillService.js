const db = require("../../config/dbConfig");
const customerService = require("./customerService");
const { createAppError, isValidMetalType } = require("../utils/common");

// --- Constants ---

// reference_type discriminator in customer_ledger_entries / counter_cash_ledger.
// Keep distinct from "SELLING_BILL" so each bill type's accounting rows are
// independently deletable/updatable.
const REFERENCE_TYPE = "ORDER_BILL";

// Metal purity map for ledger entries
const METAL_PURITY = {
  "Gold 24K": "99.99",
  "Gold 22K": "91.67",
  "Silver":   "99.90",
};
const METAL_TYPES = Object.keys(METAL_PURITY);

// --- Helpers ---

// Parse the products JSON column; fall back gracefully for legacy bills.
const parseProducts = (raw) => {
  if (!raw) return ["Gold 24K"];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : ["Gold 24K"];
  } catch {
    return ["Gold 24K"];
  }
};

const VALID_CUSTOMER_TYPES = ["Retail", "Showroom", "Wholesale"];

const _validateBillInput = (data, { requireObNo = false } = {}) => {
  if (!data || typeof data !== "object") {
    throw createAppError("Invalid estimate payload", 400, "INVALID_PAYLOAD");
  }

  if (requireObNo) {
    const obNo = parseInt(data.ob_no, 10);
    if (!Number.isInteger(obNo) || obNo <= 0) {
      throw createAppError("Estimate number must be a positive integer", 400, "INVALID_ESTIMATE_NO");
    }
  }

  if (!data.date || !String(data.date).trim()) {
    throw createAppError("Date is required", 400, "DATE_REQUIRED");
  }

  if (!Array.isArray(data.products) || data.products.length === 0) {
    throw createAppError("At least one metal type must be selected", 400, "PRODUCTS_REQUIRED");
  }

  const invalidProducts = data.products.filter((metalType) => !isValidMetalType(metalType));
  if (invalidProducts.length > 0) {
    throw createAppError(`Invalid metal type: ${invalidProducts[0]}`, 400, "INVALID_METAL");
  }

  if (data.customer_type && !VALID_CUSTOMER_TYPES.includes(data.customer_type)) {
    throw createAppError("Invalid customer type", 400, "INVALID_CUSTOMER_TYPE");
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw createAppError("At least one estimate item is required", 400, "ITEMS_REQUIRED");
  }

  const nonZeroItems = data.items.filter((item) => (parseInt(item.pcs, 10) || 0) > 0);
  if (nonZeroItems.length === 0) {
    throw createAppError("Enter quantity for at least one size", 400, "PCS_REQUIRED");
  }

  nonZeroItems.forEach((item, index) => {
    if (!isValidMetalType(item.metal_type || "")) {
      throw createAppError(`Invalid metal type on item ${index + 1}`, 400, "INVALID_ITEM_METAL");
    }
    if (!item.category || !String(item.category).trim()) {
      throw createAppError(`Category is required on item ${index + 1}`, 400, "ITEM_CATEGORY_REQUIRED");
    }
    if (!item.size_label || !String(item.size_label).trim()) {
      throw createAppError(`Size label is required on item ${index + 1}`, 400, "ITEM_SIZE_REQUIRED");
    }
    const sizeValue = parseFloat(item.size_value);
    if (!Number.isFinite(sizeValue) || sizeValue <= 0) {
      throw createAppError(`Size value must be greater than 0 on item ${index + 1}`, 400, "ITEM_SIZE_INVALID");
    }
    const lcPp = parseFloat(item.lc_pp);
    if (!Number.isFinite(lcPp) || lcPp < 0) {
      throw createAppError(`Labour charge must be 0 or more on item ${index + 1}`, 400, "ITEM_LABOUR_INVALID");
    }
  });

  METAL_TYPES.forEach((metalType) => {
    const payment = _extractMetalPayments(data)[metalType] || {};
    const jama = parseFloat(payment.jama);
    const rate = parseFloat(payment.rate);

    if (Number.isFinite(jama) && jama < 0) {
      throw createAppError(`${metalType} JAMA cannot be negative`, 400, "METAL_JAMA_INVALID");
    }
    if (Number.isFinite(rate) && rate < 0) {
      throw createAppError(`${metalType} rate cannot be negative`, 400, "METAL_RATE_INVALID");
    }
  });

  if (data.discount != null && data.discount !== "") {
    const discount = parseFloat(data.discount);
    if (!Number.isFinite(discount) || discount < 0) {
      throw createAppError("Discount cannot be negative", 400, "DISCOUNT_INVALID");
    }
  }

  const hasCustomerDraft = (data.customer_name || "").trim() || (data.customer_phone || "").trim() || (data.customer_address || "").trim();
  if (!data.customer_id && hasCustomerDraft) {
    if (!(data.customer_name || "").trim()) {
      throw createAppError("Customer name is required for a new customer", 400, "CUSTOMER_NAME_REQUIRED");
    }
    if (!(data.customer_phone || "").trim()) {
      throw createAppError("Phone number is required for a new customer", 400, "CUSTOMER_PHONE_REQUIRED");
    }
    if (!(data.customer_address || "").trim()) {
      throw createAppError("Address is required for a new customer", 400, "CUSTOMER_ADDRESS_REQUIRED");
    }
  }
};

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

// If the bill didn't come in with a customer_id but has a phone + name,
// de-dupe by phone and return (or create) a customer row.
const _resolveCustomerId = async (data) => {
  if (data.customer_id) return parseInt(data.customer_id, 10) || null;
  const phone = (data.customer_phone || "").toString().trim();
  const name  = (data.customer_name  || "").toString().trim();
  if (!phone || !name) return null;
  const customer = await customerService.findOrCreateByPhone({
    party_name:    name,
    phone_no:      phone,
    address:       data.customer_address   || "",
    city:          data.customer_city      || "",
    firm_name:     data.customer_firm      || "",
    telephone_no:  data.customer_telephone || "",
    customer_type: data.customer_type      || "Retail",
  });
  return customer ? customer.id : null;
};

// Build a metalPayments map from the flat data fields.
// Returns { 'Gold 24K': { jama, rate }, 'Gold 22K': { jama, rate }, 'Silver': { jama, rate } }
const _extractMetalPayments = (data) => ({
  "Gold 24K": {
    jama: parseFloat(data.fine_jama) || 0,
    rate: parseFloat(data.rate_10g)  || 0,
  },
  "Gold 22K": {
    jama: parseFloat(data.jama_gold_22k) || 0,
    rate: parseFloat(data.rate_gold_22k) || 0,
  },
  "Silver": {
    jama: parseFloat(data.jama_silver) || 0,
    rate: parseFloat(data.rate_silver) || 0,
  },
});

// Check if any metal jama is provided
const _hasAnyMetalJama = (metalPayments) =>
  Object.values(metalPayments).some((p) => (p.jama || 0) > 0);

// Given user-entered cash + online amounts, derive the canonical amt_jama
// and payment_mode. amt_jama is always cash + online so frontend rounding
// cannot desync the DB.
const _normalisePayments = (data) => {
  const cash   = Math.max(0, parseFloat(data.cash_amount)   || 0);
  const online = Math.max(0, parseFloat(data.online_amount) || 0);
  let cashFinal = cash, onlineFinal = online;
  if (cash === 0 && online === 0) {
    const legacy = parseFloat(data.amt_jama) || 0;
    if (legacy > 0) cashFinal = legacy;
  }
  const amt_jama = parseFloat((cashFinal + onlineFinal).toFixed(2));
  let payment_mode = "Cash";
  if      (cashFinal > 0 && onlineFinal > 0) payment_mode = "Mixed";
  else if (onlineFinal > 0)                  payment_mode = "Online";
  else                                       payment_mode = "Cash";
  return { cash: cashFinal, online: onlineFinal, amt_jama, payment_mode };
};

// --- Next OB Number ---

const getNextObNo = () =>
  new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(MAX(ob_no), 0) + 1 AS next_no FROM order_bills`,
      [],
      (err, row) => {
        if (err) return reject(err);
        resolve(row.next_no);
      }
    );
  });

// --- List Bills ---

const listBills = () =>
  new Promise((resolve, reject) => {
    db.all(
      `SELECT b.*, c.party_name AS customer_party_name
         FROM order_bills b
         LEFT JOIN customers c ON b.customer_id = c.id
        ORDER BY b.ob_no DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(
          (rows || []).map((r) => ({ ...r, products: parseProducts(r.products) }))
        );
      }
    );
  });

// --- Get Bill by ID ---

const getBillById = (id) =>
  new Promise((resolve, reject) => {
    db.get(
      `SELECT b.*, c.party_name AS customer_party_name
         FROM order_bills b
         LEFT JOIN customers c ON b.customer_id = c.id
        WHERE b.id = ?`,
      [id],
      (err, bill) => {
        if (err) return reject(err);
        if (!bill) return resolve(null);
        db.all(
          `SELECT * FROM order_bill_items WHERE bill_id = ? ORDER BY metal_type, category, sort_order`,
          [id],
          (err2, items) => {
            if (err2) return reject(err2);
            resolve({
              ...bill,
              products: parseProducts(bill.products),
              items: (items || []).map((i) => ({
                ...i,
                metal_type: i.metal_type || "Gold 24K",
              })),
            });
          }
        );
      }
    );
  });

// --- Server-side Recalculation ---
// Re-derives every summary field from items + per-metal jama/rate + payments.
// Computes per-metal-type weight diffs and metal RS values independently.
//
// Returned shape:
//   subtotal      = labour_total + total_metal_rs (pre-discount line total)
//   discount      = capped at subtotal so total_amount never goes negative
//   total_amount  = subtotal - discount (what the customer actually owes)
//   amt_jama      = cash + online (net amount paid by customer)
//   amt_baki      = max(0, total_amount - amt_jama)        — customer still owes
//   refund_due    = max(0, amt_jama - total_amount)        — shop owes customer
const _computeSummary = (items, metalPayments, cash, online, discount = 0) => {
  let total_pcs = 0;
  let total_weight = 0;
  let labour_total = 0;

  // Per-metal weight accumulators
  const metalWeightTotals = {};

  for (const item of items) {
    const pcs    = parseInt(item.pcs)        || 0;
    const sv     = parseFloat(item.size_value) || 0;
    const weight = parseFloat((sv * pcs).toFixed(4));
    const lc_pp  = parseFloat(item.lc_pp)    || 0;
    const t_lc   = parseFloat((lc_pp * pcs).toFixed(2));
    total_pcs   += pcs;
    total_weight = parseFloat((total_weight + weight).toFixed(4));
    labour_total = parseFloat((labour_total + t_lc).toFixed(2));

    const mt = item.metal_type || "Gold 24K";
    metalWeightTotals[mt] = parseFloat(((metalWeightTotals[mt] || 0) + weight).toFixed(4));
  }

  // Compute per-metal diffs and metal RS
  let total_metal_rs = 0;
  const metal_diffs = {};
  const metal_rs_map = {};

  const relevantMetals = new Set([
    ...Object.keys(metalWeightTotals),
    ...METAL_TYPES.filter((metalType) => {
      const payment = metalPayments[metalType] || {};
      return (parseFloat(payment.jama) || 0) > 0 || (parseFloat(payment.rate) || 0) > 0;
    }),
  ]);

  for (const metalType of relevantMetals) {
    const weight = metalWeightTotals[metalType] || 0;
    const payment = metalPayments[metalType] || {};
    const jama = parseFloat(payment.jama) || 0;
    const rate = parseFloat(payment.rate) || 0;
    const diff = parseFloat((weight - jama).toFixed(4));
    metal_diffs[metalType] = diff;

    // Excel ROUND(C25,-1) rounds to nearest 10; JS Math.round(x/10)*10 agrees.
    const rawRs = diff * rate / 10;
    const rs    = Math.round(rawRs / 10) * 10;
    metal_rs_map[metalType] = rs;
    total_metal_rs += rs;
  }

  const aj       = parseFloat((cash + online).toFixed(2));
  const subtotal = parseFloat((labour_total + total_metal_rs).toFixed(2));

  // Cap discount at subtotal so total_amount can't go negative.
  const rawDiscount = Math.max(0, parseFloat(discount) || 0);
  const effectiveDiscount = parseFloat(Math.min(rawDiscount, Math.max(subtotal, 0)).toFixed(2));
  const total_amount = parseFloat((subtotal - effectiveDiscount).toFixed(2));

  const net = parseFloat((total_amount - aj).toFixed(2));
  const amt_baki   = net > 0 ? net : 0;
  const refund_due = net < 0 ? parseFloat((-net).toFixed(2)) : 0;

  // Backward compat: fine_diff stores Gold 24K diff only
  const fine_diff = metal_diffs["Gold 24K"] || 0;

  let ofg_status, fine_carry;
  if (total_metal_rs <= 0 && fine_diff > 0) {
    ofg_status = "OF.G AFSL";
    fine_carry = parseFloat(fine_diff.toFixed(4));
  } else {
    ofg_status = "OF.G HDF";
    fine_carry = 0;
  }

  return {
    total_pcs, total_weight, labour_total, fine_diff,
    gold_rs: total_metal_rs, subtotal,
    discount: effectiveDiscount, total_amount,
    amt_baki, refund_due,
    ofg_status, fine_carry, amt_jama: aj,
    metal_diffs, metal_rs_map,
  };
};

// --- Line-item insert ---

const _insertItems = async (run, billId, items) => {
  for (const [i, item] of items.entries()) {
    const pcs        = parseInt(item.pcs) || 0;
    const size_value = parseFloat(item.size_value) || 0;
    const weight     = parseFloat((size_value * pcs).toFixed(4));
    const lc_pp      = parseFloat(item.lc_pp) || 0;
    const t_lc       = parseFloat((lc_pp * pcs).toFixed(2));
    await run(
      `INSERT INTO order_bill_items
        (bill_id, metal_type, category, size_label, size_value, pcs, weight, lc_pp, t_lc, is_custom, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billId,
        item.metal_type || "Gold 24K",
        item.category || "Standard",
        item.size_label || "",
        size_value,
        pcs,
        weight,
        lc_pp,
        t_lc,
        item.is_custom ? 1 : 0,
        item.sort_order != null ? item.sort_order : i,
      ]
    );
  }
};

// --- Accounting helpers ---

const _deleteAccountingEntries = async (run, billId) => {
  await run(
    `DELETE FROM customer_ledger_entries WHERE reference_type = ? AND reference_id = ?`,
    [REFERENCE_TYPE, billId]
  );
  await run(
    `DELETE FROM counter_cash_ledger WHERE reference_type = ? AND reference_id = ?`,
    [REFERENCE_TYPE, billId]
  );
  // Also remove any stock transactions created for customer metal deposits
  await run(
    `DELETE FROM stock_transactions WHERE reference_type = ? AND reference_id = ?`,
    [REFERENCE_TYPE, billId]
  );
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

// Writes per-bill accounting rows. Sign convention: amount_delta POSITIVE
// means customer owes more (debit), NEGATIVE means customer paid (credit).
// weight_delta POSITIVE means metal flowed FROM customer TO shop.
const _insertAccountingEntries = async (
  run, billId, obNo, date, customerId, summary, cash, online, metalPayments
) => {
  if (customerId) {
    const subtotal = parseFloat(summary.subtotal) || 0;
    const discount = parseFloat(summary.discount) || 0;
    if (subtotal !== 0) {
      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, line_type, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId, date, REFERENCE_TYPE, billId, String(obNo),
          "BILL_TOTAL", subtotal, "Order bill #" + obNo,
        ]
      );
    }

    if (discount > 0) {
      // Discount = a credit (reduces what the customer owes)
      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, line_type, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId, date, REFERENCE_TYPE, billId, String(obNo),
          "BILL_DISCOUNT", -discount, "Discount on estimate #" + obNo,
        ]
      );
    }

    if (cash > 0) {
      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, line_type, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId, date, REFERENCE_TYPE, billId, String(obNo),
          "PAYMENT_CASH", -cash, "Cash payment",
        ]
      );
    }

    if (online > 0) {
      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, line_type, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId, date, REFERENCE_TYPE, billId, String(obNo),
          "PAYMENT_ONLINE", -online, "Online payment",
        ]
      );
    }

    // Create METAL_IN ledger entries for each metal type with jama > 0
    for (const [metalType, payment] of Object.entries(metalPayments)) {
      const jama = parseFloat(payment.jama) || 0;
      if (jama > 0) {
        await run(
          `INSERT INTO customer_ledger_entries
            (customer_id, entry_date, reference_type, reference_id, reference_no, line_type, metal_type, metal_purity, weight_delta, amount_delta, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            customerId, date, REFERENCE_TYPE, billId, String(obNo),
            "METAL_IN", metalType, METAL_PURITY[metalType] || "99.99",
            jama, 0, `${metalType} JAMA on estimate #${obNo}`,
          ]
        );
      }
    }
  }

  if (cash !== 0) {
    await run(
      `INSERT INTO counter_cash_ledger
        (entry_date, reference_type, reference_id, reference_no, mode, amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [date, REFERENCE_TYPE, billId, String(obNo), "Cash", cash, "Order bill #" + obNo]
    );
  }
  if (online !== 0) {
    await run(
      `INSERT INTO counter_cash_ledger
        (entry_date, reference_type, reference_id, reference_no, mode, amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [date, REFERENCE_TYPE, billId, String(obNo), "Online", online, "Order bill #" + obNo]
    );
  }

  // Create stock transactions for each metal received from customer
  for (const [metalType, payment] of Object.entries(metalPayments)) {
    const jama = parseFloat(payment.jama) || 0;
    if (jama > 0) {
      await run(
        `INSERT INTO stock_transactions
          (date, metal_type, transaction_type, weight, description, reference_type, reference_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          date, metalType, "ESTIMATE_METAL_IN", jama,
          `Customer metal deposit on Estimate #${obNo}`,
          REFERENCE_TYPE, billId,
        ]
      );
    }
  }
};

// --- Create Bill ---

const createBill = async (data) => {
  _validateBillInput(data);
  const ob_no = data.ob_no ? parseInt(data.ob_no) : await getNextObNo();

  const existing = await new Promise((resolve, reject) =>
    db.get(`SELECT id FROM order_bills WHERE ob_no = ?`, [ob_no],
      (err, row) => err ? reject(err) : resolve(row))
  );
  if (existing) throw createAppError("Estimate No. " + ob_no + " already exists. Please use a different number.", 409, "ESTIMATE_NO_CONFLICT");

  const metalPayments = _extractMetalPayments(data);
  const hasJama = _hasAnyMetalJama(metalPayments);
  const hasCustHint = !!(data.customer_id ||
    ((data.customer_phone || "").trim() && (data.customer_name || "").trim()));
  if (hasJama && !hasCustHint) {
    throw createAppError("Metal deposit (JAMA) requires a customer. Please select or add one.", 400, "CUSTOMER_REQUIRED_FOR_METAL_PAYMENT");
  }

  const payments = _normalisePayments(data);
  const discount = Math.max(0, parseFloat(data.discount) || 0);
  const summary  = _computeSummary(data.items || [], metalPayments, payments.cash, payments.online, discount);
  const productsJson = JSON.stringify(
    Array.isArray(data.products) && data.products.length ? data.products : ["Gold 24K"]
  );

  const resolvedCustomerId = await _resolveCustomerId(data);
  if (hasJama && !resolvedCustomerId) {
    throw createAppError("Metal deposit (JAMA) requires a resolvable customer. Please select or add one.", 400, "CUSTOMER_RESOLUTION_REQUIRED");
  }

  return db.runTransaction(async (run) => {
    const { lastID } = await run(
      `INSERT INTO order_bills
        (ob_no, date, product, products,
         customer_id, customer_name, customer_city, customer_address, customer_phone, customer_type,
         fine_jama, rate_10g, jama_gold_22k, rate_gold_22k, jama_silver, rate_silver,
         amt_jama, cash_amount, online_amount, payment_mode,
         total_pcs, total_weight, labour_total, fine_diff, gold_rs,
         subtotal, discount, total_amount, amt_baki, refund_due, ofg_status, fine_carry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ob_no, data.date, data.product || "", productsJson,
        resolvedCustomerId || null,
        data.customer_name || "",
        data.customer_city || "",
        data.customer_address || "",
        data.customer_phone || "",
        data.customer_type || "Retail",
        metalPayments["Gold 24K"].jama, metalPayments["Gold 24K"].rate,
        metalPayments["Gold 22K"].jama, metalPayments["Gold 22K"].rate,
        metalPayments["Silver"].jama,   metalPayments["Silver"].rate,
        summary.amt_jama, payments.cash, payments.online, payments.payment_mode,
        summary.total_pcs, summary.total_weight, summary.labour_total,
        summary.fine_diff, summary.gold_rs,
        summary.subtotal, summary.discount, summary.total_amount,
        summary.amt_baki, summary.refund_due,
        summary.ofg_status, summary.fine_carry,
      ]
    );

    await _insertItems(run, lastID, data.items || []);
    await _insertAccountingEntries(
      run, lastID, ob_no, data.date, resolvedCustomerId, summary,
      payments.cash, payments.online, metalPayments
    );
    if (resolvedCustomerId && summary.amt_baki > 0) {
      await _applyOutstandingDelta(run, resolvedCustomerId, summary.amt_baki);
    }
    return lastID;
  });
};

// --- Update Bill ---

const updateBill = async (id, data) => {
  _validateBillInput(data, { requireObNo: true });
  const ob_no = parseInt(data.ob_no);

  const conflict = await new Promise((resolve, reject) =>
    db.get(`SELECT id FROM order_bills WHERE ob_no = ? AND id != ?`, [ob_no, id],
      (err, row) => err ? reject(err) : resolve(row))
  );
  if (conflict) throw createAppError("Estimate No. " + ob_no + " already exists. Please use a different number.", 409, "ESTIMATE_NO_CONFLICT");

  const metalPayments = _extractMetalPayments(data);
  const payments = _normalisePayments(data);
  const discount = Math.max(0, parseFloat(data.discount) || 0);
  const summary  = _computeSummary(data.items || [], metalPayments, payments.cash, payments.online, discount);
  const productsJson = JSON.stringify(
    Array.isArray(data.products) && data.products.length ? data.products : ["Gold 24K"]
  );

  const resolvedCustomerId = await _resolveCustomerId(data);
  const hasJama = _hasAnyMetalJama(metalPayments);
  if (hasJama && !resolvedCustomerId) {
    throw createAppError("Metal deposit (JAMA) requires a resolvable customer. Please select or add one.", 400, "CUSTOMER_RESOLUTION_REQUIRED");
  }

  return db.runTransaction(async (run, get) => {
    const oldBill = await get(
      `SELECT customer_id, amt_baki FROM order_bills WHERE id = ?`,
      [id]
    );
    if (!oldBill) throw createAppError("Estimate not found", 404, "ESTIMATE_NOT_FOUND");

    await run(
      `UPDATE order_bills SET
         ob_no=?, date=?, product=?, products=?,
         customer_id=?, customer_name=?, customer_city=?, customer_address=?, customer_phone=?, customer_type=?,
         fine_jama=?, rate_10g=?, jama_gold_22k=?, rate_gold_22k=?, jama_silver=?, rate_silver=?,
         amt_jama=?, cash_amount=?, online_amount=?, payment_mode=?,
         total_pcs=?, total_weight=?, labour_total=?, fine_diff=?, gold_rs=?,
         subtotal=?, discount=?, total_amount=?, amt_baki=?, refund_due=?, ofg_status=?, fine_carry=?
       WHERE id=?`,
      [
        ob_no, data.date, data.product || "", productsJson,
        resolvedCustomerId || null,
        data.customer_name || "",
        data.customer_city || "",
        data.customer_address || "",
        data.customer_phone || "",
        data.customer_type || "Retail",
        metalPayments["Gold 24K"].jama, metalPayments["Gold 24K"].rate,
        metalPayments["Gold 22K"].jama, metalPayments["Gold 22K"].rate,
        metalPayments["Silver"].jama,   metalPayments["Silver"].rate,
        summary.amt_jama, payments.cash, payments.online, payments.payment_mode,
        summary.total_pcs, summary.total_weight, summary.labour_total,
        summary.fine_diff, summary.gold_rs,
        summary.subtotal, summary.discount, summary.total_amount,
        summary.amt_baki, summary.refund_due,
        summary.ofg_status, summary.fine_carry,
        id,
      ]
    );

    await run(`DELETE FROM order_bill_items WHERE bill_id = ?`, [id]);
    await _insertItems(run, id, data.items || []);

    await _deleteAccountingEntries(run, id);
    const oldOutstanding = Math.max(0, parseFloat(oldBill.amt_baki) || 0);
    if (oldBill.customer_id && oldOutstanding > 0) {
      await _applyOutstandingDelta(run, oldBill.customer_id, -oldOutstanding);
    }

    await _insertAccountingEntries(
      run, id, ob_no, data.date, resolvedCustomerId, summary,
      payments.cash, payments.online, metalPayments
    );
    if (resolvedCustomerId && summary.amt_baki > 0) {
      await _applyOutstandingDelta(run, resolvedCustomerId, summary.amt_baki);
    }
  });
};

// --- Delete Bill ---

const deleteBill = (id) =>
  db.runTransaction(async (run, get) => {
    const bill = await get(
      `SELECT customer_id, amt_baki FROM order_bills WHERE id = ?`,
      [id]
    );
    if (!bill) return 0;

    await _deleteAccountingEntries(run, id);
    const outstanding = Math.max(0, parseFloat(bill.amt_baki) || 0);
    if (bill.customer_id && outstanding > 0) {
      await _applyOutstandingDelta(run, bill.customer_id, -outstanding);
    }

    await run(`DELETE FROM order_bill_items WHERE bill_id = ?`, [id]);
    const result = await run(`DELETE FROM order_bills WHERE id = ?`, [id]);
    return result.changes || 0;
  });

module.exports = {
  getNextObNo,
  listBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
  _computeSummary,
};
