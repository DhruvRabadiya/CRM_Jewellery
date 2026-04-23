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

// ─── OB Labour Rates seed helper (matches screenshot data) ───────────────────
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

db.serialize(() => {
  // 1. STOCK MASTER (Raw Material and Pooled Stages)
  db.run(`CREATE TABLE IF NOT EXISTS stock_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metal_type TEXT UNIQUE, -- 'Gold' or 'Silver'
        opening_stock REAL DEFAULT 0, -- Raw Material
        rolling_stock REAL DEFAULT 0, -- Completed Rolling (Source for Press)
        press_stock REAL DEFAULT 0,   -- Completed Press (Source for TPP)
        tpp_stock REAL DEFAULT 0,     -- Completed TPP (Source for Packing)
        total_loss REAL DEFAULT 0     -- Cumulative Loss
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
        description TEXT
    )`);

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

  // 5b. PRODUCTION JOBS (Legacy job tracking system)
  db.run(`CREATE TABLE IF NOT EXISTS production_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_number TEXT UNIQUE,
      metal_type TEXT,
      target_product TEXT,
      current_step TEXT,
      status TEXT DEFAULT 'PENDING',
      issue_weight REAL,
      current_weight REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 5c. JOB STEPS (Legacy step logging)
  db.run(`CREATE TABLE IF NOT EXISTS job_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      step_name TEXT,
      issue_weight REAL,
      return_weight REAL,
      scrap_weight REAL,
      loss_weight REAL,
      return_pieces INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 6a. COUNTER INVENTORY (Selling Counter)
  db.run(`CREATE TABLE IF NOT EXISTS counter_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metal_type TEXT,
      target_product TEXT,
      pieces INTEGER,
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
  )`);

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
      line_type TEXT NOT NULL,
      metal_type TEXT DEFAULT '',
      metal_purity TEXT DEFAULT '',
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

  // 14. ORDER BILLS (OB — Order Book bills from Selling Counter)
  db.run(`CREATE TABLE IF NOT EXISTS order_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ob_no INTEGER UNIQUE NOT NULL,
      date TEXT NOT NULL,
      product TEXT DEFAULT '',
      products TEXT DEFAULT '["Gold 24K"]',
      customer_id INTEGER DEFAULT NULL,
      customer_name TEXT DEFAULT '',
      customer_city TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '',
      customer_type TEXT DEFAULT 'Retail',
      fine_jama REAL DEFAULT 0,
      rate_10g REAL DEFAULT 0,
      amt_jama REAL DEFAULT 0,
      cash_amount REAL DEFAULT 0,
      online_amount REAL DEFAULT 0,
      payment_mode TEXT DEFAULT 'Cash',
      total_pcs INTEGER DEFAULT 0,
      total_weight REAL DEFAULT 0,
      labour_total REAL DEFAULT 0,
      fine_diff REAL DEFAULT 0,
      gold_rs REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      amt_baki REAL DEFAULT 0,
      ofg_status TEXT DEFAULT 'OF.G HDF',
      fine_carry REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 15. ORDER BILL ITEMS (line items for each OB bill)
  db.run(`CREATE TABLE IF NOT EXISTS order_bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES order_bills(id) ON DELETE CASCADE,
      metal_type TEXT DEFAULT 'Gold 24K',
      size_label TEXT NOT NULL,
      size_value REAL DEFAULT 0,
      pcs INTEGER DEFAULT 0,
      weight REAL DEFAULT 0,
      lc_pp REAL DEFAULT 0,
      t_lc REAL DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
  )`);

  // Migration: order_bills rate_tier → customer_type (R1→Retail, R2→Showroom, R3→Wholesale)
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
              else console.log('Migrated order_bills rate_tier → customer_type');
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
              // Backfill existing rows from legacy single `product` column when present
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

      // Phase 1 (selling-counter-billing-ledger): add customer FK + payment split columns.
      // All additive & nullable with safe defaults so existing bills continue to read.
      const hasCustomerId   = columns.some((c) => c.name === 'customer_id');
      const hasCashAmount   = columns.some((c) => c.name === 'cash_amount');
      const hasOnlineAmount = columns.some((c) => c.name === 'online_amount');
      const hasPaymentMode  = columns.some((c) => c.name === 'payment_mode');

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
          // Backfill: treat legacy amt_jama as cash. Only touch rows still at zero
          // so this is idempotent if run after partial data entry.
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
    }
  });

  // Migration: ob_labour_rates 'Gold' → 'Gold 24K' (idempotent)
  db.run(`UPDATE ob_labour_rates SET metal_type = 'Gold 24K' WHERE metal_type = 'Gold'`, (err) => {
    if (err && !err.message.includes('no such table'))
      console.error('Migration ob_labour_rates Gold→Gold 24K:', err.message);
  });

  // Migration: reseed if old size labels detected (e.g., '0.10g' or '2.5g' present)
  // or if Gold 22K is missing entirely. Ensures screenshot-exact initial data.
  db.get(`SELECT id FROM ob_labour_rates WHERE metal_type='Gold 24K' AND size_label='0.05g'`, [], (err, row) => {
    if (err || row) return; // already on new structure, or table error
    console.log('Reseeding ob_labour_rates with updated size structure...');
    db.run(`DELETE FROM ob_labour_rates`, [], (delErr) => {
      if (delErr) return console.error('Failed to clear ob_labour_rates for reseed:', delErr.message);
      _seedObRates(db);
    });
  });

  // Migration: rename legacy 'Gold' metal_type to 'Gold 24K' across all tables
  // Only runs if 'Gold' rows still exist (idempotent on re-run).
  // Placed after all CREATE TABLE statements so tables exist.
  const migrateTables = [
    'stock_master', 'stock_transactions', 'melting_process',
    'rolling_processes', 'press_processes', 'tpp_processes',
    'packing_processes', 'finished_goods', 'production_jobs',
  ];
  migrateTables.forEach((tbl) => {
    db.run(`UPDATE ${tbl} SET metal_type = 'Gold 24K' WHERE metal_type = 'Gold'`, (err) => {
      // Silently ignore errors (table may not exist on fresh DB)
      if (err && !err.message.includes('no such table')) {
        console.error(`Migration Gold->Gold 24K in ${tbl}:`, err.message);
      }
    });
  });
  // Remove the old 'Gold' stock_master row if Gold 24K now exists separately
  db.run(`DELETE FROM stock_master WHERE metal_type = 'Gold' AND EXISTS (SELECT 1 FROM stock_master WHERE metal_type = 'Gold 24K')`);
});

// Helper to run multiple operations inside a SQLite transaction.
// Usage: await runTransaction(async (run, get) => { ... });
// `run` and `get` are promisified wrappers around db.run/db.get that execute
// within the same BEGIN/COMMIT/ROLLBACK block.
db.runTransaction = (fn) => {
  return new Promise((resolve, reject) => {
    db.run("BEGIN TRANSACTION", async (beginErr) => {
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
