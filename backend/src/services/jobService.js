'use strict';

const db = require('../../config/dbConfig');

/**
 * Returns the next serial job number (JOB-0001, JOB-0002, …).
 * Scans all process tables because melting_process also carries job_number.
 */
const getNextJobNumber = async () => {
  const row = await db.pGet(
    `SELECT job_number FROM (
       SELECT job_number FROM melting_process  WHERE job_number IS NOT NULL
       UNION ALL
       SELECT job_number FROM rolling_processes WHERE job_number IS NOT NULL
       UNION ALL
       SELECT job_number FROM press_processes   WHERE job_number IS NOT NULL
       UNION ALL
       SELECT job_number FROM tpp_processes     WHERE job_number IS NOT NULL
       UNION ALL
       SELECT job_number FROM packing_processes WHERE job_number IS NOT NULL
     ) ORDER BY job_number DESC LIMIT 1`
  );

  if (!row || !row.job_number) return 'JOB-0001';
  const lastNumber = parseInt(row.job_number.split('-')[1], 10) || 0;
  return `JOB-${String(lastNumber + 1).padStart(4, '0')}`;
};

/**
 * Aggregated finished-goods available for dispatch.
 * Positive rows come from packing completion; counter transfers write adjustments.
 */
const getFinishedGoodsInventory = async () => {
  const rows = await db.pAll(
    `SELECT metal_type, target_product,
            SUM(COALESCE(pieces, 0)) AS total_pieces,
            SUM(COALESCE(weight, 0)) AS total_weight
       FROM finished_goods
      GROUP BY metal_type, target_product
     HAVING SUM(COALESCE(pieces, 0)) > 0
         OR SUM(COALESCE(weight, 0)) > 0
      ORDER BY metal_type, target_product`
  );
  return rows.map((r) => ({
    ...r,
    total_pieces: Math.max(r.total_pieces || 0, 0),
    total_weight: Math.max(r.total_weight || 0, 0),
  }));
};

/** Hard-delete a finished-goods entry by primary key. */
const deleteFinishedGoodsById = async (id) => {
  const { changes } = await db.pRun(`DELETE FROM finished_goods WHERE id = ?`, [id]);
  if (changes === 0) {
    return { success: false, message: `No finished goods entry found with ID: ${id}` };
  }
  return { success: true, message: `Finished goods entry ${id} deleted` };
};

module.exports = { getNextJobNumber, getFinishedGoodsInventory, deleteFinishedGoodsById };
