const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "../jewelry.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the SQLite database.");
  }
});

db.serialize(() => {
  // 1. STOCK MASTER (Raw Material & Dhal)
  db.run(`CREATE TABLE IF NOT EXISTS stock_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metal_type TEXT UNIQUE, -- 'Gold' or 'Silver'
        opening_stock REAL DEFAULT 0, -- Raw Material (Grams for Gold, KG for Silver)
        dhal_stock REAL DEFAULT 0,    -- Pure Metal from Melting
        total_loss REAL DEFAULT 0     -- Cumulative Loss Counter
    )`);

  // Initialize default rows if they don't exist
  db.run(
    `INSERT OR IGNORE INTO stock_master (metal_type, opening_stock, dhal_stock) VALUES ('Gold', 0, 0)`,
  );
  db.run(
    `INSERT OR IGNORE INTO stock_master (metal_type, opening_stock, dhal_stock) VALUES ('Silver', 0, 0)`,
  );

  // 2. STOCK TRANSACTIONS (Ledger for Audit)
  db.run(`CREATE TABLE IF NOT EXISTS stock_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        metal_type TEXT,
        transaction_type TEXT, -- 'PURCHASE', 'MELT_ISSUE', 'SCRAP_RETURN', 'DHAL_ADD', 'JOB_ISSUE', 'JOB_RETURN'
        weight REAL,
        description TEXT
    )`);

  // 3. MELTING PROCESS (Standalone)
  db.run(`CREATE TABLE IF NOT EXISTS melting_process (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metal_type TEXT,
        issue_weight REAL,
        return_weight REAL DEFAULT 0, -- Dhal
        scrap_weight REAL DEFAULT 0,
        loss_weight REAL DEFAULT 0,
        status TEXT DEFAULT 'RUNNING', -- 'RUNNING', 'COMPLETED'
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
    )`);

  // 4. PRODUCTION JOBS (Parent Container)
  db.run(`CREATE TABLE IF NOT EXISTS production_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_number TEXT UNIQUE,
    metal_type TEXT,
    target_product TEXT,
    current_step TEXT,
    status TEXT,
    issue_weight REAL,     -- ADDED: Initial weight issued
    current_weight REAL,   -- ADDED: Weight currently available for the next step
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
)`);

  // 5. JOB STEPS (Child Processes: Rolling, Press, TPP, Packing)
  db.run(`CREATE TABLE IF NOT EXISTS job_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER,
        step_name TEXT,     -- 'Rolling', 'Press', 'TPP', 'Packing'
        issue_weight REAL,  -- Weight coming In
        return_weight REAL DEFAULT 0, -- Weight going Out
        scrap_weight REAL DEFAULT 0,
        loss_weight REAL DEFAULT 0,   -- Calculated difference
        return_pieces INTEGER DEFAULT 0, -- Created at TPP/Packing
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(job_id) REFERENCES production_jobs(id)
    )`);

  // 6. FINISHED GOODS (Final Inventory)
db.run(`CREATE TABLE IF NOT EXISTS finished_goods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metal_type TEXT,
    target_product TEXT,
    pieces INTEGER,
    weight REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
});

module.exports = db;
