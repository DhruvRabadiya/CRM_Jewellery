const db = require("../../config/dbConfig");

const createMeltingProcess = (job_number, job_name, metal_type, unit, issue_size, issue_pieces, category, employee, description = '') => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO melting_process 
      (job_number, job_name, metal_type, unit, issue_weight, issue_size, issue_pieces, category, employee, description, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`;
    // issue_weight and issue_size both store the same initial value; issued_weight is updated when started
    db.run(query, [job_number, job_name, metal_type, unit, issue_size, issue_size, issue_pieces, category, employee, description], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
};

const startMeltingProcess = (processId, issued_weight, issue_pieces, employee, description) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE melting_process SET status = 'RUNNING', issued_weight = ?, issue_pieces = ?, employee = COALESCE(?, employee), description = COALESCE(?, description), start_time = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(query, [issued_weight, issue_pieces, employee, description, processId], function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
};

const completeMeltingProcess = (processId, return_weight, return_pieces, scrap_weight, loss_weight, description = '') => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE melting_process SET status = 'COMPLETED', return_weight = ?, return_pieces = ?, scrap_weight = ?, loss_weight = ?, end_time = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP, description = COALESCE(NULLIF(?, ''), description) WHERE id = ?`;
    db.run(query, [return_weight, return_pieces, scrap_weight, loss_weight, description, processId], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

const getMeltingProcessById = (processId) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM melting_process WHERE id = ?`;
    db.get(query, [processId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const VALID_MELTING_COLUMNS = new Set([
  'issue_weight', 'issue_size', 'issue_pieces', 'issued_weight',
  'return_weight', 'return_pieces', 'scrap_weight', 'loss_weight',
  'description', 'employee', 'category', 'status',
  'start_time', 'end_time', 'completed_at',
]);

const editMeltingProcess = (processId, updates) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      if (!VALID_MELTING_COLUMNS.has(key)) {
        return reject(new Error(`Invalid column name: ${key}`));
      }
      fields.push(`${key} = ?`);
      values.push(val);
    }
    if (fields.length === 0) return resolve(0);
    values.push(processId);
    const query = `UPDATE melting_process SET ${fields.join(", ")} WHERE id = ?`;
    db.run(query, values, function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

const deleteMeltingProcess = (processId) => {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM melting_process WHERE id = ?`;
    db.run(query, [processId], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

const getRunningMelts = () => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT *, created_at AS date FROM melting_process WHERE status = 'RUNNING'`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const getAllMeltingProcesses = () => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT *, created_at AS date FROM melting_process ORDER BY id DESC`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
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
