const db = require("../../config/dbConfig");

const getSvgInventory = () => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT metal_type, target_product, SUM(pieces) as total_pieces, SUM(weight) as total_weight 
      FROM svg_inventory 
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

const addSvgInventory = (metal_type, target_product, pieces, weight) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO svg_inventory (metal_type, target_product, pieces, weight) VALUES (?, ?, ?, ?)`;
    db.run(query, [metal_type, target_product, pieces, weight], function (err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
};

module.exports = {
  getSvgInventory,
  addSvgInventory,
};
