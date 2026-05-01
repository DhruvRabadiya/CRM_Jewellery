'use strict';

/**
 * Seed: labour_charges
 * ──────────────────────
 * Inserts the default Metal → Category → Size pricing grid (3-tier).
 * INSERT OR IGNORE means re-running is harmless.
 */

const ROWS = [
  // [metal_type, category, size_label, size_value, retail, showroom, wholesale, sort]
  ['Gold 24K', 'Standard', '0.05g',  0.05,   380,  250,  250,  1],
  ['Gold 24K', 'Standard', '0.1g',   0.10,   300,  250,  250,  2],
  ['Gold 24K', 'Standard', '0.25g',  0.25,   300,  250,  250,  3],
  ['Gold 24K', 'Standard', '0.5g',   0.50,   500,  330,  330,  4],
  ['Gold 24K', 'Standard', '1g',     1,      500,  330,  330,  5],
  ['Gold 24K', 'Standard', '2g',     2,      720,  400,  400,  6],
  ['Gold 24K', 'Standard', '5g',     5,      950,  500,  500,  7],
  ['Gold 24K', 'Standard', '10g',    10,    1200,  600,  600,  8],
  ['Gold 24K', 'Standard', '20g',    20,    2400, 1200, 1200,  9],
  ['Gold 24K', 'Standard', '25g',    25,    3000, 1700, 1700, 10],
  ['Gold 24K', 'Standard', '50g',    50,    5000, 2500, 2500, 11],
  ['Gold 24K', 'Standard', '100g',   100,   6000, 4000, 4000, 12],
  ['Gold 22K', 'Standard', '0.05g',  0.05,   400,  300,  300,  1],
  ['Gold 22K', 'Standard', '0.1g',   0.10,   400,  300,  300,  2],
  ['Gold 22K', 'Standard', '0.25g',  0.25,   400,  300,  300,  3],
  ['Gold 22K', 'Standard', '0.5g',   0.50,   550,  400,  400,  4],
  ['Gold 22K', 'Standard', '1g',     1,      600,  400,  400,  5],
  ['Gold 22K', 'Standard', '2g',     2,      800,  450,  450,  6],
  ['Gold 22K', 'Standard', '5g',     5,     1000,  550,  550,  7],
  ['Gold 22K', 'Standard', '10g',    10,    1300,  700,  700,  8],
  ['Gold 22K', 'Standard', '20g',    20,    2500, 1300, 1300,  9],
  ['Gold 22K', 'Standard', '25g',    25,    3200, 1900, 1900, 10],
  ['Gold 22K', 'Standard', '50g',    50,    5500, 5500, 3200, 11],
  ['Gold 22K', 'Standard', '100g',   100,   6300, 4300, 4300, 12],
  ['Silver',   'Bar',      '1g',     1,      380,  250,  250,  1],
  ['Silver',   'Bar',      '2g',     2,      300,  250,  250,  2],
  ['Silver',   'Bar',      '200g',   200,   5000, 5000, 5000,  3],
  ['Silver',   'Bar',      '500g',   500,   6000, 6000, 6000,  4],
  ['Silver',   'C|B',      '5g',     5,      300,  250,  250,  1],
  ['Silver',   'C|B',      '10g',    10,     500,  330,  330,  2],
  ['Silver',   'C|B',      '20g',    20,    1200,  600,  600,  3],
  ['Silver',   'C|B',      '25g',    25,    2400, 1200, 1200,  4],
  ['Silver',   'C|B',      '50g',    50,    3000, 1700, 1700,  5],
  ['Silver',   'C|B',      '100g',   100,   5000, 2500, 2500,  6],
  ['Silver',   'Colour',   '10g',    10,     500,  330,  330,  1],
  ['Silver',   'Colour',   '20g',    20,     720,  400,  400,  2],
  ['Silver',   'Colour',   '50g',    50,     950,  500,  500,  3],
];

module.exports = async function seedLabourCharges(db) {
  for (const row of ROWS) {
    await db.pRun(
      `INSERT OR IGNORE INTO labour_charges
         (metal_type, category, size_label, size_value,
          lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row
    );
  }
  console.log(`[Seed] labour_charges — ${ROWS.length} rows inserted`);
};
