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
    const query = `UPDATE stock_master SET ${columnName} = ${columnName} ${operator} ? WHERE metal_type = ?`;

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
};
