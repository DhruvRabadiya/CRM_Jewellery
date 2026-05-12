'use strict';

const db = require('../../config/dbConfig');
const { createAppError } = require('../utils/common');

const ESTIMATE_STOCK_REFERENCE = 'ORDER_BILL_STOCK';

const normalizeInventoryRow = (row) => ({
  ...row,
  category:      row.category     || row.target_product || '',
  size_label:    row.size_label   || row.target_product || '',
  total_pieces:  parseInt(row.total_pieces, 10) || 0,
  total_weight:  parseFloat(row.total_weight)   || 0,
  display_weight: parseFloat(row.display_weight) || 0,
  size_value:    parseFloat(row.size_value)     || 0,
});

// ─── Inventory queries ────────────────────────────────────────────────────────

const getCounterInventory = async () => {
  const rows = await db.pAll(
    `SELECT metal_type,
            COALESCE(NULLIF(category,   ''), target_product) AS category,
            COALESCE(NULLIF(size_label, ''), target_product) AS size_label,
            target_product,
            MAX(COALESCE(size_value, 0)) AS size_value,
            SUM(pieces) AS total_pieces,
            SUM(
              CASE
                WHEN ABS(COALESCE(weight, 0)) > 0 THEN COALESCE(weight, 0)
                WHEN COALESCE(size_value, 0) > 0 THEN pieces * size_value
                ELSE 0
              END
            ) AS total_weight,
            SUM(
              CASE
                WHEN COALESCE(size_value, 0) > 0 THEN pieces * size_value
                WHEN ABS(COALESCE(weight, 0)) > 0 THEN COALESCE(weight, 0)
                ELSE 0
              END
            ) AS display_weight
       FROM counter_inventory
      GROUP BY metal_type,
               COALESCE(NULLIF(category,   ''), target_product),
               COALESCE(NULLIF(size_label, ''), target_product),
               target_product
     HAVING SUM(pieces) > 0
      ORDER BY metal_type, category, size_label`
  );
  return rows.map(normalizeInventoryRow);
};

const addCounterInventory = async (
  metal_type, target_product, pieces, metadata = {}
) => {
  const {
    category       = target_product,
    size_label     = target_product,
    size_value     = 0,
    weight         = null,
    reference_type = '',
    reference_id   = null,
    notes          = '',
  } = metadata;

  const resolvedWeight = weight != null
    ? parseFloat(weight) || 0
    : (size_value > 0 ? pieces * size_value : 0);

  const { lastID } = await db.pRun(
    `INSERT INTO counter_inventory
       (metal_type, target_product, category, size_label, size_value, weight,
        pieces, reference_type, reference_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [metal_type, target_product, category, size_label, size_value,
     resolvedWeight, pieces, reference_type, reference_id, notes]
  );
  return lastID;
};

// ─── Stock validation ─────────────────────────────────────────────────────────

const _buildAvailabilityMap = (rows = []) => {
  const exact          = new Map();
  const legacySize     = new Map();
  const legacyCategory = new Map();

  rows.forEach((row) => {
    const n = normalizeInventoryRow(row);
    const exactKey    = `${n.metal_type}::${n.category}::${n.size_label}`;
    const sizeKey     = `${n.metal_type}::${n.size_label}`;
    const categoryKey = `${n.metal_type}::${n.category}`;

    exact.set(exactKey,          (exact.get(exactKey)          || 0) + n.total_pieces);
    legacySize.set(sizeKey,      (legacySize.get(sizeKey)      || 0) + n.total_pieces);
    legacyCategory.set(categoryKey, (legacyCategory.get(categoryKey) || 0) + n.total_pieces);

    // For Silver items with suffixes ("10g -C|B") also create a base-size key so
    // that labour-charge lookups using only the base size ("10g") still match.
    if (n.metal_type === 'Silver') {
      const baseSize = n.size_label.split(/\s+/)[0];
      if (baseSize !== n.size_label) {
        const baseSizeKey = `${n.metal_type}::${baseSize}`;
        legacySize.set(baseSizeKey,     (legacySize.get(baseSizeKey)     || 0) + n.total_pieces);
        legacyCategory.set(baseSizeKey, (legacyCategory.get(baseSizeKey) || 0) + n.total_pieces);
      }
    }
  });

  return { exact, legacySize, legacyCategory };
};

const getStockValidation = async (items = [], options = {}) => {
  const normalizedItems = (items || [])
    .map((item) => ({
      metal_type: item.metal_type || '',
      category:   item.category   || '',
      size_label: item.size_label || '',
      pcs:        parseInt(item.pcs, 10) || 0,
    }))
    .filter((item) => item.metal_type && item.category && item.size_label);

  if (!normalizedItems.length) {
    return { valid: true, total_requested_pieces: 0, items: [] };
  }

  const inventoryRows  = await getCounterInventory();
  const availability   = _buildAvailabilityMap(inventoryRows);

  // Re-add pieces that are currently reserved for the bill being edited,
  // so validation doesn't block the user from saving the same bill again.
  if (options.reference_id) {
    const reservedRows = await db.pAll(
      `SELECT metal_type,
              COALESCE(NULLIF(category,   ''), target_product) AS category,
              COALESCE(NULLIF(size_label, ''), target_product) AS size_label,
              target_product,
              MAX(COALESCE(size_value, 0)) AS size_value,
              ABS(SUM(pieces)) AS total_pieces
         FROM counter_inventory
        WHERE reference_type = ? AND reference_id = ?
        GROUP BY metal_type,
                 COALESCE(NULLIF(category,   ''), target_product),
                 COALESCE(NULLIF(size_label, ''), target_product),
                 target_product`,
      [ESTIMATE_STOCK_REFERENCE, options.reference_id]
    );

    reservedRows.forEach((row) => {
      const n           = normalizeInventoryRow(row);
      const exactKey    = `${n.metal_type}::${n.category}::${n.size_label}`;
      const sizeKey     = `${n.metal_type}::${n.size_label}`;
      const categoryKey = `${n.metal_type}::${n.category}`;
      availability.exact.set(exactKey,              (availability.exact.get(exactKey)              || 0) + n.total_pieces);
      availability.legacySize.set(sizeKey,          (availability.legacySize.get(sizeKey)          || 0) + n.total_pieces);
      availability.legacyCategory.set(categoryKey,  (availability.legacyCategory.get(categoryKey)  || 0) + n.total_pieces);
    });
  }

  const results = normalizedItems.map((item) => {
    const exactKey    = `${item.metal_type}::${item.category}::${item.size_label}`;
    const sizeKey     = `${item.metal_type}::${item.size_label}`;
    const categoryKey = `${item.metal_type}::${item.category}`;
    const available_pieces =
      availability.exact.get(exactKey) ??
      availability.legacySize.get(sizeKey) ??
      availability.legacyCategory.get(categoryKey) ??
      0;

    return {
      ...item,
      available_pieces,
      shortfall: Math.max(item.pcs - available_pieces, 0),
      valid:     item.pcs <= available_pieces,
      message:   item.pcs <= available_pieces
        ? ''
        : 'Insufficient stock available for selected size/category',
    };
  });

  return {
    valid:                   results.every((item) => item.valid),
    total_requested_pieces:  results.reduce((total, item) => total + item.pcs, 0),
    items:                   results,
  };
};

const assertStockAvailable = async (items = [], options = {}) => {
  const validation = await getStockValidation(items, options);
  const invalid    = validation.items.filter((item) => !item.valid);
  if (invalid.length > 0) {
    throw createAppError(
      'Insufficient stock available for selected size/category',
      400,
      'INSUFFICIENT_COUNTER_STOCK',
      invalid
    );
  }
  return validation;
};

// ─── Estimate stock reservation ───────────────────────────────────────────────

const reserveEstimateStock = async (run, billId, obNo, date, items = []) => {
  for (const item of items) {
    const pcs = parseInt(item.pcs, 10) || 0;
    if (pcs <= 0) continue;
    const sizeValue = parseFloat(item.size_value) || 0;

    await run(
      `INSERT INTO counter_inventory
         (metal_type, target_product, category, size_label, size_value, weight,
          pieces, reference_type, reference_id, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.metal_type,
        item.size_label || item.category || '',
        item.category   || item.size_label || '',
        item.size_label || item.category   || '',
        sizeValue,
        -(pcs * sizeValue),
        -pcs,
        ESTIMATE_STOCK_REFERENCE,
        billId,
        `Reserved for Estimate #${obNo}`,
        date,
      ]
    );
  }
};

const releaseEstimateStock = async (run, billId) => {
  await run(
    `DELETE FROM counter_inventory WHERE reference_type = ? AND reference_id = ?`,
    [ESTIMATE_STOCK_REFERENCE, billId]
  );
};

module.exports = {
  ESTIMATE_STOCK_REFERENCE,
  getCounterInventory,
  addCounterInventory,
  getStockValidation,
  assertStockAvailable,
  reserveEstimateStock,
  releaseEstimateStock,
};
