const db = require("../../config/dbConfig");

const createTppProcess = (
  job_number,
  job_name,
  metal_type,
  unit,
  employee,
  issue_size,
  category,
) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO tpp_processes (job_number, job_name, metal_type, unit, employee, issue_size, category, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`;
    db.run(
      query,
      [job_number, job_name, metal_type, unit, employee, issue_size, category],
      function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      },
    );
  });
};

const startTppProcess = (processId, issued_weight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE tpp_processes SET status = 'RUNNING', issued_weight = ?, start_time = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(query, [issued_weight, processId], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const completeTppProcess = (
  processId,
  return_weight,
  scrap_weight,
  loss_weight,
) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE tpp_processes SET status = 'COMPLETED', return_weight = ?, scrap_weight = ?, loss_weight = ?, end_time = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(
      query,
      [return_weight, scrap_weight, loss_weight, processId],
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

module.exports = {
  createTppProcess,
  startTppProcess,
  completeTppProcess,
  getTppProcessById,
  getAllTppProcesses,
  updateTppIssuedWeight,
  deleteTppProcessById,
};
