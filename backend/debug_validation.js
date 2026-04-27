const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./jewelry.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

// Simulate the functions from counterService
const normalizeInventoryRow = (row) => ({
  ...row,
  category: row.category || row.target_product || "",
  size_label: row.size_label || row.target_product || "",
  total_pieces: parseInt(row.total_pieces, 10) || 0,
  size_value: parseFloat(row.size_value) || 0,
});

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
  });

  return { exact, legacySize, legacyCategory };
};

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

// Test validation for a specific item
const testValidation = async () => {
  const inventoryRows = await getCounterInventory();
  const availability = _buildAvailabilityMap(inventoryRows);

  console.log('Counter inventory rows:');
  console.table(inventoryRows);

  console.log('\nAvailability maps:');
  console.log('Exact:', Object.fromEntries(availability.exact));
  console.log('Legacy Size:', Object.fromEntries(availability.legacySize));
  console.log('Legacy Category:', Object.fromEntries(availability.legacyCategory));

  // Test validation for "Gold 24K", "10 gm", "10 gm" (which should be available)
  const testItems = [
    {
      metal_type: "Gold 24K",
      category: "10 gm",
      size_label: "10 gm",
      pcs: 5, // Try to request 5 pieces
    }
  ];

  console.log('\nTesting validation for:', testItems);

  const results = testItems.map((item) => {
    const exactKey = `${item.metal_type}::${item.category}::${item.size_label}`;
    const sizeKey = `${item.metal_type}::${item.size_label}`;
    const categoryKey = `${item.metal_type}::${item.category}`;
    const available_pieces =
      availability.exact.get(exactKey) ??
      availability.legacySize.get(sizeKey) ??
      availability.legacyCategory.get(categoryKey) ??
      0;

    console.log(`\nItem: ${item.metal_type} | ${item.category} | ${item.size_label}`);
    console.log(`Keys checked: exact="${exactKey}", size="${sizeKey}", category="${categoryKey}"`);
    console.log(`Available pieces: ${available_pieces}, Requested: ${item.pcs}`);

    return {
      ...item,
      available_pieces,
      shortfall: Math.max(item.pcs - available_pieces, 0),
      valid: item.pcs <= available_pieces,
    };
  });

  console.log('\nValidation results:');
  console.table(results);

  db.close();
};

testValidation().catch(console.error);
