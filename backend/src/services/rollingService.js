const db = require("../../config/dbConfig");

const createRollingProcess = (
  job_number,
  job_name,
  metal_type,
  unit,
  employee,
  issue_size,
  issue_pieces,
  category,
) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO rolling_processes (job_number, job_name, metal_type, unit, employee, issue_size, issue_pieces, category, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`;
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
) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE rolling_processes SET status = 'COMPLETED', return_weight = ?, return_pieces = ?, scrap_weight = ?, loss_weight = ?, end_time = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(
      query,
      [return_weight, return_pieces, scrap_weight, loss_weight, processId],
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

module.exports = {
  createRollingProcess,
  startRollingProcess,
  completeRollingProcess,
  getRollingProcessById,
  getAllRollingProcesses,
  updateRollingIssuedWeight,
  deleteRollingProcessById,
};
