const db = require("../../config/dbConfig");
const { STATUS, JOB_STEPS } = require("../utils/constants");

// Update createJob to accept and save weights
const createJob = (
  job_number,
  metal_type,
  target_product,
  current_step,
  issue_weight,
) => {
  return new Promise((resolve, reject) => {
    // We set both issue_weight and current_weight to the starting weight
    const query = `INSERT INTO production_jobs (job_number, metal_type, target_product, current_step, status, issue_weight, current_weight) VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?)`;
    db.run(
      query,
      [
        job_number,
        metal_type,
        target_product,
        current_step,
        issue_weight,
        issue_weight,
      ],
      function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      },
    );
  });
};

// Update updateJobStep to also update the current_weight
const updateJobStep = (job_id, next_step, status, new_current_weight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE production_jobs SET current_step = ?, status = ?, current_weight = ? WHERE id = ?`;
    db.run(
      query,
      [next_step, status, new_current_weight, job_id],
      function (err) {
        if (err) reject(err);
        resolve();
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

// Save completed job into finished goods
const addFinishedGoods = (metal_type, target_product, pieces, weight) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO finished_goods (metal_type, target_product, pieces, weight) VALUES (?, ?, ?, ?)`;
    db.run(query, [metal_type, target_product, pieces, weight], function (err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
};

const getActiveJobs = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM production_jobs WHERE status = 'IN_PROGRESS' ORDER BY id DESC`;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};
// Get the next serial Job Number (e.g., JOB-0001, JOB-0002)
const getNextJobNumber = () => {
  return new Promise((resolve, reject) => {
    // Find the absolute last job created
    const query = `SELECT job_number FROM production_jobs ORDER BY id DESC LIMIT 1`;
    db.get(query, [], (err, row) => {
      if (err) reject(err);

      if (!row || !row.job_number) {
        // If the database is completely empty, start at 1
        resolve("JOB-0001");
      } else {
        // Extract the number part from "JOB-0001" and add 1
        const parts = row.job_number.split("-");
        const lastNumber = parseInt(parts[1]) || 0;
        const nextNumber = lastNumber + 1;

        // Format it back to 4 digits (e.g., 2 becomes "0002")
        const formattedNumber = `JOB-${String(nextNumber).padStart(4, "0")}`;
        resolve(formattedNumber);
      }
    });
  });
};

// Group and fetch all finished goods
const getFinishedGoodsInventory = () => {
  return new Promise((resolve, reject) => {
    const query = `
            SELECT metal_type, target_product, SUM(pieces) as total_pieces, SUM(weight) as total_weight 
            FROM finished_goods 
            GROUP BY metal_type, target_product
            ORDER BY metal_type, target_product
        `;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
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
  getActiveJobs,
  getNextJobNumber,
  getFinishedGoodsInventory,
};
