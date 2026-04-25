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

// Compute finished goods available for dispatch.
// = packing completion output  +  finished_goods adjustments (negative = sent to counter, positive = returned)
const getFinishedGoodsInventory = () => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT metal_type, target_product,
             SUM(total_pieces) AS total_pieces,
             SUM(total_weight) AS total_weight
      FROM (
        -- Multi-category entries via process_return_items
        SELECT pp.metal_type, pri.category AS target_product,
               SUM(pri.return_pieces) AS total_pieces,
               SUM(pri.return_weight) AS total_weight
        FROM process_return_items pri
        INNER JOIN packing_processes pp ON pri.process_id = pp.id AND pri.process_type = 'packing'
        WHERE pp.status = 'COMPLETED'
        GROUP BY pp.metal_type, pri.category

        UNION ALL

        -- Fallback: completed packing processes without process_return_items (legacy single-category)
        SELECT pp.metal_type, pp.category AS target_product,
               pp.return_pieces AS total_pieces,
               pp.return_weight AS total_weight
        FROM packing_processes pp
        WHERE pp.status = 'COMPLETED' AND (pp.return_weight > 0 OR pp.return_pieces > 0)
          AND NOT EXISTS (
            SELECT 1 FROM process_return_items pri
            WHERE pri.process_id = pp.id AND pri.process_type = 'packing'
          )

        UNION ALL

        -- Counter-transfer adjustments: negative rows (send) and positive rows (return)
        SELECT metal_type, target_product, pieces AS total_pieces, weight AS total_weight
        FROM finished_goods
      )
      GROUP BY metal_type, target_product
      HAVING SUM(total_pieces) > 0 OR SUM(total_weight) > 0
      ORDER BY metal_type, target_product
    `;
    db.all(query, [], (err, rows) => {
      if (err) return reject(err);
      const sanitized = (rows || []).map((r) => ({
        ...r,
        total_pieces: Math.max(r.total_pieces || 0, 0),
        total_weight: Math.max(r.total_weight || 0, 0),
      }));
      resolve(sanitized);
    });
  });
};

// Delete finished goods entry by ID
const deleteFinishedGoodsById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM finished_goods WHERE id = ?`;
    
    db.run(query, [id], function (err) {
      if (err) {
        return reject(err);
      }
      
      if (this.changes === 0) {
        return resolve({
          success: false,
          message: `No finished goods entry found with ID: ${id}`,
        });
      }
      
      resolve({
        success: true,
        message: `Finished goods entry with ID ${id} deleted successfully`,
      });
    });
  });
};

module.exports = {
  getNextJobNumber,
  getFinishedGoodsInventory,
  deleteFinishedGoodsById,
};
