const db = require("../../config/dbConfig");
const { STATUS } = require("../utils/constants");


const createMeltingProcess = (metalType, issueWeight) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO melting_process (metal_type, issue_weight, status) VALUES (?, ?, ?)`;
    db.run(query, [metalType, issueWeight, STATUS.RUNNING], function (err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
};

const updateMeltingProcess = (
  processId,
  returnWeight,
  scrapWeight,
  lossWeight,
) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE melting_process 
                       SET return_weight = ?, scrap_weight = ?, loss_weight = ?, status = ?, completed_at = CURRENT_TIMESTAMP 
                       WHERE id = ?`;

    db.run(
      query,
      [returnWeight, scrapWeight, lossWeight, STATUS.COMPLETED, processId],
      function (err) {
        if (err) reject(err);
        resolve(this.changes);
      },
    );
  });
};

const getMeltingProcessById = (processId) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM melting_process WHERE id = ?`;
    db.get(query, [processId], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const getRunningMelts = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM melting_process WHERE status = ?`;
    db.all(query, [STATUS.RUNNING], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};

const getAllMeltingProcesses = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM melting_process ORDER BY created_at DESC`;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};

const getCompletedMelts = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM melting_process WHERE status = ? ORDER BY completed_at DESC`;
    db.all(query, [STATUS.COMPLETED], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};

const updateMeltingProcessDetails = (processId, metalType, issueWeight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE melting_process SET metal_type = ?, issue_weight = ? WHERE id = ?`;
    db.run(query, [metalType, issueWeight, processId], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const updateCompletedMeltDetails = (processId, returnWeight, scrapWeight, lossWeight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE melting_process SET return_weight = ?, scrap_weight = ?, loss_weight = ? WHERE id = ?`;
    db.run(query, [returnWeight, scrapWeight, lossWeight, processId], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const deleteMeltingProcess = (processId) => {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM melting_process WHERE id = ?`;
    db.run(query, [processId], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

module.exports = {
  createMeltingProcess,
  updateMeltingProcess,
  getMeltingProcessById,
  getRunningMelts,
  getAllMeltingProcesses,
  getCompletedMelts,
  updateMeltingProcessDetails,
  updateCompletedMeltDetails,
  deleteMeltingProcess,
};
