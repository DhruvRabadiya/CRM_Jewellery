const db = require("../../config/dbConfig");
const customerService = require("./customerService");
const { createAppError, isValidMetalType } = require("../utils/common");

// --- Constants ---

// reference_type discriminator in customer_ledger_entries / counter_cash_ledger.
// Keep distinct from "SELLING_BILL" so each bill type's accounting rows are
// independently deletable/updatable.
const REFERENCE_TYPE = "ORDER_BILL";

// F. JAMA in the Excel bill is unqualified fine gold - always recorded as
// Gold 24K at 99.99 purity in the ledger. Any future requirement to record
// 22K-as-jama can extend this to a per-line purity, but today it's singular.
const FINE_METAL_TYPE  = "Gold 24K";
const FINE_METAL_PURITY = "99.99";

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
// Re-derives every summary field from items + fine gold inputs + payments.
// Formulas mirror the Excel "Sample Bill Format" sheet exactly.
const _computeSummary = (items, fine_jama, rate_10g, cash, online) => {
  let total_pcs = 0;
  let total_weight = 0;
  let labour_total = 0;

  for (const item of items) {
    const pcs    = parseInt(item.pcs)        || 0;
    const sv     = parseFloat(item.size_value) || 0;
    const weight = parseFloat((sv * pcs).toFixed(4));
    const lc_pp  = parseFloat(item.lc_pp)    || 0;
    const t_lc   = parseFloat((lc_pp * pcs).toFixed(2));
    total_pcs   += pcs;
    total_weight = parseFloat((total_weight + weight).toFixed(4));
    labour_total = parseFloat((labour_total + t_lc).toFixed(2));
  }

  const fj  = parseFloat(fine_jama) || 0;
  const r10 = parseFloat(rate_10g)  || 0;
  const aj  = parseFloat((cash + online).toFixed(2));

  const fine_diff = parseFloat((total_weight - fj).toFixed(4));

  // Excel ROUND(C25,-1) rounds to nearest 10; JS Math.round(x/10)*10 agrees.
  const rawGoldRs = fine_diff * r10 / 10;
  const gold_rs   = Math.round(rawGoldRs / 10) * 10;

  const subtotal = parseFloat((labour_total + gold_rs).toFixed(2));
  const amt_baki = parseFloat((subtotal - aj).toFixed(2));

  let ofg_status, fine_carry;
  if (gold_rs <= 0 && fine_diff > 0) {
    ofg_status = "OF.G AFSL";
    fine_carry = parseFloat(fine_diff.toFixed(4));
  } else {
    ofg_status = "OF.G HDF";
    fine_carry = 0;
  }

  return {
    total_pcs, total_weight, labour_total, fine_diff,
    gold_rs, subtotal, amt_baki, ofg_status, fine_carry, amt_jama: aj,
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
  run, billId, obNo, date, customerId, summary, cash, online, fine_jama
) => {
  if (customerId) {
    const subtotal = parseFloat(summary.subtotal) || 0;
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

    const fj = parseFloat(fine_jama) || 0;
    if (fj > 0) {
      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, line_type, metal_type, metal_purity, weight_delta, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId, date, REFERENCE_TYPE, billId, String(obNo),
          "METAL_IN", FINE_METAL_TYPE, FINE_METAL_PURITY,
          fj, 0, "F. JAMA on order bill #" + obNo,
        ]
      );
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

  const fj = parseFloat(data.fine_jama) || 0;
  const hasCustHint = !!(data.customer_id ||
    ((data.customer_phone || "").trim() && (data.customer_name || "").trim()));
  if (fj > 0 && !hasCustHint) {
    throw createAppError("F. JAMA (metal deposit) requires a customer. Please select or add one.", 400, "CUSTOMER_REQUIRED_FOR_FINE");
  }

  const payments = _normalisePayments(data);
  const summary  = _computeSummary(data.items || [], data.fine_jama, data.rate_10g, payments.cash, payments.online);
  const productsJson = JSON.stringify(
    Array.isArray(data.products) && data.products.length ? data.products : ["Gold 24K"]
  );

  const resolvedCustomerId = await _resolveCustomerId(data);
  if (fj > 0 && !resolvedCustomerId) {
    throw createAppError("F. JAMA (metal deposit) requires a resolvable customer. Please select or add one.", 400, "CUSTOMER_RESOLUTION_REQUIRED");
  }

  return db.runTransaction(async (run) => {
    const { lastID } = await run(
      `INSERT INTO order_bills
        (ob_no, date, product, products,
         customer_id, customer_name, customer_city, customer_address, customer_phone, customer_type,
         fine_jama, rate_10g, amt_jama, cash_amount, online_amount, payment_mode,
         total_pcs, total_weight, labour_total, fine_diff, gold_rs,
         subtotal, amt_baki, ofg_status, fine_carry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ob_no, data.date, data.product || "", productsJson,
        resolvedCustomerId || null,
        data.customer_name || "",
        data.customer_city || "",
        data.customer_address || "",
        data.customer_phone || "",
        data.customer_type || "Retail",
        parseFloat(data.fine_jama) || 0,
        parseFloat(data.rate_10g) || 0,
        summary.amt_jama, payments.cash, payments.online, payments.payment_mode,
        summary.total_pcs, summary.total_weight, summary.labour_total,
        summary.fine_diff, summary.gold_rs,
        summary.subtotal, summary.amt_baki, summary.ofg_status, summary.fine_carry,
      ]
    );

    await _insertItems(run, lastID, data.items || []);
    await _insertAccountingEntries(
      run, lastID, ob_no, data.date, resolvedCustomerId, summary,
      payments.cash, payments.online, parseFloat(data.fine_jama) || 0
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

  const fj = parseFloat(data.fine_jama) || 0;
  const payments = _normalisePayments(data);
  const summary  = _computeSummary(data.items || [], data.fine_jama, data.rate_10g, payments.cash, payments.online);
  const productsJson = JSON.stringify(
    Array.isArray(data.products) && data.products.length ? data.products : ["Gold 24K"]
  );

  const resolvedCustomerId = await _resolveCustomerId(data);
  if (fj > 0 && !resolvedCustomerId) {
    throw createAppError("F. JAMA (metal deposit) requires a resolvable customer. Please select or add one.", 400, "CUSTOMER_RESOLUTION_REQUIRED");
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
         fine_jama=?, rate_10g=?, amt_jama=?, cash_amount=?, online_amount=?, payment_mode=?,
         total_pcs=?, total_weight=?, labour_total=?, fine_diff=?, gold_rs=?,
         subtotal=?, amt_baki=?, ofg_status=?, fine_carry=?
       WHERE id=?`,
      [
        ob_no, data.date, data.product || "", productsJson,
        resolvedCustomerId || null,
        data.customer_name || "",
        data.customer_city || "",
        data.customer_address || "",
        data.customer_phone || "",
        data.customer_type || "Retail",
        parseFloat(data.fine_jama) || 0,
        parseFloat(data.rate_10g) || 0,
        summary.amt_jama, payments.cash, payments.online, payments.payment_mode,
        summary.total_pcs, summary.total_weight, summary.labour_total,
        summary.fine_diff, summary.gold_rs,
        summary.subtotal, summary.amt_baki, summary.ofg_status, summary.fine_carry,
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
      payments.cash, payments.online, parseFloat(data.fine_jama) || 0
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
