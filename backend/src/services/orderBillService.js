const db = require("../../config/dbConfig");

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Next OB Number ───────────────────────────────────────────────────────────

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

// ─── List Bills ───────────────────────────────────────────────────────────────

const listBills = () =>
  new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM order_bills ORDER BY ob_no DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(
          (rows || []).map((r) => ({ ...r, products: parseProducts(r.products) }))
        );
      }
    );
  });

// ─── Get Bill by ID ───────────────────────────────────────────────────────────

const getBillById = (id) =>
  new Promise((resolve, reject) => {
    db.get(`SELECT * FROM order_bills WHERE id = ?`, [id], (err, bill) => {
      if (err) return reject(err);
      if (!bill) return resolve(null);
      db.all(
        `SELECT * FROM order_bill_items WHERE bill_id = ? ORDER BY metal_type, sort_order`,
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
    });
  });

// ─── Server-side Recalculation ────────────────────────────────────────────────
// Recalculates all bill summary fields from items + fine gold inputs.
// This ensures the DB always holds consistent data regardless of what the
// frontend sends.

const _computeSummary = (items, fine_jama, rate_10g, amt_jama) => {
  let total_pcs = 0;
  let total_weight = 0;
  let labour_total = 0;

  for (const item of items) {
    const pcs = parseInt(item.pcs) || 0;
    const sv = parseFloat(item.size_value) || 0;
    const weight = parseFloat((sv * pcs).toFixed(4));
    const lc_pp = parseFloat(item.lc_pp) || 0;
    const t_lc = parseFloat((lc_pp * pcs).toFixed(2));
    total_pcs += pcs;
    total_weight = parseFloat((total_weight + weight).toFixed(4));
    labour_total = parseFloat((labour_total + t_lc).toFixed(2));
  }

  const fj = parseFloat(fine_jama) || 0;
  const r10 = parseFloat(rate_10g) || 0;
  const aj = parseFloat(amt_jama) || 0;

  const fine_diff = parseFloat((total_weight - fj).toFixed(4));

  // Gold RS = round(fine_diff × rate_10g ÷ 10) to nearest ₹10
  const rawGoldRs = fine_diff * r10 / 10;
  const gold_rs = Math.round(rawGoldRs / 10) * 10;

  const subtotal = parseFloat((labour_total + gold_rs).toFixed(2));
  const amt_baki = parseFloat((subtotal - aj).toFixed(2));

  // OF.G Status: if gold_rs <= 0 AND fine_diff > 0 → "OF.G AFSL", else "OF.G HDF"
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
    gold_rs, subtotal, amt_baki, ofg_status, fine_carry,
  };
};

// ─── Insert Items ─────────────────────────────────────────────────────────────

const _insertItems = async (run, billId, items) => {
  for (const [i, item] of items.entries()) {
    const pcs = parseInt(item.pcs) || 0;
    const size_value = parseFloat(item.size_value) || 0;
    const weight = parseFloat((size_value * pcs).toFixed(4));
    const lc_pp = parseFloat(item.lc_pp) || 0;
    const t_lc = parseFloat((lc_pp * pcs).toFixed(2));
    await run(
      `INSERT INTO order_bill_items
        (bill_id, metal_type, size_label, size_value, pcs, weight, lc_pp, t_lc, is_custom, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billId,
        item.metal_type || "Gold 24K",
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

// ─── Create Bill ──────────────────────────────────────────────────────────────

const createBill = async (data) => {
  // Use provided ob_no if given (user may have edited it), else auto-generate
  const ob_no = data.ob_no ? parseInt(data.ob_no) : await getNextObNo();

  // Check uniqueness
  const existing = await new Promise((resolve, reject) =>
    db.get(`SELECT id FROM order_bills WHERE ob_no = ?`, [ob_no],
      (err, row) => err ? reject(err) : resolve(row))
  );
  if (existing) throw new Error(`OB No. ${ob_no} already exists. Please use a different number.`);

  const summary = _computeSummary(
    data.items || [],
    data.fine_jama,
    data.rate_10g,
    data.amt_jama
  );
  const productsJson = JSON.stringify(
    Array.isArray(data.products) && data.products.length ? data.products : ["Gold 24K"]
  );

  return db.runTransaction(async (run) => {
    const { lastID } = await run(
      `INSERT INTO order_bills
        (ob_no, date, product, products, customer_name, customer_city, customer_phone,
         customer_type, fine_jama, rate_10g, amt_jama,
         total_pcs, total_weight, labour_total, fine_diff, gold_rs,
         subtotal, amt_baki, ofg_status, fine_carry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ob_no,
        data.date,
        data.product || "",
        productsJson,
        data.customer_name || "",
        data.customer_city || "",
        data.customer_phone || "",
        data.customer_type || "Retail",
        parseFloat(data.fine_jama) || 0,
        parseFloat(data.rate_10g) || 0,
        parseFloat(data.amt_jama) || 0,
        summary.total_pcs,
        summary.total_weight,
        summary.labour_total,
        summary.fine_diff,
        summary.gold_rs,
        summary.subtotal,
        summary.amt_baki,
        summary.ofg_status,
        summary.fine_carry,
      ]
    );

    await _insertItems(run, lastID, data.items || []);
    return lastID;
  });
};

// ─── Update Bill ──────────────────────────────────────────────────────────────

const updateBill = async (id, data) => {
  const ob_no = parseInt(data.ob_no);

  // Check ob_no uniqueness (exclude current bill)
  const conflict = await new Promise((resolve, reject) =>
    db.get(`SELECT id FROM order_bills WHERE ob_no = ? AND id != ?`, [ob_no, id],
      (err, row) => err ? reject(err) : resolve(row))
  );
  if (conflict) throw new Error(`OB No. ${ob_no} already exists. Please use a different number.`);

  const summary = _computeSummary(
    data.items || [],
    data.fine_jama,
    data.rate_10g,
    data.amt_jama
  );
  const productsJson = JSON.stringify(
    Array.isArray(data.products) && data.products.length ? data.products : ["Gold 24K"]
  );

  return db.runTransaction(async (run) => {
    await run(
      `UPDATE order_bills SET
        ob_no=?, date=?, product=?, products=?, customer_name=?, customer_city=?,
        customer_phone=?, customer_type=?, fine_jama=?, rate_10g=?, amt_jama=?,
        total_pcs=?, total_weight=?, labour_total=?, fine_diff=?, gold_rs=?,
        subtotal=?, amt_baki=?, ofg_status=?, fine_carry=?
       WHERE id=?`,
      [
        ob_no,
        data.date,
        data.product || "",
        productsJson,
        data.customer_name || "",
        data.customer_city || "",
        data.customer_phone || "",
        data.customer_type || "Retail",
        parseFloat(data.fine_jama) || 0,
        parseFloat(data.rate_10g) || 0,
        parseFloat(data.amt_jama) || 0,
        summary.total_pcs,
        summary.total_weight,
        summary.labour_total,
        summary.fine_diff,
        summary.gold_rs,
        summary.subtotal,
        summary.amt_baki,
        summary.ofg_status,
        summary.fine_carry,
        id,
      ]
    );

    await run(`DELETE FROM order_bill_items WHERE bill_id = ?`, [id]);
    await _insertItems(run, id, data.items || []);
  });
};

// ─── Delete Bill ──────────────────────────────────────────────────────────────

const deleteBill = (id) =>
  new Promise((resolve, reject) => {
    db.get(`SELECT id FROM order_bills WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(0);
      db.runTransaction(async (run) => {
        await run(`DELETE FROM order_bills WHERE id = ?`, [id]);
        return 1;
      }).then(resolve).catch(reject);
    });
  });

module.exports = { getNextObNo, listBills, getBillById, createBill, updateBill, deleteBill };
