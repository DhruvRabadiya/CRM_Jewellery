'use strict';

/**
 * stockService.js — Production Stock Data Access Layer
 * ──────────────────────────────────────────────────────
 * All DB operations relating to stock_master, stock_transactions, and
 * cross-process aggregate recalculations.
 *
 * Every function is async and uses the promise helpers (db.pRun / db.pGet /
 * db.pAll) that were attached by the connection layer.  There are no raw
 * callback wrappers here.
 */

const db = require('../../config/dbConfig');

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns the stock_master row for a given metal type, or undefined.
 * @param {string} metalType
 */
const getStockByMetal = (metalType) =>
  db.pGet(`SELECT * FROM stock_master WHERE metal_type = ?`, [metalType]);

// ─── Opening stock ────────────────────────────────────────────────────────────

/**
 * Increments or decrements opening_stock, flooring at 0.
 * @param {string}  metalType
 * @param {number}  weight
 * @param {boolean} isAddition
 */
const updateOpeningStock = async (metalType, weight, isAddition) => {
  const op = isAddition ? '+' : '-';
  const { changes } = await db.pRun(
    `UPDATE stock_master
        SET opening_stock = MAX(opening_stock ${op} ?, 0)
      WHERE metal_type = ?`,
    [weight, metalType]
  );
  return changes;
};

// ─── Process (rolling / press / tpp) stock ───────────────────────────────────

/**
 * Updates a named process-pool column (rolling_stock, press_stock, tpp_stock).
 * The column name is whitelisted to prevent SQL injection.
 * @param {'rolling'|'press'|'tpp'} processName
 * @param {string}  metalType
 * @param {number}  weight
 * @param {boolean} isAddition
 */
const updateProcessStock = async (processName, metalType, weight, isAddition) => {
  const columnName   = `${processName}_stock`;
  const validColumns = new Set(['rolling_stock', 'press_stock', 'tpp_stock']);

  if (!validColumns.has(columnName)) {
    throw new Error(`Invalid process stock column: ${columnName}`);
  }

  const op = isAddition ? '+' : '-';
  const { changes } = await db.pRun(
    `UPDATE stock_master
        SET ${columnName} = MAX(${columnName} ${op} ?, 0)
      WHERE metal_type = ?`,
    [weight, metalType]
  );
  return changes;
};

// ─── In-process weight ────────────────────────────────────────────────────────

/**
 * Tracks total weight currently in any PENDING / RUNNING process stage.
 */
const updateInprocessWeight = async (metalType, weight, isAddition) => {
  const op = isAddition ? '+' : '-';
  const { changes } = await db.pRun(
    `UPDATE stock_master
        SET inprocess_weight = MAX(inprocess_weight ${op} ?, 0)
      WHERE metal_type = ?`,
    [weight, metalType]
  );
  return changes;
};

// ─── Loss tracking ────────────────────────────────────────────────────────────

/**
 * Adds (or subtracts, if negative) lossWeight to total_loss, flooring at 0.
 */
const addTotalLoss = async (metalType, lossWeight) => {
  const { changes } = await db.pRun(
    `UPDATE stock_master
        SET total_loss = MAX(total_loss + ?, 0)
      WHERE metal_type = ?`,
    [lossWeight, metalType]
  );
  return changes;
};

// ─── Transaction log ──────────────────────────────────────────────────────────

/**
 * Appends a row to stock_transactions and returns its new ID.
 * @returns {Promise<number>} lastID of the inserted row
 */
const logTransaction = async (
  metalType,
  type,
  weight,
  description,
  referenceType = '',
  referenceId   = null
) => {
  const { lastID } = await db.pRun(
    `INSERT INTO stock_transactions
       (metal_type, transaction_type, weight, description, reference_type, reference_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [metalType, type, weight, description, referenceType || '', referenceId ?? null]
  );
  return lastID;
};

// ─── Loss stats ───────────────────────────────────────────────────────────────

/**
 * Returns every completed-process loss entry across all five stages,
 * sorted newest first.
 */
const getLossStats = () =>
  db.pAll(`
    SELECT 'Melting'  AS source, metal_type, loss_weight, completed_at AS date
      FROM melting_process   WHERE status = 'COMPLETED' AND loss_weight != 0
    UNION ALL
    SELECT 'Rolling'  AS source, metal_type, loss_weight, end_time AS date
      FROM rolling_processes WHERE status = 'COMPLETED' AND loss_weight != 0
    UNION ALL
    SELECT 'Press'    AS source, metal_type, loss_weight, end_time AS date
      FROM press_processes   WHERE status = 'COMPLETED' AND loss_weight != 0
    UNION ALL
    SELECT 'TPP'      AS source, metal_type, loss_weight, end_time AS date
      FROM tpp_processes     WHERE status = 'COMPLETED' AND loss_weight != 0
    UNION ALL
    SELECT 'Packing'  AS source, metal_type, loss_weight, end_time AS date
      FROM packing_processes WHERE status = 'COMPLETED' AND loss_weight != 0
  `);

// ─── Purchase ledger ──────────────────────────────────────────────────────────

/** Returns all PURCHASE / DHAL_ADDITION transactions, newest first. */
const getPurchases = () =>
  db.pAll(
    `SELECT * FROM stock_transactions
      WHERE transaction_type IN ('PURCHASE', 'DHAL_ADDITION')
      ORDER BY date DESC`
  );

/** Returns a single stock_transactions row by primary key. */
const getPurchaseById = (id) =>
  db.pGet(`SELECT * FROM stock_transactions WHERE id = ?`, [id]);

/**
 * Updates weight and description of an existing stock_transactions row.
 * @returns {Promise<number>} number of rows changed
 */
const editPurchase = async (id, weight, description) => {
  const { changes } = await db.pRun(
    `UPDATE stock_transactions SET weight = ?, description = ? WHERE id = ?`,
    [weight, description, id]
  );
  return changes;
};

/**
 * Deletes a stock_transactions row.
 * @returns {Promise<number>} number of rows deleted
 */
const deletePurchase = async (id) => {
  const { changes } = await db.pRun(
    `DELETE FROM stock_transactions WHERE id = ?`,
    [id]
  );
  return changes;
};

// ─── Scrap & Loss detail view ─────────────────────────────────────────────────

/**
 * Returns a merged view of all scrap returns and losses/gains across every
 * completed process stage, newest first.
 *
 * Queries source tables directly (not the transaction log) so that edits to
 * process rows are immediately reflected without a separate sync step.
 */
const getDetailedScrapAndLoss = () =>
  db.pAll(`
    SELECT completed_at AS date, metal_type, 'SCRAP' AS category,
           'Scrap from Melting #' || id AS source, scrap_weight AS weight
      FROM melting_process   WHERE status = 'COMPLETED' AND scrap_weight > 0
    UNION ALL
    SELECT end_time, metal_type, 'SCRAP',
           'Scrap from Rolling '  || job_number, scrap_weight
      FROM rolling_processes WHERE status = 'COMPLETED' AND scrap_weight > 0
    UNION ALL
    SELECT end_time, metal_type, 'SCRAP',
           'Scrap from Press '    || job_number, scrap_weight
      FROM press_processes   WHERE status = 'COMPLETED' AND scrap_weight > 0
    UNION ALL
    SELECT end_time, metal_type, 'SCRAP',
           'Scrap from TPP '      || job_number, scrap_weight
      FROM tpp_processes     WHERE status = 'COMPLETED' AND scrap_weight > 0
    UNION ALL
    SELECT end_time, metal_type, 'SCRAP',
           'Scrap from Packing '  || job_number, scrap_weight
      FROM packing_processes WHERE status = 'COMPLETED' AND scrap_weight > 0

    UNION ALL

    SELECT completed_at, metal_type,
           CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END,
           CASE WHEN loss_weight < 0 THEN 'Gain from Melting #' ELSE 'Loss from Melting #' END || id,
           loss_weight
      FROM melting_process   WHERE status = 'COMPLETED' AND loss_weight != 0
    UNION ALL
    SELECT end_time, metal_type,
           CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END,
           CASE WHEN loss_weight < 0 THEN 'Gain from Rolling '  ELSE 'Loss from Rolling '  END || job_number,
           loss_weight
      FROM rolling_processes WHERE status = 'COMPLETED' AND loss_weight != 0
    UNION ALL
    SELECT end_time, metal_type,
           CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END,
           CASE WHEN loss_weight < 0 THEN 'Gain from Press '    ELSE 'Loss from Press '    END || job_number,
           loss_weight
      FROM press_processes   WHERE status = 'COMPLETED' AND loss_weight != 0
    UNION ALL
    SELECT end_time, metal_type,
           CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END,
           CASE WHEN loss_weight < 0 THEN 'Gain from TPP '      ELSE 'Loss from TPP '      END || job_number,
           loss_weight
      FROM tpp_processes     WHERE status = 'COMPLETED' AND loss_weight != 0
    UNION ALL
    SELECT end_time, metal_type,
           CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END,
           CASE WHEN loss_weight < 0 THEN 'Gain from Packing '  ELSE 'Loss from Packing '  END || job_number,
           loss_weight
      FROM packing_processes WHERE status = 'COMPLETED' AND loss_weight != 0

    ORDER BY date DESC
  `);

// ─── Source-of-truth recalculations ──────────────────────────────────────────
//
// These three functions derive the correct value from raw process tables and
// write it back to stock_master.  They are called by the Dashboard/Stock page
// to ensure stock_master stays consistent even if individual stock deltas drift.

/**
 * Recalculates opening_stock from source-of-truth tables and writes it back.
 * @returns {Promise<number>} the corrected opening_stock value
 */
const recalculateOpeningStock = async (metalType) => {
  const row = await db.pGet(
    `SELECT
       (SELECT COALESCE(SUM(weight), 0) FROM stock_transactions
          WHERE metal_type = $metal
            AND transaction_type IN ('PURCHASE', 'DHAL_ADDITION', 'ESTIMATE_METAL_RECEIPT', 'ADJUSTMENT'))

       - (SELECT COALESCE(SUM(w), 0) FROM (
              SELECT COALESCE(issue_size, issue_weight, 0) AS w
                FROM melting_process   WHERE metal_type = $metal AND status = 'PENDING'
              UNION ALL
              SELECT COALESCE(issue_size, 0)
                FROM rolling_processes WHERE metal_type = $metal AND status = 'PENDING'
              UNION ALL
              SELECT COALESCE(issue_size, 0)
                FROM press_processes   WHERE metal_type = $metal AND status = 'PENDING'
              UNION ALL
              SELECT COALESCE(issue_size, 0)
                FROM tpp_processes     WHERE metal_type = $metal AND status = 'PENDING'
              UNION ALL
              SELECT COALESCE(issue_size, 0)
                FROM packing_processes WHERE metal_type = $metal AND status = 'PENDING'
          ))

       - (SELECT COALESCE(SUM(w), 0) FROM (
              SELECT COALESCE(issued_weight, issue_size, issue_weight, 0) AS w
                FROM melting_process   WHERE metal_type = $metal AND status = 'RUNNING'
              UNION ALL
              SELECT COALESCE(issued_weight, issue_size, 0)
                FROM rolling_processes WHERE metal_type = $metal AND status = 'RUNNING'
              UNION ALL
              SELECT COALESCE(issued_weight, issue_size, 0)
                FROM press_processes   WHERE metal_type = $metal AND status = 'RUNNING'
              UNION ALL
              SELECT COALESCE(issued_weight, issue_size, 0)
                FROM tpp_processes     WHERE metal_type = $metal AND status = 'RUNNING'
              UNION ALL
              SELECT COALESCE(issued_weight, issue_size, 0)
                FROM packing_processes WHERE metal_type = $metal AND status = 'RUNNING'
          ))

       - (SELECT COALESCE(SUM(w), 0) FROM (
              SELECT COALESCE(loss_weight, 0) AS w
                FROM melting_process   WHERE metal_type = $metal AND status = 'COMPLETED'
              UNION ALL
              SELECT COALESCE(loss_weight, 0)
                FROM rolling_processes WHERE metal_type = $metal AND status = 'COMPLETED'
              UNION ALL
              SELECT COALESCE(loss_weight, 0)
                FROM press_processes   WHERE metal_type = $metal AND status = 'COMPLETED'
              UNION ALL
              SELECT COALESCE(loss_weight, 0)
                FROM tpp_processes     WHERE metal_type = $metal AND status = 'COMPLETED'
              UNION ALL
              SELECT COALESCE(loss_weight, 0)
                FROM packing_processes WHERE metal_type = $metal AND status = 'COMPLETED'
          ))

       - (SELECT COALESCE(SUM(COALESCE(return_weight, 0)), 0)
            FROM packing_processes
           WHERE metal_type = $metal AND status = 'COMPLETED')

       AS opening_stock`,
    { $metal: metalType }
  );

  const correctStock = Math.max(row ? (row.opening_stock ?? 0) : 0, 0);
  await db.pRun(
    `UPDATE stock_master SET opening_stock = ? WHERE metal_type = ?`,
    [correctStock, metalType]
  );
  return correctStock;
};

/**
 * Recalculates total_loss from all COMPLETED processes and writes it back.
 * @returns {Promise<number>} the corrected total_loss value
 */
const recalculateTotalLoss = async (metalType) => {
  const row = await db.pGet(
    `SELECT COALESCE(SUM(w), 0) AS total FROM (
       SELECT COALESCE(loss_weight, 0) AS w
         FROM melting_process   WHERE metal_type = ? AND status = 'COMPLETED'
       UNION ALL
       SELECT COALESCE(loss_weight, 0)
         FROM rolling_processes WHERE metal_type = ? AND status = 'COMPLETED'
       UNION ALL
       SELECT COALESCE(loss_weight, 0)
         FROM press_processes   WHERE metal_type = ? AND status = 'COMPLETED'
       UNION ALL
       SELECT COALESCE(loss_weight, 0)
         FROM tpp_processes     WHERE metal_type = ? AND status = 'COMPLETED'
       UNION ALL
       SELECT COALESCE(loss_weight, 0)
         FROM packing_processes WHERE metal_type = ? AND status = 'COMPLETED'
     )`,
    [metalType, metalType, metalType, metalType, metalType]
  );

  const correctLoss = Math.max(row ? (row.total ?? 0) : 0, 0);
  await db.pRun(
    `UPDATE stock_master SET total_loss = ? WHERE metal_type = ?`,
    [correctLoss, metalType]
  );
  return correctLoss;
};

/**
 * Recalculates inprocess_weight from active (PENDING/RUNNING) processes and
 * writes it back.
 * @returns {Promise<number>} the corrected inprocess_weight value
 */
const recalculateInprocessWeight = async (metalType) => {
  const row = await db.pGet(
    `SELECT COALESCE(SUM(w), 0) AS total FROM (
       SELECT CASE WHEN status = 'RUNNING'
                   THEN COALESCE(issued_weight, issue_size, issue_weight, 0)
                   ELSE COALESCE(issue_size, issue_weight, 0)
              END AS w
         FROM melting_process
        WHERE metal_type = ? AND status IN ('PENDING', 'RUNNING')
       UNION ALL
       SELECT CASE WHEN status = 'RUNNING'
                   THEN COALESCE(issued_weight, issue_size, 0)
                   ELSE COALESCE(issue_size, 0)
              END
         FROM rolling_processes
        WHERE metal_type = ? AND status IN ('PENDING', 'RUNNING')
       UNION ALL
       SELECT CASE WHEN status = 'RUNNING'
                   THEN COALESCE(issued_weight, issue_size, 0)
                   ELSE COALESCE(issue_size, 0)
              END
         FROM press_processes
        WHERE metal_type = ? AND status IN ('PENDING', 'RUNNING')
       UNION ALL
       SELECT CASE WHEN status = 'RUNNING'
                   THEN COALESCE(issued_weight, issue_size, 0)
                   ELSE COALESCE(issue_size, 0)
              END
         FROM tpp_processes
        WHERE metal_type = ? AND status IN ('PENDING', 'RUNNING')
       UNION ALL
       SELECT CASE WHEN status = 'RUNNING'
                   THEN COALESCE(issued_weight, issue_size, 0)
                   ELSE COALESCE(issue_size, 0)
              END
         FROM packing_processes
        WHERE metal_type = ? AND status IN ('PENDING', 'RUNNING')
     )`,
    [metalType, metalType, metalType, metalType, metalType]
  );

  const correctWeight = row ? (row.total ?? 0) : 0;
  await db.pRun(
    `UPDATE stock_master SET inprocess_weight = ? WHERE metal_type = ?`,
    [correctWeight, metalType]
  );
  return correctWeight;
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getStockByMetal,
  updateOpeningStock,
  updateProcessStock,
  updateInprocessWeight,
  logTransaction,
  addTotalLoss,
  getLossStats,
  getPurchases,
  getPurchaseById,
  editPurchase,
  deletePurchase,
  getDetailedScrapAndLoss,
  recalculateOpeningStock,
  recalculateTotalLoss,
  recalculateInprocessWeight,
};
