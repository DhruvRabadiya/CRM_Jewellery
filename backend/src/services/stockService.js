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
    const query = `UPDATE stock_master SET opening_stock = opening_stock ${operator} ? WHERE metal_type = ?`;

    db.run(query, [weight, metalType], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const updateDhalStock = (metalType, weight, isAddition) => {
  return new Promise((resolve, reject) => {
    const operator = isAddition ? "+" : "-";
    const query = `UPDATE stock_master SET dhal_stock = dhal_stock ${operator} ? WHERE metal_type = ?`;

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

const addTotalLoss = (metalType, lossWeight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE stock_master SET total_loss = total_loss + ? WHERE metal_type = ?`;
    db.run(query, [lossWeight, metalType], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const getLossStats = () => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 'Melting' as source, metal_type, loss_weight, completed_at as date FROM melting_process WHERE status = 'COMPLETED' AND loss_weight > 0
      UNION ALL
      SELECT 'Rolling' as source, metal_type, loss_weight, end_time as date FROM rolling_processes WHERE status = 'COMPLETED' AND loss_weight > 0
      UNION ALL
      SELECT 'Press' as source, metal_type, loss_weight, end_time as date FROM press_processes WHERE status = 'COMPLETED' AND loss_weight > 0
      UNION ALL
      SELECT 'TPP' as source, metal_type, loss_weight, end_time as date FROM tpp_processes WHERE status = 'COMPLETED' AND loss_weight > 0
      UNION ALL
      SELECT 'Packing' as source, metal_type, loss_weight, end_time as date FROM packing_processes WHERE status = 'COMPLETED' AND loss_weight > 0
    `;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

const getPurchases = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM stock_transactions WHERE transaction_type = 'PURCHASE' ORDER BY date DESC`;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

const getDetailedScrapAndLoss = () => {
  return new Promise((resolve, reject) => {
    // We want to return a unified view grouped by job_number if possible, or distinct rows.
    // However, since Scrap is logged in stock_transactions and Loss is in the process tables,
    // we can use a UNION approach with a specific format.
    const query = `
      -- Scrap Returns
      SELECT 
        date, 
        metal_type, 
        'SCRAP' as category,
        description as source, -- This contains "Scrap from [Stage] [Job]"
        weight
      FROM stock_transactions 
      WHERE transaction_type = 'SCRAP_RETURN'
      
      UNION ALL
      
      -- Losses
      SELECT end_time as date, metal_type, 'LOSS' as category, 'Loss from Rolling ' || job_number as source, loss_weight as weight FROM rolling_processes WHERE status = 'COMPLETED' AND loss_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'LOSS' as category, 'Loss from Press ' || job_number as source, loss_weight as weight FROM press_processes WHERE status = 'COMPLETED' AND loss_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'LOSS' as category, 'Loss from TPP ' || job_number as source, loss_weight as weight FROM tpp_processes WHERE status = 'COMPLETED' AND loss_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'LOSS' as category, 'Loss from Packing ' || job_number as source, loss_weight as weight FROM packing_processes WHERE status = 'COMPLETED' AND loss_weight > 0
      
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
  updateDhalStock,
  updateProcessStock,
  logTransaction,
  addTotalLoss,
  getLossStats,
  getPurchases,
  getDetailedScrapAndLoss,
};
