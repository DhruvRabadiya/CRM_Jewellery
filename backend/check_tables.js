const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = './jewelry.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database:', DB_PATH);
});

db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;", (err, tables) => {
  if (err) {
    console.error('Error:', err.message);
    db.close();
    process.exit(1);
  }
  
  console.log('\n📋 Tables in database:');
  tables.forEach(t => console.log('  -', t.name));
  
  // Get packing_processes schema
  db.all("PRAGMA table_info(packing_processes);", (err, columns) => {
    if (err) {
      console.log('\nError getting packing_processes schema:', err.message);
      db.close();
      return;
    }
    
    console.log('\n📊 packing_processes columns:');
    columns.forEach(c => console.log(`  - ${c.name} (${c.type})`));
    
    // Check for invalid entries
    db.all(`
      SELECT id, job_id, metal_type, category, return_pieces, return_weight, status 
      FROM packing_processes 
      WHERE return_pieces = 0 AND return_weight > 0
      ORDER BY created_at DESC
    `, (err, rows) => {
      if (err) {
        console.log('\nError querying packing_processes:', err.message);
        db.close();
        return;
      }
      
      console.log('\n⚠️  Invalid packing_processes entries (0 pieces + weight):');
      if (rows.length === 0) {
        console.log('  ✅ None found');
      } else {
        console.table(rows);
      }
      
      db.close();
    });
  });
});
