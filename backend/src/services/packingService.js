'use strict';

const db = require('../../config/dbConfig');

const VALID_PACKING_COLUMNS = new Set([
  'job_number', 'job_name', 'metal_type', 'unit', 'employee', 'issue_size',
  'issue_pieces', 'issued_weight', 'category', 'status',
  'return_weight', 'return_pieces', 'scrap_weight', 'loss_weight',
  'description', 'start_time', 'end_time',
]);

const createPackingProcess = async (
  job_number, metal_type, unit,
  issue_size, issue_pieces, category, employee, description = ''
) => {
  const { lastID } = await db.pRun(
    `INSERT INTO packing_processes
       (job_number, metal_type, unit, issue_size, issue_pieces,
        category, employee, status, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [job_number, metal_type, unit, issue_size, issue_pieces, category, employee, description]
  );
  return lastID;
};

const startPackingProcess = async (processId, issued_weight, issue_pieces, employee, description) => {
  await db.pRun(
    `UPDATE packing_processes
        SET status = 'RUNNING', issued_weight = ?, issue_pieces = ?,
            employee = COALESCE(?, employee),
            description = COALESCE(?, description),
            start_time = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [issued_weight, issue_pieces, employee, description, processId]
  );
};

const completePackingProcess = async (
  processId, return_weight, return_pieces, scrap_weight, loss_weight, description = ''
) => {
  await db.pRun(
    `UPDATE packing_processes
        SET status = 'COMPLETED', return_weight = ?, return_pieces = ?,
            scrap_weight = ?, loss_weight = ?,
            end_time = CURRENT_TIMESTAMP,
            description = COALESCE(NULLIF(?, ''), description)
      WHERE id = ?`,
    [return_weight, return_pieces, scrap_weight, loss_weight, description, processId]
  );
};

const getPackingProcessById = async (id) => {
  return db.pGet(`SELECT * FROM packing_processes WHERE id = ?`, [id]);
};

const getAllPackingProcesses = async () => {
  return db.pAll(`SELECT * FROM packing_processes ORDER BY id DESC`);
};

const addFinishedGoods = async (metal_type, target_product, pieces, weight, metadata = {}) => {
  const { reference_type = '', reference_id = null, created_at = null } = metadata;
  const { lastID } = await db.pRun(
    `INSERT INTO finished_goods
       (metal_type, target_product, pieces, weight, created_at, reference_type, reference_id)
     VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?)`,
    [metal_type, target_product, pieces, weight, created_at, reference_type, reference_id]
  );
  return lastID;
};

const removeFinishedGoodsByReference = async (referenceType, referenceId) => {
  const { changes } = await db.pRun(
    `DELETE FROM finished_goods WHERE reference_type = ? AND reference_id = ?`,
    [referenceType, referenceId]
  );
  return changes;
};

/** Legacy fallback: remove one untyped source row by exact weight match. */
const removeFinishedGoods = async (metal_type, target_product, weight) => {
  const { changes } = await db.pRun(
    `DELETE FROM finished_goods
      WHERE id = (
        SELECT id FROM finished_goods
         WHERE metal_type = ?
           AND target_product = ?
           AND weight = ?
           AND COALESCE(reference_type, '') = ''
         ORDER BY id DESC LIMIT 1
      )`,
    [metal_type, target_product, weight]
  );
  return changes;
};

const updatePackingIssuedWeight = async (processId, new_weight) => {
  await db.pRun(
    `UPDATE packing_processes SET issued_weight = ? WHERE id = ?`,
    [new_weight, processId]
  );
};

const deletePackingProcessById = async (id) => {
  await db.pRun(
    `DELETE FROM process_return_items WHERE process_id = ? AND process_type = 'packing'`, [id]
  );
  const { changes } = await db.pRun(
    `DELETE FROM packing_processes WHERE id = ?`, [id]
  );
  return changes;
};

const editPackingProcessUniversal = async (processId, updates) => {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    if (!VALID_PACKING_COLUMNS.has(key)) throw new Error(`Invalid column name: ${key}`);
    fields.push(`${key} = ?`);
    values.push(val);
  }
  if (fields.length === 0) return 0;
  values.push(processId);
  const { changes } = await db.pRun(
    `UPDATE packing_processes SET ${fields.join(', ')} WHERE id = ?`, values
  );
  return changes;
};

module.exports = {
  createPackingProcess,
  startPackingProcess,
  completePackingProcess,
  getPackingProcessById,
  getAllPackingProcesses,
  addFinishedGoods,
  removeFinishedGoodsByReference,
  removeFinishedGoods,
  updatePackingIssuedWeight,
  deletePackingProcessById,
  editPackingProcessUniversal,
};
