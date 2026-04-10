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

  // 6. SVG INVENTORY (Sales Vault)
  db.run(`CREATE TABLE IF NOT EXISTS svg_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metal_type TEXT,
      target_product TEXT,
      pieces INTEGER,
      weight REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
