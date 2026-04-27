const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./jewelry.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

console.log('Testing finished goods inventory query parts...\n');

// Test 1: Multi-category entries via process_return_items
db.all(`
  SELECT pp.metal_type, pri.category AS target_product,
         SUM(pri.return_pieces) AS total_pieces,
         SUM(pri.return_weight) AS total_weight
  FROM process_return_items pri
  INNER JOIN packing_processes pp ON pri.process_id = pp.id AND pri.process_type = 'packing'
  WHERE pp.status = 'COMPLETED'
  GROUP BY pp.metal_type, pri.category
`, [], (err, part1) => {
  if (err) {
    console.error('Error in part 1:', err);
  } else {
    console.log('Part 1 - Multi-category process_return_items:');
    console.table(part1 || []);
  }

  // Test 2: Legacy single-category
  db.all(`
    SELECT pp.metal_type, pp.category AS target_product,
           pp.return_pieces AS total_pieces,
           pp.return_weight AS total_weight
    FROM packing_processes pp
    WHERE pp.status = 'COMPLETED' AND (pp.return_weight > 0 OR pp.return_pieces > 0)
      AND NOT EXISTS (
        SELECT 1 FROM process_return_items pri
        WHERE pri.process_id = pp.id AND pri.process_type = 'packing'
      )
  `, [], (err, part2) => {
    if (err) {
      console.error('Error in part 2:', err);
    } else {
      console.log('\nPart 2 - Legacy single-category packing_processes:');
      console.table(part2 || []);
    }

    // Test 3: Counter adjustments
    db.all(`
      SELECT metal_type, target_product, pieces AS total_pieces, weight AS total_weight
      FROM finished_goods
    `, [], (err, part3) => {
      if (err) {
        console.error('Error in part 3:', err);
      } else {
        console.log('\nPart 3 - Counter adjustments (finished_goods):');
        console.table(part3 || []);
      }

      // Test combined query
      db.all(`
        SELECT metal_type, target_product,
               SUM(total_pieces) AS total_pieces,
               SUM(total_weight) AS total_weight
        FROM (
          SELECT pp.metal_type, pri.category AS target_product,
                 SUM(pri.return_pieces) AS total_pieces,
                 SUM(pri.return_weight) AS total_weight
          FROM process_return_items pri
          INNER JOIN packing_processes pp ON pri.process_id = pp.id AND pri.process_type = 'packing'
          WHERE pp.status = 'COMPLETED'
          GROUP BY pp.metal_type, pri.category
          UNION ALL
          SELECT pp.metal_type, pp.category AS target_product,
                 pp.return_pieces AS total_pieces,
                 pp.return_weight AS total_weight
          FROM packing_processes pp
          WHERE pp.status = 'COMPLETED' AND (pp.return_weight > 0 OR pp.return_pieces > 0)
            AND NOT EXISTS (
              SELECT 1 FROM process_return_items pri
              WHERE pri.process_id = pp.id AND pri.process_type = 'packing'
            )
          UNION ALL
          SELECT metal_type, target_product, pieces AS total_pieces, weight AS total_weight
          FROM finished_goods
        )
        GROUP BY metal_type, target_product
        HAVING SUM(total_pieces) > 0 OR SUM(total_weight) > 0
        ORDER BY metal_type, target_product
      `, [], (err, combined) => {
        if (err) {
          console.error('Error in combined query:', err);
        } else {
          console.log('\nCombined finished goods inventory:');
          console.table(combined || []);
        }
        db.close();
      });
    });
  });
});
