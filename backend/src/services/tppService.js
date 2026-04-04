const db = require("../../config/dbConfig");

const createTppProcess = (
  job_number,
  job_name,
  metal_type,
  unit,
  issue_size,
  issue_pieces,
  category,
  employee, // Moved employee here
  description = "",
) => {
  return new Promise((resolve, reject) => {
    // Updated query to reflect the new position of employee and keep job_name
    const query = `INSERT INTO tpp_processes (job_number, job_name, metal_type, unit, employee, issue_size, issue_pieces, category, status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`;
    db.run(
      query,
      [
        job_number,
        job_name,
        metal_type,
        unit,
        employee, // Updated position in the values array
        issue_size,
        issue_pieces,
        category,
        description,
      ],
      function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      },
    );
  });
};

const startTppProcess = (processId, issued_weight, issue_pieces, employee, description) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE tpp_processes SET status = 'RUNNING', issued_weight = ?, issue_pieces = ?, employee = COALESCE(?, employee), description = COALESCE(?, description), start_time = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(query, [issued_weight, issue_pieces, employee, description, processId], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const completeTppProcess = (
  processId,
  return_weight,
  return_pieces,
  scrap_weight,
  loss_weight,
  description = "",
) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE tpp_processes SET status = 'COMPLETED', return_weight = ?, return_pieces = ?, scrap_weight = ?, loss_weight = ?, end_time = CURRENT_TIMESTAMP, description = COALESCE(NULLIF(?, ''), description) WHERE id = ?`;
    db.run(
      query,
      [return_weight, return_pieces, scrap_weight, loss_weight, description, processId],
      function (err) {
        if (err) reject(err);
        resolve();
      },
    );
  });
};

const getTppProcessById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM tpp_processes WHERE id = ?`;
    db.get(query, [id], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const getAllTppProcesses = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM tpp_processes ORDER BY id DESC`;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};

const updateTppIssuedWeight = (processId, new_weight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE tpp_processes SET issued_weight = ? WHERE id = ?`;
    db.run(query, [new_weight, processId], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const deleteTppProcessById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM tpp_processes WHERE id = ?`;
    db.run(query, [id], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const VALID_TPP_COLUMNS = new Set([
  'job_number', 'job_name', 'metal_type', 'unit', 'employee', 'issue_size',
  'issue_pieces', 'issued_weight', 'category', 'status',
  'return_weight', 'return_pieces', 'scrap_weight', 'loss_weight',
  'description', 'start_time', 'end_time',
]);

const editTppProcessUniversal = (processId, updates) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      if (!VALID_TPP_COLUMNS.has(key)) {
        return reject(new Error(`Invalid column name: ${key}`));
      }
      fields.push(`${key} = ?`);
      values.push(val);
    }
    if (fields.length === 0) return resolve(0);
    values.push(processId);

    const query = `UPDATE tpp_processes SET ${fields.join(", ")} WHERE id = ?`;
    db.run(query, values, function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

module.exports = {
  createTppProcess,
  startTppProcess,
  completeTppProcess,
  getTppProcessById,
  getAllTppProcesses,
  updateTppIssuedWeight,
  deleteTppProcessById,
  editTppProcessUniversal,
};
