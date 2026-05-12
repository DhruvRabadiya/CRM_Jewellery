'use strict';

const db = require('../../config/dbConfig');

const getSvgInventory = async () => {
  const rows = await db.pAll(
    `SELECT metal_type, target_product,
            SUM(pieces)  AS total_pieces,
            SUM(weight)  AS total_weight
       FROM svg_inventory
      GROUP BY metal_type, target_product
     HAVING total_pieces > 0
      ORDER BY metal_type, target_product`
  );
  return rows;
};

const addSvgInventory = async (metal_type, target_product, pieces, weight) => {
  const { lastID } = await db.pRun(
    `INSERT INTO svg_inventory (metal_type, target_product, pieces, weight) VALUES (?, ?, ?, ?)`,
    [metal_type, target_product, pieces, weight]
  );
  return lastID;
};

const getSvgHistory = async (limit = 50) => {
  return db.pAll(
    `SELECT id, metal_type, target_product, pieces, weight, created_at
       FROM svg_inventory
      ORDER BY id DESC
      LIMIT ?`,
    [limit]
  );
};

module.exports = { getSvgInventory, addSvgInventory, getSvgHistory };
