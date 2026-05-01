'use strict';

/**
 * Migration 003 — Packing Finished-Goods Backfill
 * ─────────────────────────────────────────────────
 * Rewrites the callback-based `_backfillPackingFinishedGoods()` from the old
 * monolithic dbConfig.js as clean async/await code.
 *
 * What it does:
 *   1. Removes duplicate PACKING_OUTPUT rows (keeps the earliest per
 *      reference_id + target_product pair).
 *   2. Iterates every COMPLETED packing process and inserts a PACKING_OUTPUT
 *      row in finished_goods for each that is not already represented —
 *      skipping rows that look like they already exist as legacy (no
 *      reference_type) entries within a 5-minute timestamp window.
 *   3. Inserts a LEGACY_OPENING_BALANCE offset row for any metal/product
 *      combination whose legacy rows net to a negative total, preventing the
 *      UI from showing negative inventory.
 *
 * This migration is safe to re-run: every INSERT is guarded by an existence
 * check or a HAVING clause that excludes already-present offset rows.
 */

const description = 'Backfill packing finished_goods from completed packing processes';

async function up(db) {

  // ── 1. Remove PACKING_OUTPUT duplicates ───────────────────────────────────
  await db.pRun(`
    DELETE FROM finished_goods
     WHERE reference_type = 'PACKING_OUTPUT'
       AND id NOT IN (
         SELECT MIN(id)
           FROM finished_goods
          WHERE reference_type = 'PACKING_OUTPUT'
          GROUP BY reference_id, target_product
       )
  `);

  // ── 2. Collect source rows from packing processes ─────────────────────────
  // Source A: process_return_items rows linked to completed packing processes.
  // Source B: packing_processes rows with return data but no process_return_items.
  const rows = await db.pAll(`
    SELECT pp.id                                              AS process_id,
           pp.metal_type,
           pri.category                                       AS target_product,
           COALESCE(pri.return_pieces, 0)                    AS pieces,
           COALESCE(pri.return_weight, 0)                    AS weight,
           COALESCE(pp.end_time, pri.created_at, pp.date, CURRENT_TIMESTAMP) AS created_at
      FROM packing_processes pp
      INNER JOIN process_return_items pri
             ON  pri.process_id   = pp.id
            AND  pri.process_type = 'packing'
     WHERE pp.status = 'COMPLETED'

     UNION ALL

    SELECT pp.id                                              AS process_id,
           pp.metal_type,
           pp.category                                        AS target_product,
           COALESCE(pp.return_pieces, 0)                     AS pieces,
           COALESCE(pp.return_weight, 0)                     AS weight,
           COALESCE(pp.end_time, pp.date, CURRENT_TIMESTAMP) AS created_at
      FROM packing_processes pp
     WHERE pp.status = 'COMPLETED'
       AND (COALESCE(pp.return_weight, 0) > 0 OR COALESCE(pp.return_pieces, 0) > 0)
       AND NOT EXISTS (
             SELECT 1
               FROM process_return_items pri
              WHERE pri.process_id   = pp.id
                AND pri.process_type = 'packing'
           )
  `);

  let inserted = 0;

  for (const row of rows) {
    const pieces    = parseInt(row.pieces, 10) || 0;
    const weight    = parseFloat(row.weight)   || 0;
    const createdAt = row.created_at || new Date().toISOString();

    if (pieces <= 0 && weight <= 0) continue;

    // Skip if a PACKING_OUTPUT row already exists for this process + product.
    const byRef = await db.pGet(
      `SELECT id
         FROM finished_goods
        WHERE reference_type = 'PACKING_OUTPUT'
          AND reference_id   = ?
          AND target_product = ?
        LIMIT 1`,
      [row.process_id, row.target_product]
    );
    if (byRef) continue;

    // Skip if a legacy (reference_type = '') row with matching metal, product,
    // weight and timestamp (within 5 minutes) exists — it was already counted.
    const legacy = await db.pGet(
      `SELECT id
         FROM finished_goods
        WHERE COALESCE(reference_type, '') = ''
          AND metal_type     = ?
          AND target_product = ?
          AND COALESCE(pieces, 0) = ?
          AND ABS(COALESCE(weight, 0) - ?) < 0.000001
          AND ABS((julianday(COALESCE(created_at, ?)) - julianday(?)) * 1440.0) <= 5
        LIMIT 1`,
      [row.metal_type, row.target_product, pieces, weight, createdAt, createdAt]
    );
    if (legacy) continue;

    await db.pRun(
      `INSERT INTO finished_goods
          (metal_type, target_product, pieces, weight, created_at, reference_type, reference_id)
         VALUES (?, ?, ?, ?, ?, 'PACKING_OUTPUT', ?)`,
      [row.metal_type, row.target_product, pieces, weight, createdAt, row.process_id]
    );
    inserted += 1;
  }

  // ── 3. Insert LEGACY_OPENING_BALANCE offsets for negative net rows ─────────
  // If any (metal_type, target_product) group nets to a negative sum across
  // legacy (reference_type = '') rows, insert a compensating positive row so
  // the UI never shows negative stock.
  await db.pRun(`
    INSERT INTO finished_goods (metal_type, target_product, pieces, weight, reference_type)
    SELECT metal_type,
           target_product,
           ABS(SUM(COALESCE(pieces, 0))) AS pieces,
           ABS(SUM(COALESCE(weight, 0))) AS weight,
           'LEGACY_OPENING_BALANCE'
      FROM finished_goods
     WHERE COALESCE(reference_type, '') = ''
     GROUP BY metal_type, target_product
    HAVING (SUM(COALESCE(pieces, 0)) < 0 OR SUM(COALESCE(weight, 0)) < 0)
       AND NOT EXISTS (
             SELECT 1
               FROM finished_goods fg2
              WHERE fg2.metal_type     = finished_goods.metal_type
                AND fg2.target_product = finished_goods.target_product
                AND fg2.reference_type = 'LEGACY_OPENING_BALANCE'
           )
  `);

  if (inserted > 0) {
    console.log(`[DB] Backfilled ${inserted} missing finished_goods packing rows`);
  }
}

module.exports = { up, description };
