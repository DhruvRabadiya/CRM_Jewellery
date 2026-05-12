'use strict';

const description = 'Add stored counter weights and backfill legacy rows';

async function up(db) {
  const cols = await db.pAll(`PRAGMA table_info("counter_inventory")`);
  const hasWeight = cols.some((col) => col.name === 'weight');

  if (!hasWeight) {
    await db.pRun(`ALTER TABLE counter_inventory ADD COLUMN weight REAL DEFAULT 0`);
    console.log('[DB] Added counter_inventory.weight');
  }

  await db.pRun(`
    UPDATE counter_inventory
       SET weight = ROUND(pieces * size_value, 4)
     WHERE ABS(COALESCE(weight, 0)) < 0.000001
       AND COALESCE(size_value, 0) > 0
  `);
}

module.exports = { up, description };
