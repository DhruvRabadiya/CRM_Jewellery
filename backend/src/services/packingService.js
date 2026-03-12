const db = require("../../config/dbConfig");

const createPackingProcess = (
  job_number,
  metal_type,
  unit,
  issue_size,
  issue_pieces,
  category,
  employee, // Moved employee here
  description = "",
) => {
  return new Promise((resolve, reject) => {
    // Removed job_name from columns, moved employee, changed 'PENDING' to STATUS.PENDING (assuming STATUS is defined elsewhere)
    const query = `INSERT INTO packing_processes (job_number, metal_type, unit, issue_size, issue_pieces, category, employee, status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(
      query,
      [
        job_number,
        metal_type,
        unit,
        issue_size,
        issue_pieces,
        category,
        employee, // Injected employee here
        'PENDING', // Reverted to 'PENDING' as STATUS is not defined in the provided context
        description,
      ],
      function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      },
    );
  });
};

const startPackingProcess = (processId, issued_weight, issue_pieces) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE packing_processes SET status = 'RUNNING', issued_weight = ?, issue_pieces = ?, start_time = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(query, [issued_weight, issue_pieces, processId], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const completePackingProcess = (
  processId,
  return_weight,
  return_pieces,
  scrap_weight,
  loss_weight,
  description = "",
) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE packing_processes SET status = 'COMPLETED', return_weight = ?, return_pieces = ?, scrap_weight = ?, loss_weight = ?, end_time = CURRENT_TIMESTAMP, description = COALESCE(?, description) WHERE id = ?`;
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

const removeFinishedGoods = (metal_type, target_product, weight) => {
  return new Promise((resolve, reject) => {
    // Attempt to delete exactly ONE matching finished good
    const query = `
      DELETE FROM finished_goods 
      WHERE id = (
        SELECT id FROM finished_goods 
        WHERE metal_type = ? AND target_product = ? AND weight = ? 
        ORDER BY id DESC LIMIT 1
      )
    `;
    db.run(query, [metal_type, target_product, weight], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const updatePackingIssuedWeight = (processId, new_weight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE packing_processes SET issued_weight = ? WHERE id = ?`;
    db.run(query, [new_weight, processId], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const deletePackingProcessById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM packing_processes WHERE id = ?`;
    db.run(query, [id], function (err) {
      if (err) reject(err);
      resolve();
    });
  });
};

const editPackingProcessUniversal = (processId, updates) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    values.push(processId);

    const query = `UPDATE packing_processes SET ${fields.join(", ")} WHERE id = ?`;
    db.run(query, values, function (err) {
      if (err) reject(err);
      resolve(this.changes);
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
  removeFinishedGoods,
  updatePackingIssuedWeight,
  deletePackingProcessById,
  editPackingProcessUniversal,
};
