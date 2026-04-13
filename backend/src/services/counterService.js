const db = require("../../config/dbConfig");

const getCounterInventory = () => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT metal_type, target_product, SUM(pieces) as total_pieces
      FROM counter_inventory
      GROUP BY metal_type, target_product
      HAVING total_pieces > 0
      ORDER BY metal_type, target_product
    `;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

const addCounterInventory = (metal_type, target_product, pieces) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO counter_inventory (metal_type, target_product, pieces) VALUES (?, ?, ?)`;
    db.run(query, [metal_type, target_product, pieces], function (err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
};

module.exports = {
  getCounterInventory,
  addCounterInventory,
};
