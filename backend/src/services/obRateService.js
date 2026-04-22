const db = require("../../config/dbConfig");

// Returns all rows from ob_labour_rates ordered by metal_type, sort_order
const getAllRates = () =>
  new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM ob_labour_rates ORDER BY metal_type, sort_order`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });

// Bulk-updates lc_pp_retail, lc_pp_showroom, lc_pp_wholesale for a list of rate rows.
// updates: [{ id, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }]
const bulkUpdate = (updates) =>
  new Promise((resolve, reject) => {
    if (!updates || updates.length === 0) return resolve({ updated: 0 });
    db.serialize(() => {
      const stmt = db.prepare(
        `UPDATE ob_labour_rates
         SET lc_pp_retail = ?, lc_pp_showroom = ?, lc_pp_wholesale = ?
         WHERE id = ?`
      );
      let error = null;
      updates.forEach(({ id, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }) => {
        stmt.run(
          [
            parseFloat(lc_pp_retail)    || 0,
            parseFloat(lc_pp_showroom)  || 0,
            parseFloat(lc_pp_wholesale) || 0,
            id,
          ],
          (err) => { if (err) error = err; }
        );
      });
      stmt.finalize((err) => {
        if (err || error) return reject(err || error);
        resolve({ updated: updates.length });
      });
    });
  });

// Add a new rate row.  sort_order is auto-assigned as max+1 within the metal.
const addRate = ({ metal_type, size_label, size_value, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }) =>
  new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
       FROM ob_labour_rates WHERE metal_type = ?`,
      [metal_type],
      (err, row) => {
        if (err) return reject(err);
        const nextOrder = row?.next_order ?? 1;
        const sv = size_value != null && size_value !== "" ? parseFloat(size_value) : null;
        const isCustom = sv == null ? 1 : 0;
        db.run(
          `INSERT INTO ob_labour_rates
            (metal_type, size_label, size_value, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, is_custom, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            metal_type,
            size_label,
            sv,
            parseFloat(lc_pp_retail)    || 0,
            parseFloat(lc_pp_showroom)  || 0,
            parseFloat(lc_pp_wholesale) || 0,
            isCustom,
            nextOrder,
          ],
          function (err2) {
            if (err2) return reject(err2);
            resolve({ id: this.lastID, sort_order: nextOrder });
          }
        );
      }
    );
  });

// Delete a rate row by ID.
const deleteRate = (id) =>
  new Promise((resolve, reject) => {
    db.run(`DELETE FROM ob_labour_rates WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve({ deleted: this.changes });
    });
  });

module.exports = { getAllRates, bulkUpdate, addRate, deleteRate };
