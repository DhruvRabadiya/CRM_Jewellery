const db = require("../../config/dbConfig");

const createRollingProcess = (
  job_number,
  job_name,
  metal_type,
  unit,
  issue_size,
  issue_pieces,
  category,
  employee,
  description = "",
) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO rolling_processes (job_number, job_name, metal_type, unit, employee, issue_size, issue_pieces, category, status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`;
    db.run(
      query,
      [
        job_number,
        job_name,
        metal_type,
        unit,
        employee,
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

const startRollingProcess = (processId, issued_weight, issue_pieces) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE rolling_processes SET status = 'RUNNING', issued_weight = ?, issue_pieces = ?, start_time = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(query, [issued_weight, issue_pieces, processId], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const completeRollingProcess = (
  processId,
  return_weight,
  return_pieces,
  scrap_weight,
  loss_weight,
  description = "",
) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE rolling_processes SET status = 'COMPLETED', return_weight = ?, return_pieces = ?, scrap_weight = ?, loss_weight = ?, end_time = CURRENT_TIMESTAMP, description = COALESCE(?, description) WHERE id = ?`;
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

const getRollingProcessById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM rolling_processes WHERE id = ?`;
    db.get(query, [id], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const getAllRollingProcesses = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM rolling_processes ORDER BY id DESC`;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};

const updateRollingIssuedWeight = (processId, new_weight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE rolling_processes SET issued_weight = ? WHERE id = ?`;
    db.run(query, [new_weight, processId], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const deleteRollingProcessById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM rolling_processes WHERE id = ?`;
    db.run(query, [id], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const editRollingProcessUniversal = (processId, updates) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    values.push(processId);

    const query = `UPDATE rolling_processes SET ${fields.join(", ")} WHERE id = ?`;
    db.run(query, values, function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

module.exports = {
  createRollingProcess,
  startRollingProcess, // Kept original name as it was not explicitly changed in the instruction's code block
  completeRollingProcess,
  getRollingProcessById,
  getAllRollingProcesses,
  updateRollingIssuedWeight,
  deleteRollingProcessById,
  editRollingProcessUniversal,
};
