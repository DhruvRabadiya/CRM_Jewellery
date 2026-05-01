'use strict';

/**
 * Seed: ob_labour_rates
 * ──────────────────────
 * Inserts per-metal, per-size, 3-tier labour rates for Order Bills.
 * INSERT OR IGNORE means re-running is harmless.
 */

// Gold 24K and Gold 22K share the same size/rate structure.
const GOLD_SIZES = [
  // [size_label, size_value, retail, showroom, wholesale, is_custom, sort_order]
  ['0.05g',  0.05,   380,  250,  250, 0,  1],
  ['0.1g',   0.10,   300,  250,  250, 0,  2],
  ['0.25g',  0.25,   300,  250,  250, 0,  3],
  ['0.5g',   0.50,   500,  330,  330, 0,  4],
  ['1g',     1.0,    500,  330,  330, 0,  5],
  ['2g',     2.0,    720,  400,  400, 0,  6],
  ['5g',     5.0,    950,  500,  500, 0,  7],
  ['10g',   10.0,   1200,  600,  600, 0,  8],
  ['20g',   20.0,   2400, 1200, 1200, 0,  9],
  ['25g',   25.0,   3000, 1700, 1700, 0, 10],
  ['50g',   50.0,   5000, 2500, 2500, 0, 11],
  ['100g', 100.0,   6000, 4000, 4000, 0, 12],
];

const SILVER_SIZES = [
  // [size_label, size_value, retail, showroom, wholesale, is_custom, sort_order]
  ['1g-Bar',     null,  380,  250,  250, 0,  1],
  ['2g-bar',     null,  300,  250,  250, 0,  2],
  ['5g-C|B',     null,  300,  250,  250, 0,  3],
  ['10g-C|B',    null,  500,  330,  330, 0,  4],
  ['10g Colour', null,  500,  330,  330, 0,  5],
  ['20g Colour', null,  720,  400,  400, 0,  6],
  ['50g Colour', null,  950,  500,  500, 0,  7],
  ['20g-C|B',    null, 1200,  600,  600, 0,  8],
  ['25g-C|B',    null, 2400, 1200, 1200, 0,  9],
  ['50g-C|B',    null, 3000, 1700, 1700, 0, 10],
  ['100g-C|B',   null, 5000, 2500, 2500, 0, 11],
  ['200g Bar',   null, 5000, 5000, 5000, 0, 12],
  ['500g-Bar',   null, 6000, 6000, 6000, 0, 13],
];

module.exports = async function seedObRates(db) {
  const sql = `
    INSERT OR IGNORE INTO ob_labour_rates
      (metal_type, size_label, size_value,
       lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, is_custom, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const [sl, sv, r, s, w, ic, so] of GOLD_SIZES) {
    await db.pRun(sql, ['Gold 24K', sl, sv, r, s, w, ic, so]);
    await db.pRun(sql, ['Gold 22K', sl, sv, r, s, w, ic, so]);
  }
  for (const [sl, sv, r, s, w, ic, so] of SILVER_SIZES) {
    await db.pRun(sql, ['Silver', sl, sv, r, s, w, ic, so]);
  }

  const total = GOLD_SIZES.length * 2 + SILVER_SIZES.length;
  console.log(`[Seed] ob_labour_rates — ${total} rows inserted`);
};
