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

module.exports = {
  getStockByMetal,
  updateOpeningStock,
  updateDhalStock,
  logTransaction,
  addTotalLoss,
};
