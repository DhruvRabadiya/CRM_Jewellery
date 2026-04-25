const sqlite3 = require('sqlite3').verbose();

const DB_PATH = './jewelry.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database:', DB_PATH);
});

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

async function main() {
  try {
    console.log('\n📋 === FINISHED GOODS CLEANUP REPORT ===\n');

    // 1. Get all finished goods entries
    console.log('📊 All Finished Goods Entries:');
    const allEntries = await dbAll(`
      SELECT id, metal_type, target_product, pieces, weight, created_at 
      FROM finished_goods 
      ORDER BY id DESC
    `);

    if (allEntries.length === 0) {
      console.log('✅ No entries found. Database is clean!\n');
      db.close();
      return;
    }

    console.log(`Found ${allEntries.length} total entries:\n`);
    console.table(allEntries);

    // 2. Identify invalid entries (0 pieces with non-zero weight)
    console.log('\n⚠️  === INVALID ENTRIES (0 pieces + non-zero weight) ===\n');
    const invalidEntries = allEntries.filter(
      (entry) => entry.pieces === 0 && entry.weight > 0
    );

    if (invalidEntries.length === 0) {
      console.log('✅ No invalid entries found!\n');
    } else {
      console.log(`Found ${invalidEntries.length} invalid entry(ies):\n`);
      console.table(invalidEntries);
    }

    // 3. Identify entries with corrupted target_product (contains commas)
    console.log('\n⚠️  === CORRUPTED TARGET_PRODUCT (contains commas) ===\n');
    const corruptedProduct = allEntries.filter(
      (entry) => entry.target_product && entry.target_product.includes(',')
    );

    if (corruptedProduct.length === 0) {
      console.log('✅ No corrupted target_product found!\n');
    } else {
      console.log(`Found ${corruptedProduct.length} entry(ies) with corrupted target_product:\n`);
      console.table(corruptedProduct);
    }

    // 4. Combine to-delete list
    const toDelete = [...invalidEntries, ...corruptedProduct];
    const uniqueIds = [...new Set(toDelete.map((e) => e.id))];

    if (uniqueIds.length === 0) {
      console.log('✅ No invalid entries to delete!\n');
      db.close();
      return;
    }

    // 5. Summary
    console.log('\n📋 === CLEANUP SUMMARY ===\n');
    console.log(`Total entries to delete: ${uniqueIds.length}`);
    console.log(`Entry IDs: ${uniqueIds.join(', ')}\n`);

    // 6. Perform deletion
    console.log('🔄 Deleting invalid entries...\n');

    for (const id of uniqueIds) {
      const entry = allEntries.find((e) => e.id === id);
      console.log(
        `🗑️  Deleting ID ${id}: ${entry.metal_type} | ${entry.target_product} | ${entry.pieces}pcs | ${entry.weight}g`
      );
      await dbRun('DELETE FROM finished_goods WHERE id = ?', [id]);
    }

    console.log('\n✅ Cleanup completed successfully!\n');

    // 7. Verify cleanup
    console.log('📊 Remaining Finished Goods Entries:');
    const remainingEntries = await dbAll(`
      SELECT id, metal_type, target_product, pieces, weight, created_at 
      FROM finished_goods 
      ORDER BY id DESC
    `);

    if (remainingEntries.length === 0) {
      console.log('✅ All finished goods entries have been cleaned up.\n');
    } else {
      console.log(`\n${remainingEntries.length} entries remain:\n`);
      console.table(remainingEntries);
    }

    db.close();
    console.log('✅ Database connection closed.\n');
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    db.close();
    process.exit(1);
  }
}

main();
