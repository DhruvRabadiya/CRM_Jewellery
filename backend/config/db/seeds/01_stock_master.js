'use strict';

/**
 * Seed: stock_master
 * ───────────────────
 * Inserts the three canonical metal-type rows.
 * INSERT OR IGNORE means re-running this seed is harmless.
 */
module.exports = async function seedStockMaster(db) {
  const metals = ['Gold 22K', 'Gold 24K', 'Silver'];
  for (const metal of metals) {
    await db.pRun(
      `INSERT OR IGNORE INTO stock_master
         (metal_type, opening_stock, rolling_stock, press_stock,
          tpp_stock, total_loss, inprocess_weight)
       VALUES (?, 0, 0, 0, 0, 0, 0)`,
      [metal]
    );
  }
  console.log('[Seed] stock_master — 3 rows inserted');
};
