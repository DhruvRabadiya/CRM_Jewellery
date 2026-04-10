const db = require("../../config/dbConfig");

const getStockByMetal = (metalType) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM stock_master WHERE metal_type = ?`;
    db.get(query, [metalType], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const updateOpeningStock = (metalType, weight, isAddition) => {
  return new Promise((resolve, reject) => {
    const operator = isAddition ? "+" : "-";
    const query = `UPDATE stock_master SET opening_stock = MAX(opening_stock ${operator} ?, 0) WHERE metal_type = ?`;

    db.run(query, [weight, metalType], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

// Reusable function to handle pooled stock updates (rolling_stock, press_stock, tpp_stock)
const updateProcessStock = (processName, metalType, weight, isAddition) => {
  return new Promise((resolve, reject) => {
    const columnName = `${processName}_stock`;

    // Whitelist check to prevent SQL injection on column name
    const validColumns = ["rolling_stock", "press_stock", "tpp_stock"];
    if (!validColumns.includes(columnName)) {
      return reject(new Error("Invalid process stock column"));
    }

    const operator = isAddition ? "+" : "-";
    const query = `UPDATE stock_master SET ${columnName} = MAX(${columnName} ${operator} ?, 0) WHERE metal_type = ?`;

    db.run(query, [weight, metalType], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const logTransaction = (metalType, type, weight, description) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO stock_transactions (metal_type, transaction_type, weight, description) VALUES (?, ?, ?, ?)`;
    db.run(query, [metalType, type, weight, description], function (err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
};

const updateInprocessWeight = (metalType, weight, isAddition) => {
  return new Promise((resolve, reject) => {
    const operator = isAddition ? "+" : "-";
    const query = `UPDATE stock_master SET inprocess_weight = MAX(inprocess_weight ${operator} ?, 0) WHERE metal_type = ?`;
    db.run(query, [weight, metalType], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const addTotalLoss = (metalType, lossWeight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE stock_master SET total_loss = MAX(total_loss + ?, 0) WHERE metal_type = ?`;
    db.run(query, [lossWeight, metalType], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const getLossStats = () => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 'Melting' as source, metal_type, loss_weight, completed_at as date FROM melting_process WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT 'Rolling' as source, metal_type, loss_weight, end_time as date FROM rolling_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT 'Press' as source, metal_type, loss_weight, end_time as date FROM press_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT 'TPP' as source, metal_type, loss_weight, end_time as date FROM tpp_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT 'Packing' as source, metal_type, loss_weight, end_time as date FROM packing_processes WHERE status = 'COMPLETED' AND loss_weight != 0
    `;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

const getPurchases = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM stock_transactions WHERE transaction_type IN ('PURCHASE', 'DHAL_ADDITION') ORDER BY date DESC`;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

const getPurchaseById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM stock_transactions WHERE id = ?`;
    db.get(query, [id], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const editPurchase = (id, weight, description) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE stock_transactions SET weight = ?, description = ? WHERE id = ?`;
    db.run(query, [weight, description, id], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const deletePurchase = (id) => {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM stock_transactions WHERE id = ?`;
    db.run(query, [id], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const getDetailedScrapAndLoss = () => {
  return new Promise((resolve, reject) => {
    // Instead of immutable transaction logs, query the source of truth directly so edits sync retroactively.
    const query = `
      -- Scrap Returns
      SELECT completed_at as date, metal_type, 'SCRAP' as category, 'Scrap from Melting #' || id as source, scrap_weight as weight FROM melting_process WHERE status = 'COMPLETED' AND scrap_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'SCRAP' as category, 'Scrap from Rolling ' || job_number as source, scrap_weight as weight FROM rolling_processes WHERE status = 'COMPLETED' AND scrap_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'SCRAP' as category, 'Scrap from Press ' || job_number as source, scrap_weight as weight FROM press_processes WHERE status = 'COMPLETED' AND scrap_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'SCRAP' as category, 'Scrap from TPP ' || job_number as source, scrap_weight as weight FROM tpp_processes WHERE status = 'COMPLETED' AND scrap_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'SCRAP' as category, 'Scrap from Packing ' || job_number as source, scrap_weight as weight FROM packing_processes WHERE status = 'COMPLETED' AND scrap_weight > 0
      
      UNION ALL
      
      -- Losses & Gains
      SELECT completed_at as date, metal_type, CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END as category, CASE WHEN loss_weight < 0 THEN 'Gain from Melting #' ELSE 'Loss from Melting #' END || id as source, loss_weight as weight FROM melting_process WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT end_time as date, metal_type, CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END as category, CASE WHEN loss_weight < 0 THEN 'Gain from Rolling ' ELSE 'Loss from Rolling ' END || job_number as source, loss_weight as weight FROM rolling_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT end_time as date, metal_type, CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END as category, CASE WHEN loss_weight < 0 THEN 'Gain from Press ' ELSE 'Loss from Press ' END || job_number as source, loss_weight as weight FROM press_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT end_time as date, metal_type, CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END as category, CASE WHEN loss_weight < 0 THEN 'Gain from TPP ' ELSE 'Loss from TPP ' END || job_number as source, loss_weight as weight FROM tpp_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT end_time as date, metal_type, CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END as category, CASE WHEN loss_weight < 0 THEN 'Gain from Packing ' ELSE 'Loss from Packing ' END || job_number as source, loss_weight as weight FROM packing_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      
      ORDER BY date DESC
    `;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

// Recalculate opening_stock from source-of-truth tables.
// Formula: purchases - pending_issues - running_issues - all_completed_losses - packing_finished_output
const recalculateOpeningStock = (metalType) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        (SELECT COALESCE(SUM(weight), 0) FROM stock_transactions
          WHERE metal_type = $metal AND transaction_type IN ('PURCHASE', 'DHAL_ADDITION'))

        - (SELECT COALESCE(SUM(w), 0) FROM (
            SELECT COALESCE(issue_size, issue_weight, 0) as w FROM melting_process WHERE metal_type = $metal AND status = 'PENDING'
            UNION ALL SELECT COALESCE(issue_size, 0) FROM rolling_processes WHERE metal_type = $metal AND status = 'PENDING'
            UNION ALL SELECT COALESCE(issue_size, 0) FROM press_processes WHERE metal_type = $metal AND status = 'PENDING'
            UNION ALL SELECT COALESCE(issue_size, 0) FROM tpp_processes WHERE metal_type = $metal AND status = 'PENDING'
            UNION ALL SELECT COALESCE(issue_size, 0) FROM packing_processes WHERE metal_type = $metal AND status = 'PENDING'
          ))

        - (SELECT COALESCE(SUM(w), 0) FROM (
            SELECT COALESCE(issued_weight, issue_size, issue_weight, 0) as w FROM melting_process WHERE metal_type = $metal AND status = 'RUNNING'
            UNION ALL SELECT COALESCE(issued_weight, issue_size, 0) FROM rolling_processes WHERE metal_type = $metal AND status = 'RUNNING'
            UNION ALL SELECT COALESCE(issued_weight, issue_size, 0) FROM press_processes WHERE metal_type = $metal AND status = 'RUNNING'
            UNION ALL SELECT COALESCE(issued_weight, issue_size, 0) FROM tpp_processes WHERE metal_type = $metal AND status = 'RUNNING'
            UNION ALL SELECT COALESCE(issued_weight, issue_size, 0) FROM packing_processes WHERE metal_type = $metal AND status = 'RUNNING'
          ))

        - (SELECT COALESCE(SUM(w), 0) FROM (
            SELECT COALESCE(loss_weight, 0) as w FROM melting_process WHERE metal_type = $metal AND status = 'COMPLETED'
            UNION ALL SELECT COALESCE(loss_weight, 0) FROM rolling_processes WHERE metal_type = $metal AND status = 'COMPLETED'
            UNION ALL SELECT COALESCE(loss_weight, 0) FROM press_processes WHERE metal_type = $metal AND status = 'COMPLETED'
            UNION ALL SELECT COALESCE(loss_weight, 0) FROM tpp_processes WHERE metal_type = $metal AND status = 'COMPLETED'
            UNION ALL SELECT COALESCE(loss_weight, 0) FROM packing_processes WHERE metal_type = $metal AND status = 'COMPLETED'
          ))

        - (SELECT COALESCE(SUM(COALESCE(return_weight, 0)), 0) FROM packing_processes
            WHERE metal_type = $metal AND status = 'COMPLETED')

        as opening_stock
    `;
    db.get(query, { $metal: metalType }, (err, row) => {
      if (err) return reject(err);
      const correctStock = Math.max(row ? row.opening_stock : 0, 0);
      db.run(`UPDATE stock_master SET opening_stock = ? WHERE metal_type = ?`, [correctStock, metalType], function (updateErr) {
        if (updateErr) return reject(updateErr);
        resolve(correctStock);
      });
    });
  });
};

// Recalculate total_loss from all COMPLETED processes across all stages
const recalculateTotalLoss = (metalType) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT COALESCE(SUM(w), 0) as total FROM (
        SELECT COALESCE(loss_weight, 0) as w FROM melting_process WHERE metal_type = ? AND status = 'COMPLETED'
        UNION ALL
        SELECT COALESCE(loss_weight, 0) FROM rolling_processes WHERE metal_type = ? AND status = 'COMPLETED'
        UNION ALL
        SELECT COALESCE(loss_weight, 0) FROM press_processes WHERE metal_type = ? AND status = 'COMPLETED'
        UNION ALL
        SELECT COALESCE(loss_weight, 0) FROM tpp_processes WHERE metal_type = ? AND status = 'COMPLETED'
        UNION ALL
        SELECT COALESCE(loss_weight, 0) FROM packing_processes WHERE metal_type = ? AND status = 'COMPLETED'
      )
    `;
    db.get(query, [metalType, metalType, metalType, metalType, metalType], (err, row) => {
      if (err) return reject(err);
      const correctLoss = Math.max(row ? row.total : 0, 0);
      db.run(`UPDATE stock_master SET total_loss = ? WHERE metal_type = ?`, [correctLoss, metalType], function (updateErr) {
        if (updateErr) return reject(updateErr);
        resolve(correctLoss);
      });
    });
  });
};

// Recalculate inprocess_weight from active (PENDING/RUNNING) processes across all stages
const recalculateInprocessWeight = (metalType) => {
  return new Promise((resolve, reject) => {
    // For PENDING: use issue_size (queued weight)
    // For RUNNING: use issued_weight (actual started weight, may differ from queued)
    const query = `
      SELECT COALESCE(SUM(w), 0) as total FROM (
        SELECT CASE WHEN status = 'RUNNING' THEN COALESCE(issued_weight, issue_size, issue_weight, 0) ELSE COALESCE(issue_size, issue_weight, 0) END as w FROM melting_process WHERE metal_type = ? AND status IN ('PENDING', 'RUNNING')
        UNION ALL
        SELECT CASE WHEN status = 'RUNNING' THEN COALESCE(issued_weight, issue_size, 0) ELSE COALESCE(issue_size, 0) END as w FROM rolling_processes WHERE metal_type = ? AND status IN ('PENDING', 'RUNNING')
        UNION ALL
        SELECT CASE WHEN status = 'RUNNING' THEN COALESCE(issued_weight, issue_size, 0) ELSE COALESCE(issue_size, 0) END as w FROM press_processes WHERE metal_type = ? AND status IN ('PENDING', 'RUNNING')
        UNION ALL
        SELECT CASE WHEN status = 'RUNNING' THEN COALESCE(issued_weight, issue_size, 0) ELSE COALESCE(issue_size, 0) END as w FROM tpp_processes WHERE metal_type = ? AND status IN ('PENDING', 'RUNNING')
        UNION ALL
        SELECT CASE WHEN status = 'RUNNING' THEN COALESCE(issued_weight, issue_size, 0) ELSE COALESCE(issue_size, 0) END as w FROM packing_processes WHERE metal_type = ? AND status IN ('PENDING', 'RUNNING')
      )
    `;
    db.get(query, [metalType, metalType, metalType, metalType, metalType], (err, row) => {
      if (err) return reject(err);
      const correctWeight = row ? row.total : 0;
      // Sync the stock_master value
      db.run(`UPDATE stock_master SET inprocess_weight = ? WHERE metal_type = ?`, [correctWeight, metalType], function (updateErr) {
        if (updateErr) return reject(updateErr);
        resolve(correctWeight);
      });
    });
  });
};

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
