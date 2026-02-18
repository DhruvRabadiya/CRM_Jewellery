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

module.exports = {
  createMeltingProcess,
  updateMeltingProcess,
  getMeltingProcessById,
  getRunningMelts,
};
