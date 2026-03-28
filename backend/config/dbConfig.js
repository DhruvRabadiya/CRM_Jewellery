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
  // 1. STOCK MASTER (Raw Material, Dhal, and Pooled Stages)
  db.run(`CREATE TABLE IF NOT EXISTS stock_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metal_type TEXT UNIQUE, -- 'Gold' or 'Silver'
        opening_stock REAL DEFAULT 0, -- Raw Material
        dhal_stock REAL DEFAULT 0,    -- Pure metal (Source for Rolling)
        rolling_stock REAL DEFAULT 0, -- Completed Rolling (Source for Press)
        press_stock REAL DEFAULT 0,   -- Completed Press (Source for TPP)
        tpp_stock REAL DEFAULT 0,     -- Completed TPP (Source for Packing)
        total_loss REAL DEFAULT 0     -- Cumulative Loss
    )`);

  // Initialize default rows if they don't exist
  // By using INSERT OR IGNORE, if rows already exist they aren't overridden,
  // but if we modified the table we might need to add columns safely in real prod,
  // here since SQLite IF NOT EXISTS is on create table, it won't add new columns to existing tables automatically.
  // For simplicity, we assume we might drop/recreate db locally or alter table manually if needed,
  // but let's at least keep the insert valid.
  db.run(
    `INSERT OR IGNORE INTO stock_master (metal_type, opening_stock, dhal_stock, rolling_stock, press_stock, tpp_stock) VALUES ('Gold', 0, 0, 0, 0, 0)`,
  );
  db.run(
    `INSERT OR IGNORE INTO stock_master (metal_type, opening_stock, dhal_stock, rolling_stock, press_stock, tpp_stock) VALUES ('Silver', 0, 0, 0, 0, 0)`,
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

  // 5. FINISHED GOODS (Final Inventory)
  db.run(`CREATE TABLE IF NOT EXISTS finished_goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metal_type TEXT,
      target_product TEXT,
      pieces INTEGER,
      weight REAL,
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
                     const salt = await bcrypt.genSalt(10);
                     const hashed = await bcrypt.hash("admin123", salt);
                     
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
});

module.exports = db;
