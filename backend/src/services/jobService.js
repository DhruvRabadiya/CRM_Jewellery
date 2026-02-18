const db = require("../../config/dbConfig");
const { STATUS, JOB_STEPS } = require("../utils/constants");

const createJob = (jobNumber, metalType, targetProduct, currentStep) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO production_jobs (job_number, metal_type, target_product, current_step, status) 
                       VALUES (?, ?, ?, ?, ?)`;
    db.run(
      query,
      [jobNumber, metalType, targetProduct, currentStep, STATUS.IN_PROGRESS],
      function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      },
    );
  });
};
const logJobStep = (
  jobId,
  stepName,
  issueWeight,
  returnWeight,
  scrapWeight,
  lossWeight,
  returnPieces = 0,
) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO job_steps (job_id, step_name, issue_weight, return_weight, scrap_weight, loss_weight, return_pieces) 
                       VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(
      query,
      [
        jobId,
        stepName,
        issueWeight,
        returnWeight,
        scrapWeight,
        lossWeight,
        returnPieces,
      ],
      function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      },
    );
  });
};

const updateJobStep = (jobId, nextStep, status = STATUS.IN_PROGRESS) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE production_jobs SET current_step = ?, status = ? WHERE id = ?`;
    db.run(query, [nextStep, status, jobId], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const getJobById = (jobId) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM production_jobs WHERE id = ?`;
    db.get(query, [jobId], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const getLastStep = (jobId) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM job_steps WHERE job_id = ? ORDER BY id DESC LIMIT 1`;
    db.get(query, [jobId], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const addFinishedGoods = (metalType, productName, quantity, totalWeight) => {
  return new Promise((resolve, reject) => {
    const checkQuery = `SELECT * FROM finished_goods WHERE metal_type = ? AND product_name = ?`;
    db.get(checkQuery, [metalType, productName], (err, row) => {
      if (err) reject(err);

      if (row) {
        const updateQuery = `UPDATE finished_goods SET quantity = quantity + ?, total_weight = total_weight + ? WHERE id = ?`;
        db.run(updateQuery, [quantity, totalWeight, row.id], function (err) {
          if (err) reject(err);
          resolve(this.changes);
        });
      } else {
        const insertQuery = `INSERT INTO finished_goods (metal_type, product_name, quantity, total_weight) VALUES (?, ?, ?, ?)`;
        db.run(
          insertQuery,
          [metalType, productName, quantity, totalWeight],
          function (err) {
            if (err) reject(err);
            resolve(this.lastID);
          },
        );
      }
    });
  });
};

module.exports = {
  createJob,
  logJobStep,
  updateJobStep,
  getJobById,
  getLastStep,
  addFinishedGoods,
};
