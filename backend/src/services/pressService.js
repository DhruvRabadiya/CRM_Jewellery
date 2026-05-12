'use strict';

const db = require('../../config/dbConfig');

const VALID_PRESS_COLUMNS = new Set([
  'job_number', 'job_name', 'metal_type', 'unit', 'employee', 'issue_size',
  'issue_pieces', 'issued_weight', 'category', 'status',
  'return_weight', 'return_pieces', 'scrap_weight', 'loss_weight',
  'description', 'start_time', 'end_time',
]);

const createPressProcess = async (
  job_number, job_name, metal_type, unit,
  issue_size, issue_pieces, category, employee, description = ''
) => {
  const { lastID } = await db.pRun(
    `INSERT INTO press_processes
       (job_number, job_name, metal_type, unit, issue_size, issue_pieces,
        category, employee, status, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [job_number, job_name, metal_type, unit, issue_size, issue_pieces, category, employee, description]
  );
  return lastID;
};

const startPressProcess = async (processId, issued_weight, issue_pieces, employee, description) => {
  await db.pRun(
    `UPDATE press_processes
        SET status = 'RUNNING', issued_weight = ?, issue_pieces = ?,
            employee = COALESCE(?, employee),
            description = COALESCE(?, description),
            start_time = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [issued_weight, issue_pieces, employee, description, processId]
  );
};

const completePressProcess = async (
  processId, return_weight, return_pieces, scrap_weight, loss_weight, description = ''
) => {
  await db.pRun(
    `UPDATE press_processes
        SET status = 'COMPLETED', return_weight = ?, return_pieces = ?,
            scrap_weight = ?, loss_weight = ?,
            end_time = CURRENT_TIMESTAMP,
            description = COALESCE(NULLIF(?, ''), description)
      WHERE id = ?`,
    [return_weight, return_pieces, scrap_weight, loss_weight, description, processId]
  );
};

const getPressProcessById = async (id) => {
  return db.pGet(`SELECT * FROM press_processes WHERE id = ?`, [id]);
};

const getAllPressProcesses = async () => {
  return db.pAll(`SELECT * FROM press_processes ORDER BY id DESC`);
};

const updatePressIssuedWeight = async (processId, new_weight) => {
  await db.pRun(
    `UPDATE press_processes SET issued_weight = ? WHERE id = ?`,
    [new_weight, processId]
  );
};

const deletePressProcessById = async (id) => {
  await db.pRun(
    `DELETE FROM process_return_items WHERE process_id = ? AND process_type = 'press'`, [id]
  );
  const { changes } = await db.pRun(
    `DELETE FROM press_processes WHERE id = ?`, [id]
  );
  return changes;
};

const editPressProcessUniversal = async (processId, updates) => {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    if (!VALID_PRESS_COLUMNS.has(key)) throw new Error(`Invalid column name: ${key}`);
    fields.push(`${key} = ?`);
    values.push(val);
  }
  if (fields.length === 0) return 0;
  values.push(processId);
  const { changes } = await db.pRun(
    `UPDATE press_processes SET ${fields.join(', ')} WHERE id = ?`, values
  );
  return changes;
};

module.exports = {
  createPressProcess,
  startPressProcess,
  completePressProcess,
  getPressProcessById,
  getAllPressProcesses,
  updatePressIssuedWeight,
  deletePressProcessById,
  editPressProcessUniversal,
};
