const db = require("../../config/dbConfig");

const createPackingProcess = (
  job_number,
  job_name,
  metal_type,
  unit,
  employee,
  issue_size,
  category,
) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO packing_processes (job_number, job_name, metal_type, unit, employee, issue_size, category, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`;
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

const startPackingProcess = (processId, issued_weight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE packing_processes SET status = 'RUNNING', issued_weight = ?, start_time = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(query, [issued_weight, processId], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const completePackingProcess = (
  processId,
  return_weight,
  scrap_weight,
  loss_weight,
) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE packing_processes SET status = 'COMPLETED', return_weight = ?, scrap_weight = ?, loss_weight = ?, end_time = CURRENT_TIMESTAMP WHERE id = ?`;
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

const getPackingProcessById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM packing_processes WHERE id = ?`;
    db.get(query, [id], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const getAllPackingProcesses = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM packing_processes ORDER BY id DESC`;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};

const addFinishedGoods = (metal_type, target_product, pieces, weight) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO finished_goods (metal_type, target_product, pieces, weight) VALUES (?, ?, ?, ?)`;
    db.run(query, [metal_type, target_product, pieces, weight], function (err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
};

module.exports = {
  createPackingProcess,
  startPackingProcess,
  completePackingProcess,
  getPackingProcessById,
  getAllPackingProcesses,
  addFinishedGoods,
};
