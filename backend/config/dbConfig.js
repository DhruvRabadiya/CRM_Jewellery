const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = process.env.DB_PATH || path.resolve(__dirname, "../jewelry.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the SQLite database.");
  }
});

// --- OB Labour Rates seed helper (matches screenshot data) ---
// Called on fresh DB and on migration from old size structure.
function _seedObRates(db) {
  // [size_label, size_value, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, is_custom, sort_order]
  const gold24kSizes = [
    ['0.05g',  0.05,  380, 250, 250, 0,  1],
    ['0.1g',   0.1,   300, 250, 250, 0,  2],
    ['0.25g',  0.25,  300, 250, 250, 0,  3],
    ['0.5g',   0.5,   500, 330, 330, 0,  4],
    ['1g',     1.0,   500, 330, 330, 0,  5],
    ['2g',     2.0,   720, 400, 400, 0,  6],
    ['5g',     5.0,   950, 500, 500, 0,  7],
    ['10g',   10.0,  1200, 600, 600, 0,  8],
    ['20g',   20.0,  2400,1200,1200, 0,  9],
    ['25g',   25.0,  3000,1700,1700, 0, 10],
    ['50g',   50.0,  5000,2500,2500, 0, 11],
    ['100g', 100.0,  6000,4000,4000, 0, 12],
  ];
  const gold22kSizes = [
    ['0.05g',  0.05,  380, 250, 250, 0,  1],
    ['0.1g',   0.1,   300, 250, 250, 0,  2],
    ['0.25g',  0.25,  300, 250, 250, 0,  3],
    ['0.5g',   0.5,   500, 330, 330, 0,  4],
    ['1g',     1.0,   500, 330, 330, 0,  5],
    ['2g',     2.0,   720, 400, 400, 0,  6],
    ['5g',     5.0,   950, 500, 500, 0,  7],
    ['10g',   10.0,  1200, 600, 600, 0,  8],
    ['20g',   20.0,  2400,1200,1200, 0,  9],
    ['25g',   25.0,  3000,1700,1700, 0, 10],
    ['50g',   50.0,  5000,2500,2500, 0, 11],
    ['100g', 100.0,  6000,4000,4000, 0, 12],
  ];
  const silverSizes = [
    ['1g-Bar',     null,  380, 250, 250, 0,  1],
    ['2g-bar',     null,  300, 250, 250, 0,  2],
    ['5g-C|B',     null,  300, 250, 250, 0,  3],
    ['10g-C|B',    null,  500, 330, 330, 0,  4],
    ['10g Colour', null,  500, 330, 330, 0,  5],
    ['20g Colour', null,  720, 400, 400, 0,  6],
    ['50g Colour', null,  950, 500, 500, 0,  7],
    ['20g-C|B',    null, 1200, 600, 600, 0,  8],
    ['25g-C|B',    null, 2400,1200,1200, 0,  9],
    ['50g-C|B',    null, 3000,1700,1700, 0, 10],
    ['100g-C|B',   null, 5000,2500,2500, 0, 11],
    ['200g Bar',   null, 5000,5000,5000, 0, 12],
    ['500g-Bar',   null, 6000,6000,6000, 0, 13],
  ];
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO ob_labour_rates
      (metal_type, size_label, size_value, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, is_custom, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  gold24kSizes.forEach(([sl, sv, r, s, w, ic, so]) => stmt.run(['Gold 24K', sl, sv, r, s, w, ic, so]));
  gold22kSizes.forEach(([sl, sv, r, s, w, ic, so]) => stmt.run(['Gold 22K', sl, sv, r, s, w, ic, so]));
  silverSizes.forEach(([sl, sv, r, s, w, ic, so])   => stmt.run(['Silver',   sl, sv, r, s, w, ic, so]));
  stmt.finalize(() => console.log('Seeded OB labour rates (Gold 24K + Gold 22K + Silver)'));
}

let _packingFinishedGoodsBackfillRunning = false;
let _packingFinishedGoodsBackfillCompleted = false;

function _backfillPackingFinishedGoods(db) {
  if (_packingFinishedGoodsBackfillRunning || _packingFinishedGoodsBackfillCompleted) {
    return;
  }

  db.all(`PRAGMA table_info(finished_goods)`, (pragmaErr, columns) => {
    if (pragmaErr || !columns) return;

    const hasReferenceType = columns.some((c) => c.name === "reference_type");
    const hasReferenceId = columns.some((c) => c.name === "reference_id");
    if (!hasReferenceType || !hasReferenceId) return;

    _packingFinishedGoodsBackfillRunning = true;

    const outputQuery = `
      SELECT pp.id AS process_id,
             pp.metal_type,
             pri.category AS target_product,
             COALESCE(pri.return_pieces, 0) AS pieces,
             COALESCE(pri.return_weight, 0) AS weight,
             COALESCE(pp.end_time, pri.created_at, pp.date, CURRENT_TIMESTAMP) AS created_at
      FROM packing_processes pp
      INNER JOIN process_return_items pri
        ON pri.process_id = pp.id
       AND pri.process_type = 'packing'
      WHERE pp.status = 'COMPLETED'

      UNION ALL

      SELECT pp.id AS process_id,
             pp.metal_type,
             pp.category AS target_product,
             COALESCE(pp.return_pieces, 0) AS pieces,
             COALESCE(pp.return_weight, 0) AS weight,
             COALESCE(pp.end_time, pp.date, CURRENT_TIMESTAMP) AS created_at
      FROM packing_processes pp
      WHERE pp.status = 'COMPLETED'
        AND (COALESCE(pp.return_weight, 0) > 0 OR COALESCE(pp.return_pieces, 0) > 0)
        AND NOT EXISTS (
          SELECT 1
          FROM process_return_items pri
          WHERE pri.process_id = pp.id
            AND pri.process_type = 'packing'
        )
    `;

    db.run(
      `DELETE FROM finished_goods
        WHERE reference_type = 'PACKING_OUTPUT'
          AND id NOT IN (
            SELECT MIN(id)
            FROM finished_goods
            WHERE reference_type = 'PACKING_OUTPUT'
            GROUP BY reference_id, target_product
          )`,
      (dedupeErr) => {
        if (dedupeErr) {
          _packingFinishedGoodsBackfillRunning = false;
          return;
        }

        db.all(outputQuery, [], (rowsErr, rows) => {
          if (rowsErr || !rows) {
            _packingFinishedGoodsBackfillRunning = false;
            return;
          }

          let inserted = 0;

          const finalizeBackfill = () => {
            db.run(
              `INSERT INTO finished_goods (metal_type, target_product, pieces, weight, reference_type)
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
                    WHERE fg2.metal_type = finished_goods.metal_type
                      AND fg2.target_product = finished_goods.target_product
                      AND fg2.reference_type = 'LEGACY_OPENING_BALANCE'
                  )`,
              (openingErr) => {
                if (openingErr) {
                  console.error("Error backfilling finished goods opening balances:", openingErr.message);
                }
                if (inserted > 0) {
                  console.log(`Backfilled ${inserted} missing finished goods packing rows`);
                }
                _packingFinishedGoodsBackfillRunning = false;
                _packingFinishedGoodsBackfillCompleted = true;
              }
            );
          };

          const processRow = (index) => {
            if (index >= rows.length) {
              finalizeBackfill();
              return;
            }

            const row = rows[index];
            const pieces = parseInt(row.pieces, 10) || 0;
            const weight = parseFloat(row.weight) || 0;
            const createdAt = row.created_at || new Date().toISOString();

            if (pieces <= 0 && weight <= 0) {
              processRow(index + 1);
              return;
            }

            db.get(
              `SELECT id
                 FROM finished_goods
                WHERE reference_type = 'PACKING_OUTPUT'
                  AND reference_id = ?
                  AND target_product = ?
                LIMIT 1`,
              [row.process_id, row.target_product],
              (refErr, refMatch) => {
                if (refErr || refMatch) {
                  processRow(index + 1);
                  return;
                }

                db.get(
                  `SELECT id
                     FROM finished_goods
                    WHERE COALESCE(reference_type, '') = ''
                      AND metal_type = ?
                      AND target_product = ?
                      AND COALESCE(pieces, 0) = ?
                      AND ABS(COALESCE(weight, 0) - ?) < 0.000001
                      AND ABS((julianday(COALESCE(created_at, ?)) - julianday(?)) * 1440.0) <= 5
                    LIMIT 1`,
                  [row.metal_type, row.target_product, pieces, weight, createdAt, createdAt],
                  (legacyErr, legacyMatch) => {
                    if (legacyErr || legacyMatch) {
                      processRow(index + 1);
                      return;
                    }

                    db.run(
                      `INSERT INTO finished_goods
                        (metal_type, target_product, pieces, weight, created_at, reference_type, reference_id)
                       VALUES (?, ?, ?, ?, ?, 'PACKING_OUTPUT', ?)`,
                      [row.metal_type, row.target_product, pieces, weight, createdAt, row.process_id],
                      (insertErr) => {
                        if (!insertErr) inserted += 1;
                        processRow(index + 1);
                      }
                    );
                  }
                );
              }
            );
          };

          processRow(0);
        });
      }
    );
  });
}

db.serialize(() => {
  // 1. STOCK MASTER (Raw Material and Pooled Stages)
  db.run(`CREATE TABLE IF NOT EXISTS stock_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metal_type TEXT UNIQUE,
        opening_stock REAL DEFAULT 0,
        rolling_stock REAL DEFAULT 0,
        press_stock REAL DEFAULT 0,
        tpp_stock REAL DEFAULT 0,
        total_loss REAL DEFAULT 0
    )`);

  // Initialize default rows if they don't exist
  db.run(
    `INSERT OR IGNORE INTO stock_master (metal_type, opening_stock, rolling_stock, press_stock, tpp_stock) VALUES ('Gold 22K', 0, 0, 0, 0)`,
  );
  db.run(
    `INSERT OR IGNORE INTO stock_master (metal_type, opening_stock, rolling_stock, press_stock, tpp_stock) VALUES ('Gold 24K', 0, 0, 0, 0)`,
  );
  db.run(
    `INSERT OR IGNORE INTO stock_master (metal_type, opening_stock, rolling_stock, press_stock, tpp_stock) VALUES ('Silver', 0, 0, 0, 0)`,
  );

  // Safe migration for total_loss column on existing databases
  db.all(`PRAGMA table_info(stock_master)`, (err, columns) => {
    if (!err && columns && !columns.some((col) => col.name === "total_loss")) {
      db.run(
        "ALTER TABLE stock_master ADD COLUMN total_loss REAL DEFAULT 0",
        (alterErr) => {
          if (alterErr)
            console.error("Error migrating total_loss:", alterErr.message);
          else
            console.log("Successfully added total_loss column to stock_master");
        },
      );
    }
  });

  // Fix any negative total_loss values (clamp to 0)
  db.run(`UPDATE stock_master SET total_loss = 0 WHERE total_loss < 0`);

  // Migration: move any leftover dhal_stock into opening_stock and zero it out
  db.all(`PRAGMA table_info(stock_master)`, (err, columns) => {
    if (!err && columns && columns.some((col) => col.name === "dhal_stock")) {
      db.run(`UPDATE stock_master SET opening_stock = opening_stock + dhal_stock, dhal_stock = 0 WHERE dhal_stock > 0`, (alterErr) => {
        if (alterErr) console.error("Error migrating dhal_stock:", alterErr.message);
        else console.log("Migrated any remaining dhal_stock into opening_stock");
      });
    }
  });

  // 2. STOCK TRANSACTIONS (Ledger for Audit)
  db.run(`CREATE TABLE IF NOT EXISTS stock_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        metal_type TEXT,
        transaction_type TEXT,
        weight REAL,
        description TEXT,
        reference_type TEXT DEFAULT '',
        reference_id INTEGER
    )`);

  // Migration: add reference_type / reference_id to stock_transactions
  db.all(`PRAGMA table_info(stock_transactions)`, (err, columns) => {
    if (!err && columns) {
      if (!columns.some((c) => c.name === 'reference_type')) {
        db.run(`ALTER TABLE stock_transactions ADD COLUMN reference_type TEXT DEFAULT ''`, (e) => {
          if (e) console.error('Migration stock_transactions.reference_type:', e.message);
          else console.log('Added reference_type column to stock_transactions');
        });
      }
      if (!columns.some((c) => c.name === 'reference_id')) {
        db.run(`ALTER TABLE stock_transactions ADD COLUMN reference_id INTEGER`, (e) => {
          if (e) console.error('Migration stock_transactions.reference_id:', e.message);
          else console.log('Added reference_id column to stock_transactions');
        });
      }
    }
  });

  // Migration: selling-side metal receipts must not live in production stock transactions.
  // These legacy rows caused estimate/customer metal to inflate production opening stock.
  db.run(
    `DELETE FROM stock_transactions
      WHERE transaction_type IN ('ESTIMATE_METAL_IN', 'CUSTOMER_METAL_IN')`,
    (err) => {
      if (err && !err.message.includes('no such table')) {
        console.error('Cleanup selling-side stock transactions:', err.message);
      }
    }
  );

  // 3. MELTING PROCESS (Standalone)
  db.run(`CREATE TABLE IF NOT EXISTS melting_process (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metal_type TEXT,
        unit TEXT DEFAULT 'g',
        issue_weight REAL,
        issue_pieces REAL DEFAULT 0,
        return_weight REAL DEFAULT 0,
        return_pieces REAL DEFAULT 0,
        scrap_weight REAL DEFAULT 0,
        loss_weight REAL DEFAULT 0,
        status TEXT DEFAULT 'RUNNING',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
    )`);

  // --- SEPARATED PRODUCTION PROCESSES ---

  // 4a. ROLLING PROCESS
  db.run(`CREATE TABLE IF NOT EXISTS rolling_processes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_number TEXT,
        job_name TEXT,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        metal_type TEXT,
        unit TEXT DEFAULT 'g',
        employee TEXT,
        issue_size REAL,
        category TEXT,
        status TEXT DEFAULT 'PENDING',
        issued_weight REAL DEFAULT 0,
        issue_pieces INTEGER DEFAULT 0,
        return_weight REAL DEFAULT 0,
        return_pieces INTEGER DEFAULT 0,
        scrap_weight REAL DEFAULT 0,
        loss_weight REAL DEFAULT 0,
        start_time DATETIME,
        end_time DATETIME
    )`);

  // 4b. PRESS PROCESS
  db.run(`CREATE TABLE IF NOT EXISTS press_processes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_number TEXT,
        job_name TEXT,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        metal_type TEXT,
        unit TEXT DEFAULT 'g',
        employee TEXT,
        issue_size REAL,
        category TEXT,
        status TEXT DEFAULT 'PENDING',
        issued_weight REAL DEFAULT 0,
        issue_pieces INTEGER DEFAULT 0,
        return_weight REAL DEFAULT 0,
        return_pieces INTEGER DEFAULT 0,
        scrap_weight REAL DEFAULT 0,
        loss_weight REAL DEFAULT 0,
        start_time DATETIME,
        end_time DATETIME
    )`);

  // 4c. TPP PROCESS
  db.run(`CREATE TABLE IF NOT EXISTS tpp_processes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_number TEXT,
        job_name TEXT,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        metal_type TEXT,
        unit TEXT DEFAULT 'g',
        employee TEXT,
        issue_size REAL,
        category TEXT,
        status TEXT DEFAULT 'PENDING',
        issued_weight REAL DEFAULT 0,
        issue_pieces INTEGER DEFAULT 0,
        return_weight REAL DEFAULT 0,
        return_pieces INTEGER DEFAULT 0,
        scrap_weight REAL DEFAULT 0,
        loss_weight REAL DEFAULT 0,
        start_time DATETIME,
        end_time DATETIME
    )`);

  // 4d. PACKING PROCESS
  db.run(`CREATE TABLE IF NOT EXISTS packing_processes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_number TEXT,
        job_name TEXT,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        metal_type TEXT,
        unit TEXT DEFAULT 'g',
        employee TEXT,
        issue_size REAL,
        category TEXT,
        status TEXT DEFAULT 'PENDING',
        issued_weight REAL DEFAULT 0,
        issue_pieces INTEGER DEFAULT 0,
        return_weight REAL DEFAULT 0,
        return_pieces INTEGER DEFAULT 0,
        scrap_weight REAL DEFAULT 0,
        loss_weight REAL DEFAULT 0,
        start_time DATETIME,
        end_time DATETIME
    )`);

  // 5. PRODUCTION JOBS (Job Tracking)
  db.run(`CREATE TABLE IF NOT EXISTS production_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_number TEXT,
      metal_type TEXT,
      target_product TEXT,
      current_step TEXT,
      status TEXT DEFAULT 'PENDING',
      issue_weight REAL DEFAULT 0,
      current_weight REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 6. JOB STEPS (Step Logs)
  db.run(`CREATE TABLE IF NOT EXISTS job_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      step_name TEXT,
      issue_weight REAL DEFAULT 0,
      return_weight REAL DEFAULT 0,
      scrap_weight REAL DEFAULT 0,
      loss_weight REAL DEFAULT 0,
      return_pieces INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES production_jobs(id)
  )`);

  // 7. FINISHED GOODS (Final Inventory)
  db.run(`CREATE TABLE IF NOT EXISTS finished_goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metal_type TEXT,
      target_product TEXT,
      pieces INTEGER,
      weight REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.all(`PRAGMA table_info(finished_goods)`, (err, columns) => {
    if (!err && columns) {
      if (!columns.some((c) => c.name === "reference_type")) {
        db.run(`ALTER TABLE finished_goods ADD COLUMN reference_type TEXT DEFAULT ''`, (alterErr) => {
          if (alterErr) console.error("Error adding reference_type to finished_goods:", alterErr.message);
          else _backfillPackingFinishedGoods(db);
        });
      }
      if (!columns.some((c) => c.name === "reference_id")) {
        db.run(`ALTER TABLE finished_goods ADD COLUMN reference_id INTEGER`, (alterErr) => {
          if (alterErr) console.error("Error adding reference_id to finished_goods:", alterErr.message);
          else _backfillPackingFinishedGoods(db);
        });
      }
      if (columns.some((c) => c.name === "reference_type") && columns.some((c) => c.name === "reference_id")) {
        _backfillPackingFinishedGoods(db);
      }
    }
  });

  // 6a. COUNTER INVENTORY (Selling Counter)
  db.run(`CREATE TABLE IF NOT EXISTS counter_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metal_type TEXT,
      target_product TEXT,
      category TEXT DEFAULT '',
      size_label TEXT DEFAULT '',
      size_value REAL DEFAULT 0,
      pieces INTEGER,
      reference_type TEXT DEFAULT '',
      reference_id INTEGER,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 6b. SVG INVENTORY (Sales Vault)
  db.run(`CREATE TABLE IF NOT EXISTS svg_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metal_type TEXT,
      target_product TEXT,
      pieces INTEGER,
      weight REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 7. CUSTOMERS (Selling Counter Accounts)
  db.run(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      party_name TEXT NOT NULL,
      firm_name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      phone_no TEXT NOT NULL,
      telephone_no TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Safe migration for description and employee columns across all process tables
  const processTables = [
    "melting_process",
    "rolling_processes",
    "press_processes",
    "tpp_processes",
    "packing_processes",
  ];

  processTables.forEach((tableName) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (!err && columns) {
        // Migrate Description
        if (!columns.some((col) => col.name === "description")) {
          db.run(
            `ALTER TABLE ${tableName} ADD COLUMN description TEXT DEFAULT ''`,
            (alterErr) => {
              if (alterErr)
                console.error(`Error migrating description for ${tableName}:`, alterErr.message);
              else
                console.log(`Successfully added description column to ${tableName}`);
            },
          );
        }
        // Migrate Employee Tracker
        if (!columns.some((col) => col.name === "employee")) {
          db.run(
            `ALTER TABLE ${tableName} ADD COLUMN employee TEXT DEFAULT 'Unknown'`,
            (alterErr) => {
              if (alterErr)
                console.error(`Error migrating employee tracker for ${tableName}:`, alterErr.message);
              else
                console.log(`Successfully added employee column to ${tableName}`);
            },
          );
        }
      }
    });
  });

  // Migration: add inprocess_weight to stock_master
  db.all(`PRAGMA table_info(stock_master)`, (err, columns) => {
    if (!err && columns && !columns.some((col) => col.name === "inprocess_weight")) {
      db.run(`ALTER TABLE stock_master ADD COLUMN inprocess_weight REAL DEFAULT 0`, (alterErr) => {
        if (alterErr) console.error("Error migrating inprocess_weight:", alterErr.message);
        else console.log("Successfully added inprocess_weight column to stock_master");
      });
    }
  });

  // process_return_items table for multiple return rows per job
  db.run(`CREATE TABLE IF NOT EXISTS process_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      process_id INTEGER NOT NULL,
      process_type TEXT NOT NULL,
      category TEXT DEFAULT '',
      return_weight REAL DEFAULT 0,
      return_pieces INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (!err) {
      _backfillPackingFinishedGoods(db);
    }
  });

  // Migration: add extra columns to melting_process for PENDING/RUNNING/COMPLETED support
  db.all(`PRAGMA table_info(melting_process)`, (err, columns) => {
    if (!err && columns) {
      const addCol = (col, def) => {
        if (!columns.some((c) => c.name === col)) {
          db.run(`ALTER TABLE melting_process ADD COLUMN ${col} ${def}`, (alterErr) => {
            if (alterErr) console.error(`Error adding ${col} to melting_process:`, alterErr.message);
            else console.log(`Added ${col} to melting_process`);
          });
        }
      };
      addCol("job_number", "TEXT");
      addCol("job_name", "TEXT");
      addCol("category", "TEXT DEFAULT ''");
      addCol("issued_weight", "REAL DEFAULT 0");
      addCol("issue_size", "REAL DEFAULT 0");
      addCol("start_time", "DATETIME");
      addCol("end_time", "DATETIME");
    }
  });

  // 6. USERS (Authentication & Authorization)
  db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK( role IN ('ADMIN', 'EMPLOYEE') ) NOT NULL DEFAULT 'EMPLOYEE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (!err) {
      // Check if any users exist, if not seed the default ADMIN
      db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
        if (!err && row.count === 0) {
          try {
            const bcrypt = require("bcryptjs");
            const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";
            if (!process.env.DEFAULT_ADMIN_PASSWORD) {
              console.warn("WARNING: DEFAULT_ADMIN_PASSWORD environment variable is not set. Using default password 'admin123'. Set DEFAULT_ADMIN_PASSWORD in your environment for production use.");
            }
            const salt = await bcrypt.genSalt(10);
            const hashed = await bcrypt.hash(defaultPassword, salt);

            db.run(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'ADMIN')`, ['admin', hashed], (insertErr) => {
              if (insertErr) {
                console.error("Failed to seed default admin user:", insertErr.message);
              } else {
                console.log("Successfully seeded default Admin account (username: admin)");
              }
            });
          } catch (hashError) {
            console.error("Failed to hash default admin password:", hashError.message);
          }
        }
      });
    } else {
      console.error("Failed to create users table:", err.message);
    }
  });

  // 8. LABOUR CHARGES (Admin-configurable per metal type + category + size, with 3-tier pricing)
  // Schema: Metal Type -> Category -> Size -> (Retail, Showroom, Wholesale) rates
  const LABOUR_CHARGES_SEED = [
    // [metal_type, category, size_label, size_value, retail, showroom, wholesale, sort]
    // Gold 24K / Standard
    ['Gold 24K', 'Standard', '0.05g',   0.05,   380,  250,  250, 1],
    ['Gold 24K', 'Standard', '0.1g',    0.1,    300,  250,  250, 2],
    ['Gold 24K', 'Standard', '0.25g',   0.25,   300,  250,  250, 3],
    ['Gold 24K', 'Standard', '0.5g',    0.5,    500,  330,  330, 4],
    ['Gold 24K', 'Standard', '1g',      1,      500,  330,  330, 5],
    ['Gold 24K', 'Standard', '2g',      2,      720,  400,  400, 6],
    ['Gold 24K', 'Standard', '5g',      5,      950,  500,  500, 7],
    ['Gold 24K', 'Standard', '10g',     10,     1200, 600,  600, 8],
    ['Gold 24K', 'Standard', '20g',     20,     2400, 1200, 1200, 9],
    ['Gold 24K', 'Standard', '25g',     25,     3000, 1700, 1700, 10],
    ['Gold 24K', 'Standard', '50g',     50,     5000, 2500, 2500, 11],
    ['Gold 24K', 'Standard', '100g',    100,    6000, 4000, 4000, 12],
    // Gold 22K / Standard
    ['Gold 22K', 'Standard', '0.05g',   0.05,   400,  300,  300, 1],
    ['Gold 22K', 'Standard', '0.1g',    0.1,    400,  300,  300, 2],
    ['Gold 22K', 'Standard', '0.25g',   0.25,   400,  300,  300, 3],
    ['Gold 22K', 'Standard', '0.5g',    0.5,    550,  400,  400, 4],
    ['Gold 22K', 'Standard', '1g',      1,      600,  400,  400, 5],
    ['Gold 22K', 'Standard', '2g',      2,      800,  450,  450, 6],
    ['Gold 22K', 'Standard', '5g',      5,      1000, 550,  550, 7],
    ['Gold 22K', 'Standard', '10g',     10,     1300, 700,  700, 8],
    ['Gold 22K', 'Standard', '20g',     20,     2500, 1300, 1300, 9],
    ['Gold 22K', 'Standard', '25g',     25,     3200, 1900, 1900, 10],
    ['Gold 22K', 'Standard', '50g',     50,     5500, 5500, 3200, 11],
    ['Gold 22K', 'Standard', '100g',    100,    6300, 4300, 4300, 12],
    // Silver / Bar
    ['Silver',   'Bar',      '1g',      1,      380,  250,  250, 1],
    ['Silver',   'Bar',      '2g',      2,      300,  250,  250, 2],
    ['Silver',   'Bar',      '200g',    200,    5000, 5000, 5000, 3],
    ['Silver',   'Bar',      '500g',    500,    6000, 6000, 6000, 4],
    // Silver / C|B
    ['Silver',   'C|B',      '5g',      5,      300,  250,  250, 1],
    ['Silver',   'C|B',      '10g',     10,     500,  330,  330, 2],
    ['Silver',   'C|B',      '20g',     20,     1200, 600,  600, 3],
    ['Silver',   'C|B',      '25g',     25,     2400, 1200, 1200, 4],
    ['Silver',   'C|B',      '50g',     50,     3000, 1700, 1700, 5],
    ['Silver',   'C|B',      '100g',    100,    5000, 2500, 2500, 6],
    // Silver / Colour
    ['Silver',   'Colour',   '10g',     10,     500,  330,  330, 1],
    ['Silver',   'Colour',   '20g',     20,     720,  400,  400, 2],
    ['Silver',   'Colour',   '50g',     50,     950,  500,  500, 3],
  ];

  const seedLabourCharges = () => {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO labour_charges
        (metal_type, category, size_label, size_value, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    LABOUR_CHARGES_SEED.forEach((row) => stmt.run(row));
    stmt.finalize(() => console.log('Seeded default labour charges (Metal -> Category -> Size, 3-tier)'));
  };

  // Check if new schema exists by looking at labour_charges columns.
  db.all(`PRAGMA table_info(labour_charges)`, (pragmaErr, existingCols) => {
    const hasNewSchema =
      existingCols &&
      existingCols.some((c) => c.name === 'size_label') &&
      existingCols.some((c) => c.name === 'lc_pp_retail');

    if (existingCols && existingCols.length > 0 && !hasNewSchema) {
      // Migrate: rename old table, create new, seed, then drop old.
      db.serialize(() => {
        db.run(`DROP TABLE IF EXISTS labour_charges_old`);
        db.run(`ALTER TABLE labour_charges RENAME TO labour_charges_old`, (rnErr) => {
          if (rnErr) console.error('labour_charges rename failed:', rnErr.message);
          db.run(
            `CREATE TABLE IF NOT EXISTS labour_charges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metal_type TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'Standard',
                size_label TEXT NOT NULL,
                size_value REAL,
                lc_pp_retail REAL DEFAULT 0,
                lc_pp_showroom REAL DEFAULT 0,
                lc_pp_wholesale REAL DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(metal_type, category, size_label)
            )`,
            (cErr) => {
              if (cErr) console.error('labour_charges recreate failed:', cErr.message);
              else {
                seedLabourCharges();
                db.run(`DROP TABLE IF EXISTS labour_charges_old`);
                console.log('Migrated labour_charges to new 3-tier schema');
              }
            }
          );
        });
      });
    } else {
      // Create fresh if missing
      db.run(
        `CREATE TABLE IF NOT EXISTS labour_charges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metal_type TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Standard',
            size_label TEXT NOT NULL,
            size_value REAL,
            lc_pp_retail REAL DEFAULT 0,
            lc_pp_showroom REAL DEFAULT 0,
            lc_pp_wholesale REAL DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(metal_type, category, size_label)
        )`,
        (err) => {
          if (!err) {
            db.get('SELECT COUNT(*) as count FROM labour_charges', [], (seedErr, row) => {
              if (!seedErr && row && row.count === 0) seedLabourCharges();
            });
          }
        }
      );
    }
  });

  // 10. SELLING BILLS (Selling Counter POS Bills)
  db.run(`CREATE TABLE IF NOT EXISTS selling_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no INTEGER UNIQUE NOT NULL,
      date TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT DEFAULT '',
      customer_type TEXT DEFAULT 'Retail',
      payment_mode TEXT DEFAULT 'Cash',
      cash_amount REAL DEFAULT 0,
      online_amount REAL DEFAULT 0,
      metal_payment_type TEXT DEFAULT '',
      metal_purity TEXT DEFAULT '',
      metal_weight REAL DEFAULT 0,
      metal_rate REAL DEFAULT 0,
      metal_value REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      total_lc REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      outstanding_amount REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 11. SELLING BILL ITEMS
  db.run(`CREATE TABLE IF NOT EXISTS selling_bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES selling_bills(id) ON DELETE CASCADE,
      metal_type TEXT NOT NULL,
      category TEXT NOT NULL,
      custom_label TEXT DEFAULT '',
      size REAL,
      pieces INTEGER DEFAULT 0,
      weight REAL DEFAULT 0,
      rate_per_gram REAL DEFAULT 0,
      metal_value REAL DEFAULT 0,
      lc_pp REAL DEFAULT 0,
      t_lc REAL DEFAULT 0,
      sort_order INTEGER DEFAULT 0
  )`);

  // 12. SELLING BILL METAL PAYMENTS (multi-metal payment entries per bill)
  db.run(`CREATE TABLE IF NOT EXISTS selling_bill_metal_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES selling_bills(id) ON DELETE CASCADE,
      metal_type TEXT NOT NULL,
      purity TEXT NOT NULL DEFAULT '99.99',
      weight REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      metal_value REAL DEFAULT 0
  )`);

  // 12a. CUSTOMER LEDGER (customer-wise accounting trail for counter billing)
  db.run(`CREATE TABLE IF NOT EXISTS customer_ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      entry_date TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id INTEGER,
      reference_no TEXT DEFAULT '',
      transaction_type TEXT DEFAULT '',
      payment_mode TEXT DEFAULT '',
      line_type TEXT NOT NULL,
      metal_type TEXT DEFAULT '',
      metal_purity TEXT DEFAULT '',
      reference_rate REAL DEFAULT 0,
      weight_delta REAL DEFAULT 0,
      amount_delta REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 12b. COUNTER CASH LEDGER (tracks net cash/online movement from counter bills)
  db.run(`CREATE TABLE IF NOT EXISTS counter_cash_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id INTEGER,
      reference_no TEXT DEFAULT '',
      mode TEXT NOT NULL,
      amount REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migration: add customer_type and outstanding_balance to customers table
  db.all(`PRAGMA table_info(customers)`, (err, columns) => {
    if (!err && columns) {
      if (!columns.some((c) => c.name === 'customer_type')) {
        db.run(`ALTER TABLE customers ADD COLUMN customer_type TEXT DEFAULT 'Retail'`, (e) => {
          if (e) console.error('Error adding customer_type:', e.message);
          else console.log('Added customer_type to customers');
        });
      }
      if (!columns.some((c) => c.name === 'outstanding_balance')) {
        db.run(`ALTER TABLE customers ADD COLUMN outstanding_balance REAL DEFAULT 0`, (e) => {
          if (e) console.error('Error adding outstanding_balance:', e.message);
          else console.log('Added outstanding_balance to customers');
        });
      }
    }
  });

  db.all(`PRAGMA table_info(counter_inventory)`, (err, columns) => {
    if (!err && columns) {
      if (!columns.some((c) => c.name === 'category')) {
        db.run(`ALTER TABLE counter_inventory ADD COLUMN category TEXT DEFAULT ''`, (e) => {
          if (e) console.error('Error adding category to counter_inventory:', e.message);
          else console.log('Added category to counter_inventory');
        });
      }
      if (!columns.some((c) => c.name === 'size_label')) {
        db.run(`ALTER TABLE counter_inventory ADD COLUMN size_label TEXT DEFAULT ''`, (e) => {
          if (e) console.error('Error adding size_label to counter_inventory:', e.message);
          else console.log('Added size_label to counter_inventory');
        });
      }
      if (!columns.some((c) => c.name === 'size_value')) {
        db.run(`ALTER TABLE counter_inventory ADD COLUMN size_value REAL DEFAULT 0`, (e) => {
          if (e) console.error('Error adding size_value to counter_inventory:', e.message);
          else console.log('Added size_value to counter_inventory');
        });
      }
      if (!columns.some((c) => c.name === 'reference_type')) {
        db.run(`ALTER TABLE counter_inventory ADD COLUMN reference_type TEXT DEFAULT ''`, (e) => {
          if (e) console.error('Error adding reference_type to counter_inventory:', e.message);
          else console.log('Added reference_type to counter_inventory');
        });
      }
      if (!columns.some((c) => c.name === 'reference_id')) {
        db.run(`ALTER TABLE counter_inventory ADD COLUMN reference_id INTEGER`, (e) => {
          if (e) console.error('Error adding reference_id to counter_inventory:', e.message);
          else console.log('Added reference_id to counter_inventory');
        });
      }
      if (!columns.some((c) => c.name === 'notes')) {
        db.run(`ALTER TABLE counter_inventory ADD COLUMN notes TEXT DEFAULT ''`, (e) => {
          if (e) console.error('Error adding notes to counter_inventory:', e.message);
          else console.log('Added notes to counter_inventory');
        });
      }

      db.run(
        `UPDATE counter_inventory
            SET category = CASE WHEN COALESCE(category, '') = '' THEN target_product ELSE category END,
                size_label = CASE WHEN COALESCE(size_label, '') = '' THEN target_product ELSE size_label END
          WHERE COALESCE(category, '') = '' OR COALESCE(size_label, '') = ''`,
        (e) => {
          if (e) console.error('Error backfilling counter_inventory category/size_label:', e.message);
        }
      );
    }
  });

  db.all(`PRAGMA table_info(customer_ledger_entries)`, (err, columns) => {
    if (!err && columns) {
      if (!columns.some((c) => c.name === 'transaction_type')) {
        db.run(`ALTER TABLE customer_ledger_entries ADD COLUMN transaction_type TEXT DEFAULT ''`, (e) => {
          if (e) console.error('Error adding transaction_type to customer_ledger_entries:', e.message);
          else console.log('Added transaction_type to customer_ledger_entries');
        });
      }
      if (!columns.some((c) => c.name === 'payment_mode')) {
        db.run(`ALTER TABLE customer_ledger_entries ADD COLUMN payment_mode TEXT DEFAULT ''`, (e) => {
          if (e) console.error('Error adding payment_mode to customer_ledger_entries:', e.message);
          else console.log('Added payment_mode to customer_ledger_entries');
        });
      }
      if (!columns.some((c) => c.name === 'reference_rate')) {
        db.run(`ALTER TABLE customer_ledger_entries ADD COLUMN reference_rate REAL DEFAULT 0`, (e) => {
          if (e) console.error('Error adding reference_rate to customer_ledger_entries:', e.message);
          else console.log('Added reference_rate to customer_ledger_entries');
        });
      }
    }
  });

  // Migration: add discount column to selling_bills
  db.all(`PRAGMA table_info(selling_bills)`, (err, columns) => {
    if (!err && columns && !columns.some((c) => c.name === 'discount')) {
      db.run(`ALTER TABLE selling_bills ADD COLUMN discount REAL DEFAULT 0`, (e) => {
        if (e) console.error('Error adding discount to selling_bills:', e.message);
        else console.log('Added discount to selling_bills');
      });
    }
  });

  // 13. OB LABOUR RATES (per-metal, per-size, per-customer-type rates for Order Bills)
  db.run(`CREATE TABLE IF NOT EXISTS ob_labour_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metal_type TEXT NOT NULL,
      size_label TEXT NOT NULL,
      size_value REAL,
      lc_pp_retail REAL DEFAULT 0,
      lc_pp_showroom REAL DEFAULT 0,
      lc_pp_wholesale REAL DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      UNIQUE(metal_type, size_label)
  )`, (err) => {
    if (!err) {
      db.get('SELECT COUNT(*) as count FROM ob_labour_rates', [], (seedErr, row) => {
        if (!seedErr && row && row.count === 0) {
          _seedObRates(db);
        }
      });
    }
  });

  // 14. ORDER BILLS (Estimates - keeping table name for back-compat)
  db.run(`CREATE TABLE IF NOT EXISTS order_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ob_no INTEGER UNIQUE NOT NULL,
      date TEXT NOT NULL,
      product TEXT DEFAULT '',
      products TEXT DEFAULT '["Gold 24K"]',
      customer_id INTEGER DEFAULT NULL,
      customer_name TEXT DEFAULT '',
      customer_city TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '',
      customer_type TEXT DEFAULT 'Retail',
      fine_jama REAL DEFAULT 0,
      rate_10g REAL DEFAULT 0,
      jama_gold_22k REAL DEFAULT 0,
      rate_gold_22k REAL DEFAULT 0,
      jama_silver REAL DEFAULT 0,
      rate_silver REAL DEFAULT 0,
      amt_jama REAL DEFAULT 0,
      cash_amount REAL DEFAULT 0,
      online_amount REAL DEFAULT 0,
      payment_mode TEXT DEFAULT 'Cash',
      payment_entries TEXT DEFAULT '[]',
      balance_snapshot TEXT DEFAULT '{}',
      total_pcs INTEGER DEFAULT 0,
      total_weight REAL DEFAULT 0,
      labour_total REAL DEFAULT 0,
      fine_diff REAL DEFAULT 0,
      gold_rs REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      amt_baki REAL DEFAULT 0,
      refund_due REAL DEFAULT 0,
      ofg_status TEXT DEFAULT 'OF.G HDF',
      fine_carry REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 15. ORDER BILL ITEMS (line items for each estimate)
  db.run(`CREATE TABLE IF NOT EXISTS order_bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES order_bills(id) ON DELETE CASCADE,
      metal_type TEXT DEFAULT 'Gold 24K',
      category TEXT NOT NULL DEFAULT 'Standard',
      size_label TEXT NOT NULL,
      size_value REAL DEFAULT 0,
      pcs INTEGER DEFAULT 0,
      weight REAL DEFAULT 0,
      lc_pp REAL DEFAULT 0,
      t_lc REAL DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
  )`);

  // Migration: order_bills rate_tier -> customer_type (R1->Retail, R2->Showroom, R3->Wholesale)
  //            + add 'products' column if missing (multi-metal JSON array)
  db.all(`PRAGMA table_info(order_bills)`, (err, columns) => {
    if (!err && columns) {
      const hasCustType = columns.some((c) => c.name === 'customer_type');
      const hasRateTier = columns.some((c) => c.name === 'rate_tier');
      const hasProducts = columns.some((c) => c.name === 'products');
      if (!hasCustType) {
        db.run(`ALTER TABLE order_bills ADD COLUMN customer_type TEXT DEFAULT 'Retail'`, (e) => {
          if (e) { console.error('Migration customer_type:', e.message); return; }
          if (hasRateTier) {
            db.run(`UPDATE order_bills SET customer_type =
              CASE rate_tier
                WHEN 'R1' THEN 'Retail'
                WHEN 'R2' THEN 'Showroom'
                WHEN 'R3' THEN 'Wholesale'
                ELSE 'Retail'
              END`, (ue) => {
              if (ue) console.error('Migration rate_tier values:', ue.message);
              else console.log('Migrated order_bills rate_tier -> customer_type');
            });
          }
        });
      }
      if (!hasProducts) {
        db.run(
          `ALTER TABLE order_bills ADD COLUMN products TEXT DEFAULT '["Gold 24K"]'`,
          (e) => {
            if (e) console.error('Migration products:', e.message);
            else {
              console.log('Added products column to order_bills');
              const hasProduct = columns.some((c) => c.name === 'product');
              if (hasProduct) {
                db.run(
                  `UPDATE order_bills
                     SET products = CASE
                       WHEN product IS NULL OR TRIM(product) = '' THEN '["Gold 24K"]'
                       ELSE '["' || product || '"]'
                     END
                   WHERE products IS NULL OR products = '' OR products = '["Gold 24K"]'`,
                  (ue) => {
                    if (ue) console.error('Backfill products from product:', ue.message);
                    else console.log('Backfilled products from legacy product column');
                  }
                );
              }
            }
          }
        );
      }

      const hasCustomerId   = columns.some((c) => c.name === 'customer_id');
      const hasCashAmount   = columns.some((c) => c.name === 'cash_amount');
      const hasOnlineAmount = columns.some((c) => c.name === 'online_amount');
      const hasPaymentMode  = columns.some((c) => c.name === 'payment_mode');
      const hasPaymentEntries = columns.some((c) => c.name === 'payment_entries');
      const hasBalanceSnapshot = columns.some((c) => c.name === 'balance_snapshot');
      const hasCustAddress  = columns.some((c) => c.name === 'customer_address');

      if (!hasCustomerId) {
        db.run(`ALTER TABLE order_bills ADD COLUMN customer_id INTEGER DEFAULT NULL`, (e) => {
          if (e) console.error('Migration customer_id:', e.message);
          else console.log('Added customer_id column to order_bills');
        });
      }
      if (!hasCashAmount) {
        db.run(`ALTER TABLE order_bills ADD COLUMN cash_amount REAL DEFAULT 0`, (e) => {
          if (e) return console.error('Migration cash_amount:', e.message);
          console.log('Added cash_amount column to order_bills');
          db.run(
            `UPDATE order_bills
               SET cash_amount = amt_jama
             WHERE cash_amount = 0 AND amt_jama > 0`,
            (ue) => {
              if (ue) console.error('Backfill cash_amount from amt_jama:', ue.message);
              else console.log('Backfilled cash_amount from legacy amt_jama');
            }
          );
        });
      }
      if (!hasOnlineAmount) {
        db.run(`ALTER TABLE order_bills ADD COLUMN online_amount REAL DEFAULT 0`, (e) => {
          if (e) console.error('Migration online_amount:', e.message);
          else console.log('Added online_amount column to order_bills');
        });
      }
      if (!hasPaymentMode) {
        db.run(`ALTER TABLE order_bills ADD COLUMN payment_mode TEXT DEFAULT 'Cash'`, (e) => {
          if (e) console.error('Migration payment_mode:', e.message);
          else console.log("Added payment_mode column to order_bills (default 'Cash')");
        });
      }
      if (!hasPaymentEntries) {
        db.run(`ALTER TABLE order_bills ADD COLUMN payment_entries TEXT DEFAULT '[]'`, (e) => {
          if (e) console.error('Migration payment_entries:', e.message);
          else console.log('Added payment_entries column to order_bills');
        });
      }
      if (!hasBalanceSnapshot) {
        db.run(`ALTER TABLE order_bills ADD COLUMN balance_snapshot TEXT DEFAULT '{}'`, (e) => {
          if (e) console.error('Migration balance_snapshot:', e.message);
          else console.log('Added balance_snapshot column to order_bills');
        });
      }
      if (!hasCustAddress) {
        db.run(`ALTER TABLE order_bills ADD COLUMN customer_address TEXT DEFAULT ''`, (e) => {
          if (e) console.error('Migration customer_address:', e.message);
          else console.log('Added customer_address column to order_bills');
        });
      }

      // Discount + total_amount + refund_due — added so estimates can record a
      // negotiated discount and capture any over-payment that has to be returned
      // to the customer (when cash + metal value exceeds the bill total).
      const hasDiscount    = columns.some((c) => c.name === 'discount');
      const hasTotalAmount = columns.some((c) => c.name === 'total_amount');
      const hasRefundDue   = columns.some((c) => c.name === 'refund_due');

      if (!hasDiscount) {
        db.run(`ALTER TABLE order_bills ADD COLUMN discount REAL DEFAULT 0`, (e) => {
          if (e) console.error('Migration discount:', e.message);
          else console.log('Added discount column to order_bills');
        });
      }
      if (!hasTotalAmount) {
        db.run(`ALTER TABLE order_bills ADD COLUMN total_amount REAL DEFAULT 0`, (e) => {
          if (e) return console.error('Migration total_amount:', e.message);
          console.log('Added total_amount column to order_bills');
          // Backfill: total_amount = subtotal for existing rows (no historical discount).
          db.run(
            `UPDATE order_bills
               SET total_amount = COALESCE(subtotal, 0)
             WHERE total_amount = 0 AND COALESCE(subtotal, 0) > 0`,
            (ue) => {
              if (ue) console.error('Backfill total_amount from subtotal:', ue.message);
              else console.log('Backfilled total_amount from subtotal');
            }
          );
        });
      }
      if (!hasRefundDue) {
        db.run(`ALTER TABLE order_bills ADD COLUMN refund_due REAL DEFAULT 0`, (e) => {
          if (e) console.error('Migration refund_due:', e.message);
          else console.log('Added refund_due column to order_bills');
        });
      }
    }
  });

  // Migration: add multi-metal legacy columns to order_bills (jama_gold_22k, rate_gold_22k,
  // jama_silver, rate_silver) — required by orderBillService INSERT/UPDATE statements.
  db.all(`PRAGMA table_info(order_bills)`, (err, columns) => {
    if (!err && columns) {
      const addCol = (col, def) => {
        if (!columns.some((c) => c.name === col)) {
          db.run(`ALTER TABLE order_bills ADD COLUMN ${col} ${def}`, (e) => {
            if (e) console.error(`Migration order_bills.${col}:`, e.message);
            else console.log(`Added ${col} column to order_bills`);
          });
        }
      };
      addCol('jama_gold_22k', 'REAL DEFAULT 0');
      addCol('rate_gold_22k', 'REAL DEFAULT 0');
      addCol('jama_silver',   'REAL DEFAULT 0');
      addCol('rate_silver',   'REAL DEFAULT 0');
    }
  });

  db.all(`PRAGMA table_info(order_bill_items)`, (err, columns) => {
    if (!err && columns) {
      if (!columns.some((c) => c.name === 'metal_type')) {
        db.run(`ALTER TABLE order_bill_items ADD COLUMN metal_type TEXT DEFAULT 'Gold 24K'`, (e) => {
          if (e) console.error('Migration order_bill_items.metal_type:', e.message);
          else console.log('Added metal_type column to order_bill_items');
        });
      }
      if (!columns.some((c) => c.name === 'category')) {
        db.run(`ALTER TABLE order_bill_items ADD COLUMN category TEXT NOT NULL DEFAULT 'Standard'`, (e) => {
          if (e) console.error('Migration order_bill_items.category:', e.message);
          else console.log('Added category column to order_bill_items');
        });
      }
    }
  });

  // Migration: ob_labour_rates 'Gold' -> 'Gold 24K' (idempotent)
  db.run(`UPDATE ob_labour_rates SET metal_type = 'Gold 24K' WHERE metal_type = 'Gold'`, (err) => {
    if (err && !err.message.includes('no such table'))
      console.error('Migration ob_labour_rates Gold->Gold 24K:', err.message);
  });

  // Migration: reseed if old size labels detected
  db.get(`SELECT id FROM ob_labour_rates WHERE metal_type='Gold 24K' AND size_label='0.05g'`, [], (err, row) => {
    if (err || row) return;
    console.log('Reseeding ob_labour_rates with updated size structure...');
    db.run(`DELETE FROM ob_labour_rates`, [], (delErr) => {
      if (delErr) return console.error('Failed to clear ob_labour_rates for reseed:', delErr.message);
      _seedObRates(db);
    });
  });

  // Migration: rename legacy 'Gold' metal_type to 'Gold 24K' across all tables
  // Only runs if 'Gold' rows still exist (idempotent on re-run).
  const migrateTables = [
    'stock_master', 'stock_transactions', 'melting_process',
    'rolling_processes', 'press_processes', 'tpp_processes',
    'packing_processes', 'finished_goods', 'production_jobs',
  ];
  migrateTables.forEach((tbl) => {
    db.run(`UPDATE ${tbl} SET metal_type = 'Gold 24K' WHERE metal_type = 'Gold'`, (err) => {
      if (err && !err.message.includes('no such table')) {
        console.error(`Migration Gold->Gold 24K in ${tbl}:`, err.message);
      }
    });
  });
  // Remove the old 'Gold' stock_master row if Gold 24K now exists separately
  db.run(`DELETE FROM stock_master WHERE metal_type = 'Gold' AND EXISTS (SELECT 1 FROM stock_master WHERE metal_type = 'Gold 24K')`);
});

// Helper to run multiple operations inside a SQLite transaction.
db.runTransaction = (fn) => {
  return new Promise((resolve, reject) => {
      db.run("BEGIN IMMEDIATE TRANSACTION", async (beginErr) => {
        if (beginErr) return reject(beginErr);
      try {
        const run = (sql, params = []) =>
          new Promise((res, rej) => {
            db.run(sql, params, function (err) {
              if (err) return rej(err);
              res({ lastID: this.lastID, changes: this.changes });
            });
          });
        const get = (sql, params = []) =>
          new Promise((res, rej) => {
            db.get(sql, params, (err, row) => {
              if (err) return rej(err);
              res(row);
            });
          });

        const result = await fn(run, get);
        db.run("COMMIT", (commitErr) => {
          if (commitErr) return reject(commitErr);
          resolve(result);
        });
      } catch (error) {
        db.run("ROLLBACK", () => reject(error));
      }
    });
  });
};

module.exports = db;
