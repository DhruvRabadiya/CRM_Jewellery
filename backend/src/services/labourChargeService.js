const db = require("../../config/dbConfig");

// Fetch all rows, ordered for tree display
const getAll = () =>
  new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM labour_charges ORDER BY metal_type, category, sort_order, size_label`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });

// Filter by metal type
const getByMetal = (metalType) =>
  new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM labour_charges WHERE metal_type = ? ORDER BY category, sort_order, size_label`,
      [metalType],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });

// Return a grouped structure: { [metalType]: { [category]: [sizeRows...] } }
const getGrouped = () =>
  new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM labour_charges ORDER BY metal_type, category, sort_order, size_label`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        const grouped = {};
        (rows || []).forEach((r) => {
          if (!grouped[r.metal_type]) grouped[r.metal_type] = {};
          if (!grouped[r.metal_type][r.category]) grouped[r.metal_type][r.category] = [];
          grouped[r.metal_type][r.category].push(r);
        });
        resolve(grouped);
      }
    );
  });

const _coerceRow = (data) => ({
  metal_type: (data.metal_type || "").trim(),
  category: (data.category || "Standard").trim(),
  size_label: (data.size_label || "").trim(),
  size_value: data.size_value == null || data.size_value === "" ? null : parseFloat(data.size_value),
  lc_pp_retail: parseFloat(data.lc_pp_retail) || 0,
  lc_pp_showroom: parseFloat(data.lc_pp_showroom) || 0,
  lc_pp_wholesale: parseFloat(data.lc_pp_wholesale) || 0,
  sort_order: parseInt(data.sort_order) || 0,
});

const create = (data) =>
  new Promise((resolve, reject) => {
    const r = _coerceRow(data);
    db.run(
      `INSERT INTO labour_charges
        (metal_type, category, size_label, size_value, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.metal_type, r.category, r.size_label, r.size_value, r.lc_pp_retail, r.lc_pp_showroom, r.lc_pp_wholesale, r.sort_order],
      function (err) {
        if (err) return reject(err);
        db.get(`SELECT * FROM labour_charges WHERE id = ?`, [this.lastID], (err2, row) => {
          if (err2) return reject(err2);
          resolve(row);
        });
      }
    );
  });

const update = (id, data) =>
  new Promise((resolve, reject) => {
    const r = _coerceRow(data);
    db.run(
      `UPDATE labour_charges
       SET metal_type=?, category=?, size_label=?, size_value=?,
           lc_pp_retail=?, lc_pp_showroom=?, lc_pp_wholesale=?, sort_order=?,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [r.metal_type, r.category, r.size_label, r.size_value, r.lc_pp_retail, r.lc_pp_showroom, r.lc_pp_wholesale, r.sort_order, id],
      function (err) {
        if (err) return reject(err);
        if (this.changes === 0) return reject(new Error("Labour charge not found"));
        db.get(`SELECT * FROM labour_charges WHERE id = ?`, [id], (err2, row) => {
          if (err2) return reject(err2);
          resolve(row);
        });
      }
    );
  });

// Bulk update rates only (existing rows). Payload: [{ id, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }]
const bulkUpdateRates = (updates) =>
  db.runTransaction(async (run) => {
    for (const u of updates || []) {
      await run(
        `UPDATE labour_charges
         SET lc_pp_retail=?, lc_pp_showroom=?, lc_pp_wholesale=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [
          parseFloat(u.lc_pp_retail) || 0,
          parseFloat(u.lc_pp_showroom) || 0,
          parseFloat(u.lc_pp_wholesale) || 0,
          u.id,
        ]
      );
    }
    return { updated: (updates || []).length };
  });

const remove = (id) =>
  new Promise((resolve, reject) => {
    db.run(`DELETE FROM labour_charges WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      if (this.changes === 0) return reject(new Error("Labour charge not found"));
      resolve({ deleted: true });
    });
  });

module.exports = { getAll, getByMetal, getGrouped, create, update, bulkUpdateRates, remove };
