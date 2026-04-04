const db = require("../../config/dbConfig");

// Get the next serial Job Number (e.g., JOB-0001, JOB-0002)
const getNextJobNumber = () => {
  return new Promise((resolve, reject) => {
    // Find the absolute last job created across all process tables that have job_number.
    // Note: melting_process does not have a job_number column (melting is standalone).
    const query = `
      SELECT job_number FROM (
        SELECT job_number FROM melting_process WHERE job_number IS NOT NULL
        UNION ALL
        SELECT job_number FROM rolling_processes WHERE job_number IS NOT NULL
        UNION ALL
        SELECT job_number FROM press_processes WHERE job_number IS NOT NULL
        UNION ALL
        SELECT job_number FROM tpp_processes WHERE job_number IS NOT NULL
        UNION ALL
        SELECT job_number FROM packing_processes WHERE job_number IS NOT NULL
      ) ORDER BY job_number DESC LIMIT 1
    `;
    db.get(query, [], (err, row) => {
      if (err) return reject(err);

      if (!row || !row.job_number) {
        // If the database is completely empty, start at 1
        return resolve("JOB-0001");
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
  getNextJobNumber,
  getFinishedGoodsInventory,
};
