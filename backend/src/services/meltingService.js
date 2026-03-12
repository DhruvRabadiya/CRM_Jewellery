const db = require("../../config/dbConfig");
const { STATUS } = require("../utils/constants");

const createMeltingProcess = (metal_type, unit, issue_weight, pieces, employee, description) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO melting_process 
      (metal_type, unit, issue_weight, issue_pieces, employee, description, status) 
      VALUES (?, ?, ?, ?, ?, ?, 'RUNNING')
    `;
    db.run(
      query,
      [metal_type, unit, issue_weight, pieces, employee, description],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
};

const updateMeltingProcess = (
  processId,
  returnWeight,
  returnPieces,
  scrapWeight,
  lossWeight,
  description = "",
) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE melting_process 
                       SET return_weight = ?, return_pieces = ?, scrap_weight = ?, loss_weight = ?, status = ?, completed_at = CURRENT_TIMESTAMP, description = COALESCE(NULLIF(?, ''), description) 
                       WHERE id = ?`;

    db.run(
      query,
      [
        returnWeight,
        returnPieces,
        scrapWeight,
        lossWeight,
        STATUS.COMPLETED,
        description,
        processId,
      ],
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
    const query = `SELECT *, created_at AS date FROM melting_process WHERE status = ?`;
    db.all(query, [STATUS.RUNNING], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};

const editMeltingProcess = (processId, updates) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    values.push(processId);

    const query = `UPDATE melting_process SET ${fields.join(", ")} WHERE id = ?`;
    db.run(query, values, function (err) {
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

const getAllMeltingProcesses = () => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT *, created_at AS date FROM melting_process ORDER BY created_at DESC",
      [],
      (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      },
    );
  });
};

module.exports = {
  createMeltingProcess,
  updateMeltingProcess,
  getMeltingProcessById,
  getRunningMelts,
  editMeltingProcess,
  deleteMeltingProcess,
  getAllMeltingProcesses,
};
