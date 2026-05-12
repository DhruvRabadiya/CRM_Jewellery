'use strict';

const db = require('../../config/dbConfig');

const VALID_ROLLING_COLUMNS = new Set([
  'job_number', 'job_name', 'metal_type', 'unit', 'employee', 'issue_size',
  'issue_pieces', 'issued_weight', 'category', 'status',
  'return_weight', 'return_pieces', 'scrap_weight', 'loss_weight',
  'description', 'start_time', 'end_time',
]);

const createRollingProcess = async (
  job_number, job_name, metal_type, unit,
  issue_size, issue_pieces, category, employee, description = ''
) => {
  const { lastID } = await db.pRun(
    `INSERT INTO rolling_processes
       (job_number, job_name, metal_type, unit, employee, issue_size, issue_pieces,
        category, status, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [job_number, job_name, metal_type, unit, employee, issue_size, issue_pieces, category, description]
  );
  return lastID;
};

const startRollingProcess = async (processId, issued_weight, issue_pieces, employee, description) => {
  await db.pRun(
    `UPDATE rolling_processes
        SET status = 'RUNNING', issued_weight = ?, issue_pieces = ?,
            employee = COALESCE(?, employee),
            description = COALESCE(?, description),
            start_time = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [issued_weight, issue_pieces, employee, description, processId]
  );
};

const completeRollingProcess = async (
  processId, return_weight, return_pieces, scrap_weight, loss_weight, description = ''
) => {
  await db.pRun(
    `UPDATE rolling_processes
        SET status = 'COMPLETED', return_weight = ?, return_pieces = ?,
            scrap_weight = ?, loss_weight = ?,
            end_time = CURRENT_TIMESTAMP,
            description = COALESCE(NULLIF(?, ''), description)
      WHERE id = ?`,
    [return_weight, return_pieces, scrap_weight, loss_weight, description, processId]
  );
};

const getRollingProcessById = async (id) => {
  return db.pGet(`SELECT * FROM rolling_processes WHERE id = ?`, [id]);
};

const getAllRollingProcesses = async () => {
  return db.pAll(`SELECT * FROM rolling_processes ORDER BY id DESC`);
};

const updateRollingIssuedWeight = async (processId, new_weight) => {
  await db.pRun(
    `UPDATE rolling_processes SET issued_weight = ? WHERE id = ?`,
    [new_weight, processId]
  );
};

const deleteRollingProcessById = async (id) => {
  await db.pRun(
    `DELETE FROM process_return_items WHERE process_id = ? AND process_type = 'rolling'`, [id]
  );
  const { changes } = await db.pRun(
    `DELETE FROM rolling_processes WHERE id = ?`, [id]
  );
  return changes;
};

const editRollingProcessUniversal = async (processId, updates) => {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    if (!VALID_ROLLING_COLUMNS.has(key)) throw new Error(`Invalid column name: ${key}`);
    fields.push(`${key} = ?`);
    values.push(val);
  }
  if (fields.length === 0) return 0;
  values.push(processId);
  const { changes } = await db.pRun(
    `UPDATE rolling_processes SET ${fields.join(', ')} WHERE id = ?`, values
  );
  return changes;
};

module.exports = {
  createRollingProcess,
  startRollingProcess,
  completeRollingProcess,
  getRollingProcessById,
  getAllRollingProcesses,
  updateRollingIssuedWeight,
  deleteRollingProcessById,
  editRollingProcessUniversal,
};
