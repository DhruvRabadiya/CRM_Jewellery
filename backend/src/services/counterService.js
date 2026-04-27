const db = require("../../config/dbConfig");
const { createAppError } = require("../utils/common");

const ESTIMATE_STOCK_REFERENCE = "ORDER_BILL_STOCK";

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

const normalizeInventoryRow = (row) => ({
  ...row,
  category: row.category || row.target_product || "",
  size_label: row.size_label || row.target_product || "",
  total_pieces: parseInt(row.total_pieces, 10) || 0,
  size_value: parseFloat(row.size_value) || 0,
});

const getCounterInventory = async () => {
  const rows = await all(
    `SELECT metal_type,
            COALESCE(NULLIF(category, ''), target_product) AS category,
            COALESCE(NULLIF(size_label, ''), target_product) AS size_label,
            target_product,
            MAX(COALESCE(size_value, 0)) AS size_value,
            SUM(pieces) AS total_pieces
       FROM counter_inventory
      GROUP BY metal_type,
               COALESCE(NULLIF(category, ''), target_product),
               COALESCE(NULLIF(size_label, ''), target_product),
               target_product
     HAVING SUM(pieces) > 0
      ORDER BY metal_type, category, size_label`
  );

  return rows.map(normalizeInventoryRow);
};

const addCounterInventory = (
  metal_type,
  target_product,
  pieces,
  metadata = {}
) => {
  const {
    category = target_product,
    size_label = target_product,
    size_value = 0,
    reference_type = "",
    reference_id = null,
    notes = "",
  } = metadata;

  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO counter_inventory
      (metal_type, target_product, category, size_label, size_value, pieces, reference_type, reference_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
      query,
      [metal_type, target_product, category, size_label, size_value, pieces, reference_type, reference_id, notes],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

const _buildAvailabilityMap = (rows = []) => {
  const exact = new Map();
  const legacySize = new Map();
  const legacyCategory = new Map();

  rows.forEach((row) => {
    const normalized = normalizeInventoryRow(row);
    const exactKey = `${normalized.metal_type}::${normalized.category}::${normalized.size_label}`;
    const sizeKey = `${normalized.metal_type}::${normalized.size_label}`;
    const categoryKey = `${normalized.metal_type}::${normalized.category}`;

    exact.set(exactKey, (exact.get(exactKey) || 0) + normalized.total_pieces);
    legacySize.set(sizeKey, (legacySize.get(sizeKey) || 0) + normalized.total_pieces);
    legacyCategory.set(categoryKey, (legacyCategory.get(categoryKey) || 0) + normalized.total_pieces);

    // For Silver items with suffixes (e.g., "10g -C|B", "10g COLOUR"), also create a base size key
    // This allows matching with labour charges that only have the base size (e.g., "10g")
    if (normalized.metal_type === "Silver") {
      // Extract base size: "10g -C|B" -> "10g", "100g COLOUR" -> "100g"
      const baseSize = normalized.size_label.split(/\s+/)[0]; // Get first part before space
      if (baseSize !== normalized.size_label) {
        const baseSizeKey = `${normalized.metal_type}::${baseSize}`;
        const baseCategoryKey = `${normalized.metal_type}::${baseSize}`;
        legacySize.set(baseSizeKey, (legacySize.get(baseSizeKey) || 0) + normalized.total_pieces);
        legacyCategory.set(baseCategoryKey, (legacyCategory.get(baseCategoryKey) || 0) + normalized.total_pieces);
      }
    }
  });

  return { exact, legacySize, legacyCategory };
};

const getStockValidation = async (items = [], options = {}) => {
  const normalizedItems = (items || [])
    .map((item) => ({
      metal_type: item.metal_type || "",
      category: item.category || "",
      size_label: item.size_label || "",
      pcs: parseInt(item.pcs, 10) || 0,
    }))
    .filter((item) => item.metal_type && item.category && item.size_label);

  if (!normalizedItems.length) {
    return {
      valid: true,
      total_requested_pieces: 0,
      items: [],
    };
  }

  const inventoryRows = await getCounterInventory();
  const availability = _buildAvailabilityMap(inventoryRows);

  if (options.reference_id) {
    const reservedRows = await all(
      `SELECT metal_type,
              COALESCE(NULLIF(category, ''), target_product) AS category,
              COALESCE(NULLIF(size_label, ''), target_product) AS size_label,
              target_product,
              MAX(COALESCE(size_value, 0)) AS size_value,
              ABS(SUM(pieces)) AS total_pieces
         FROM counter_inventory
        WHERE reference_type = ? AND reference_id = ?
        GROUP BY metal_type,
                 COALESCE(NULLIF(category, ''), target_product),
                 COALESCE(NULLIF(size_label, ''), target_product),
                 target_product`,
      [ESTIMATE_STOCK_REFERENCE, options.reference_id]
    );

    reservedRows.forEach((row) => {
      const normalized = normalizeInventoryRow(row);
      const exactKey = `${normalized.metal_type}::${normalized.category}::${normalized.size_label}`;
      const sizeKey = `${normalized.metal_type}::${normalized.size_label}`;
      const categoryKey = `${normalized.metal_type}::${normalized.category}`;
      availability.exact.set(exactKey, (availability.exact.get(exactKey) || 0) + normalized.total_pieces);
      availability.legacySize.set(sizeKey, (availability.legacySize.get(sizeKey) || 0) + normalized.total_pieces);
      availability.legacyCategory.set(categoryKey, (availability.legacyCategory.get(categoryKey) || 0) + normalized.total_pieces);
    });
  }

  const results = normalizedItems.map((item) => {
    const exactKey = `${item.metal_type}::${item.category}::${item.size_label}`;
    const sizeKey = `${item.metal_type}::${item.size_label}`;
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
      valid: item.pcs <= available_pieces,
      message:
        item.pcs <= available_pieces
          ? ""
          : "Insufficient stock available for selected size/category",
    };
  });

  return {
    valid: results.every((item) => item.valid),
    total_requested_pieces: results.reduce((total, item) => total + item.pcs, 0),
    items: results,
  };
};

const assertStockAvailable = async (items = [], options = {}) => {
  const validation = await getStockValidation(items, options);
  const invalid = validation.items.filter((item) => !item.valid);

  if (invalid.length > 0) {
    throw createAppError(
      "Insufficient stock available for selected size/category",
      400,
      "INSUFFICIENT_COUNTER_STOCK",
      invalid
    );
  }

  return validation;
};

const reserveEstimateStock = async (run, billId, obNo, date, items = []) => {
  for (const item of items) {
    const pcs = parseInt(item.pcs, 10) || 0;
    if (pcs <= 0) continue;

    await run(
      `INSERT INTO counter_inventory
        (metal_type, target_product, category, size_label, size_value, pieces, reference_type, reference_id, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.metal_type,
        item.size_label || item.category || "",
        item.category || item.size_label || "",
        item.size_label || item.category || "",
        parseFloat(item.size_value) || 0,
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
