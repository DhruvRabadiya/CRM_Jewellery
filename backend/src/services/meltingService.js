'use strict';

const db = require('../../config/dbConfig');

const VALID_MELTING_COLUMNS = new Set([
  'metal_type', 'unit', 'issue_weight', 'issue_size', 'issue_pieces', 'issued_weight',
  'return_weight', 'return_pieces', 'scrap_weight', 'loss_weight',
  'description', 'employee', 'category', 'status',
  'start_time', 'end_time', 'completed_at',
]);

const createMeltingProcess = async (
  job_number, job_name, metal_type, unit,
  issue_size, issue_pieces, category, employee, description = ''
) => {
  const { lastID } = await db.pRun(
    `INSERT INTO melting_process
       (job_number, job_name, metal_type, unit, issue_weight, issue_size, issue_pieces,
        category, employee, description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [job_number, job_name, metal_type, unit, issue_size, issue_size, issue_pieces, category, employee, description]
  );
  return lastID;
};

const startMeltingProcess = async (processId, issued_weight, issue_pieces, employee, description) => {
  await db.pRun(
    `UPDATE melting_process
        SET status = 'RUNNING', issued_weight = ?, issue_pieces = ?,
            employee = COALESCE(?, employee),
            description = COALESCE(?, description),
            start_time = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [issued_weight, issue_pieces, employee, description, processId]
  );
};

const completeMeltingProcess = async (
  processId, return_weight, return_pieces, scrap_weight, loss_weight, description = ''
) => {
  const { changes } = await db.pRun(
    `UPDATE melting_process
        SET status = 'COMPLETED', return_weight = ?, return_pieces = ?,
            scrap_weight = ?, loss_weight = ?,
            end_time = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP,
            description = COALESCE(NULLIF(?, ''), description)
      WHERE id = ?`,
    [return_weight, return_pieces, scrap_weight, loss_weight, description, processId]
  );
  return changes;
};

const getMeltingProcessById = async (processId) => {
  return db.pGet(`SELECT * FROM melting_process WHERE id = ?`, [processId]);
};

const editMeltingProcess = async (processId, updates) => {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    if (!VALID_MELTING_COLUMNS.has(key)) throw new Error(`Invalid column name: ${key}`);
    fields.push(`${key} = ?`);
    values.push(val);
  }
  if (fields.length === 0) return 0;
  values.push(processId);
  const { changes } = await db.pRun(
    `UPDATE melting_process SET ${fields.join(', ')} WHERE id = ?`, values
  );
  return changes;
};

const deleteMeltingProcess = async (processId) => {
  await db.pRun(
    `DELETE FROM process_return_items WHERE process_id = ? AND process_type = 'melting'`,
    [processId]
  );
  const { changes } = await db.pRun(
    `DELETE FROM melting_process WHERE id = ?`, [processId]
  );
  return changes;
};

const getRunningMelts = async () => {
  return db.pAll(`SELECT *, created_at AS date FROM melting_process WHERE status = 'RUNNING'`);
};

const getAllMeltingProcesses = async () => {
  return db.pAll(`SELECT *, created_at AS date FROM melting_process ORDER BY id DESC`);
};

module.exports = {
  createMeltingProcess,
  startMeltingProcess,
  completeMeltingProcess,
  getMeltingProcessById,
  editMeltingProcess,
  deleteMeltingProcess,
  getRunningMelts,
  getAllMeltingProcesses,
};
