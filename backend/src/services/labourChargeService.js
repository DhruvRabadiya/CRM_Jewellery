'use strict';

const db = require('../../config/dbConfig');

const _coerceRow = (data) => ({
  metal_type:        (data.metal_type || '').trim(),
  category:          (data.category   || 'Standard').trim(),
  size_label:        (data.size_label || '').trim(),
  size_value:        (data.size_value == null || data.size_value === '')
                       ? null
                       : parseFloat(data.size_value),
  lc_pp_retail:      parseFloat(data.lc_pp_retail)    || 0,
  lc_pp_showroom:    parseFloat(data.lc_pp_showroom)  || 0,
  lc_pp_wholesale:   parseFloat(data.lc_pp_wholesale) || 0,
  sort_order:        parseInt(data.sort_order, 10)    || 0,
});

/** Fetch all rows ordered for tree display. */
const getAll = async () => {
  return db.pAll(
    `SELECT * FROM labour_charges ORDER BY metal_type, category, sort_order, size_label`
  );
};

/** Filter by metal type. */
const getByMetal = async (metalType) => {
  return db.pAll(
    `SELECT * FROM labour_charges WHERE metal_type = ?
      ORDER BY category, sort_order, size_label`,
    [metalType]
  );
};

/** Grouped structure: { [metalType]: { [category]: [sizeRows…] } } */
const getGrouped = async () => {
  const rows = await db.pAll(
    `SELECT * FROM labour_charges ORDER BY metal_type, category, sort_order, size_label`
  );
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.metal_type]) grouped[r.metal_type] = {};
    if (!grouped[r.metal_type][r.category]) grouped[r.metal_type][r.category] = [];
    grouped[r.metal_type][r.category].push(r);
  }
  return grouped;
};

const create = async (data) => {
  const r = _coerceRow(data);
  const { lastID } = await db.pRun(
    `INSERT INTO labour_charges
       (metal_type, category, size_label, size_value,
        lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.metal_type, r.category, r.size_label, r.size_value,
     r.lc_pp_retail, r.lc_pp_showroom, r.lc_pp_wholesale, r.sort_order]
  );
  return db.pGet(`SELECT * FROM labour_charges WHERE id = ?`, [lastID]);
};

const update = async (id, data) => {
  const r = _coerceRow(data);
  const { changes } = await db.pRun(
    `UPDATE labour_charges
        SET metal_type=?, category=?, size_label=?, size_value=?,
            lc_pp_retail=?, lc_pp_showroom=?, lc_pp_wholesale=?, sort_order=?,
            updated_at=CURRENT_TIMESTAMP
      WHERE id=?`,
    [r.metal_type, r.category, r.size_label, r.size_value,
     r.lc_pp_retail, r.lc_pp_showroom, r.lc_pp_wholesale, r.sort_order, id]
  );
  if (changes === 0) throw new Error('Labour charge not found');
  return db.pGet(`SELECT * FROM labour_charges WHERE id = ?`, [id]);
};

/** Bulk update rates only. Payload: [{ id, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }] */
const bulkUpdateRates = (updates) =>
  db.runTransaction(async (run) => {
    for (const u of updates || []) {
      await run(
        `UPDATE labour_charges
            SET lc_pp_retail=?, lc_pp_showroom=?, lc_pp_wholesale=?,
                updated_at=CURRENT_TIMESTAMP
          WHERE id=?`,
        [
          parseFloat(u.lc_pp_retail)    || 0,
          parseFloat(u.lc_pp_showroom)  || 0,
          parseFloat(u.lc_pp_wholesale) || 0,
          u.id,
        ]
      );
    }
    return { updated: (updates || []).length };
  });

const remove = async (id) => {
  const { changes } = await db.pRun(
    `DELETE FROM labour_charges WHERE id = ?`, [id]
  );
  if (changes === 0) throw new Error('Labour charge not found');
  return { deleted: true };
};

module.exports = { getAll, getByMetal, getGrouped, create, update, bulkUpdateRates, remove };
