const db = require("../../config/dbConfig");

const getStockByMetal = (metalType) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM stock_master WHERE metal_type = ?`;
    db.get(query, [metalType], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const updateOpeningStock = (metalType, weight, isAddition) => {
  return new Promise((resolve, reject) => {
    const operator = isAddition ? "+" : "-";
    const query = `UPDATE stock_master SET opening_stock = opening_stock ${operator} ? WHERE metal_type = ?`;

    db.run(query, [weight, metalType], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const updateDhalStock = (metalType, weight, isAddition) => {
  return new Promise((resolve, reject) => {
    const operator = isAddition ? "+" : "-";
    const query = `UPDATE stock_master SET dhal_stock = dhal_stock ${operator} ? WHERE metal_type = ?`;

    db.run(query, [weight, metalType], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

// Reusable function to handle pooled stock updates (rolling_stock, press_stock, tpp_stock)
const updateProcessStock = (processName, metalType, weight, isAddition) => {
  return new Promise((resolve, reject) => {
    const columnName = `${processName}_stock`;

    // Whitelist check to prevent SQL injection on column name
    const validColumns = ["rolling_stock", "press_stock", "tpp_stock"];
    if (!validColumns.includes(columnName)) {
      return reject(new Error("Invalid process stock column"));
    }

    const operator = isAddition ? "+" : "-";
    const query = `UPDATE stock_master SET ${columnName} = ${columnName} ${operator} ? WHERE metal_type = ?`;

    db.run(query, [weight, metalType], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const logTransaction = (metalType, type, weight, description) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO stock_transactions (metal_type, transaction_type, weight, description) VALUES (?, ?, ?, ?)`;
    db.run(query, [metalType, type, weight, description], function (err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
};

const addTotalLoss = (metalType, lossWeight) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE stock_master SET total_loss = MAX(total_loss + ?, 0) WHERE metal_type = ?`;
    db.run(query, [lossWeight, metalType], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const getLossStats = () => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 'Melting' as source, metal_type, loss_weight, completed_at as date FROM melting_process WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT 'Rolling' as source, metal_type, loss_weight, end_time as date FROM rolling_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT 'Press' as source, metal_type, loss_weight, end_time as date FROM press_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT 'TPP' as source, metal_type, loss_weight, end_time as date FROM tpp_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT 'Packing' as source, metal_type, loss_weight, end_time as date FROM packing_processes WHERE status = 'COMPLETED' AND loss_weight != 0
    `;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

const getPurchases = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM stock_transactions WHERE transaction_type = 'PURCHASE' ORDER BY date DESC`;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

const getDhalPurchases = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM stock_transactions WHERE transaction_type = 'DHAL_ADDITION' ORDER BY date DESC`;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

const getPurchaseById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM stock_transactions WHERE id = ?`;
    db.get(query, [id], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const editPurchase = (id, weight, description) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE stock_transactions SET weight = ?, description = ? WHERE id = ?`;
    db.run(query, [weight, description, id], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const deletePurchase = (id) => {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM stock_transactions WHERE id = ?`;
    db.run(query, [id], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

// Helper: run a query that returns a single numeric value
const querySum = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.total : 0);
    });
  });
};

// Helper: check if a table exists in the database
const tableExists = (tableName) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName],
      (err, row) => {
        if (err) return reject(err);
        resolve(!!row);
      },
    );
  });
};

/**
 * Recalculates all stock_master values from source-of-truth process tables
 * and stock_transactions. This fixes any drift caused by partial failures,
 * old legacy job data, or accumulated floating-point errors.
 */
const recalculateStock = async (metalType) => {
  const hasProductionJobs = await tableExists("production_jobs");
  const hasJobSteps = await tableExists("job_steps");

  // --- OPENING STOCK ---
  // Sum of all purchases
  const totalPurchases = await querySum(
    "SELECT COALESCE(SUM(weight), 0) as total FROM stock_transactions WHERE metal_type = ? AND transaction_type = 'PURCHASE'",
    [metalType],
  );

  // Melting issue_weight is deducted from opening_stock on creation (all statuses)
  const meltingIssued = await querySum(
    "SELECT COALESCE(SUM(issue_weight), 0) as total FROM melting_process WHERE metal_type = ?",
    [metalType],
  );

  // Scrap from all COMPLETED processes is returned to opening_stock
  const scrapReturned = await querySum(
    `SELECT COALESCE(SUM(s), 0) as total FROM (
      SELECT COALESCE(SUM(scrap_weight), 0) as s FROM melting_process WHERE metal_type = ? AND status = 'COMPLETED'
      UNION ALL
      SELECT COALESCE(SUM(scrap_weight), 0) FROM rolling_processes WHERE metal_type = ? AND status = 'COMPLETED'
      UNION ALL
      SELECT COALESCE(SUM(scrap_weight), 0) FROM press_processes WHERE metal_type = ? AND status = 'COMPLETED'
      UNION ALL
      SELECT COALESCE(SUM(scrap_weight), 0) FROM tpp_processes WHERE metal_type = ? AND status = 'COMPLETED'
      UNION ALL
      SELECT COALESCE(SUM(scrap_weight), 0) FROM packing_processes WHERE metal_type = ? AND status = 'COMPLETED'
    )`,
    [metalType, metalType, metalType, metalType, metalType],
  );

  // Old production_jobs scrap returns (if tables exist)
  let oldJobScrap = 0;
  if (hasProductionJobs && hasJobSteps) {
    oldJobScrap = await querySum(
      `SELECT COALESCE(SUM(js.scrap_weight), 0) as total
       FROM job_steps js
       JOIN production_jobs pj ON js.job_id = pj.id
       WHERE pj.metal_type = ?`,
      [metalType],
    );
  }

  const openingStock = totalPurchases - meltingIssued + scrapReturned + oldJobScrap;

  // --- DHAL STOCK ---
  const dhalAdditions = await querySum(
    "SELECT COALESCE(SUM(weight), 0) as total FROM stock_transactions WHERE metal_type = ? AND transaction_type = 'DHAL_ADDITION'",
    [metalType],
  );

  // Completed melting returns go to dhal_stock
  const meltingReturns = await querySum(
    "SELECT COALESCE(SUM(return_weight), 0) as total FROM melting_process WHERE metal_type = ? AND status = 'COMPLETED'",
    [metalType],
  );

  // Rolling consumes from dhal_stock:
  // PENDING: issue_size deducted; RUNNING/COMPLETED: issued_weight deducted (after delta adjustments)
  const rollingConsumed = await querySum(
    `SELECT COALESCE(SUM(
      CASE WHEN status = 'PENDING' THEN issue_size
           ELSE COALESCE(NULLIF(issued_weight, 0), issue_size)
      END
    ), 0) as total FROM rolling_processes WHERE metal_type = ?`,
    [metalType],
  );

  // Old production_jobs consumed from dhal_stock
  let oldJobDhal = 0;
  if (hasProductionJobs) {
    oldJobDhal = await querySum(
      "SELECT COALESCE(SUM(issue_weight), 0) as total FROM production_jobs WHERE metal_type = ?",
      [metalType],
    );
  }

  const dhalStock = dhalAdditions + meltingReturns - rollingConsumed - oldJobDhal;

  // --- ROLLING STOCK ---
  const rollingReturns = await querySum(
    "SELECT COALESCE(SUM(return_weight), 0) as total FROM rolling_processes WHERE metal_type = ? AND status = 'COMPLETED'",
    [metalType],
  );

  const pressConsumed = await querySum(
    `SELECT COALESCE(SUM(
      CASE WHEN status = 'PENDING' THEN issue_size
           ELSE COALESCE(NULLIF(issued_weight, 0), issue_size)
      END
    ), 0) as total FROM press_processes WHERE metal_type = ?`,
    [metalType],
  );

  const rollingStock = rollingReturns - pressConsumed;

  // --- PRESS STOCK ---
  const pressReturns = await querySum(
    "SELECT COALESCE(SUM(return_weight), 0) as total FROM press_processes WHERE metal_type = ? AND status = 'COMPLETED'",
    [metalType],
  );

  const tppConsumed = await querySum(
    `SELECT COALESCE(SUM(
      CASE WHEN status = 'PENDING' THEN issue_size
           ELSE COALESCE(NULLIF(issued_weight, 0), issue_size)
      END
    ), 0) as total FROM tpp_processes WHERE metal_type = ?`,
    [metalType],
  );

  const pressStock = pressReturns - tppConsumed;

  // --- TPP STOCK ---
  const tppReturns = await querySum(
    "SELECT COALESCE(SUM(return_weight), 0) as total FROM tpp_processes WHERE metal_type = ? AND status = 'COMPLETED'",
    [metalType],
  );

  const packingConsumed = await querySum(
    `SELECT COALESCE(SUM(
      CASE WHEN status = 'PENDING' THEN issue_size
           ELSE COALESCE(NULLIF(issued_weight, 0), issue_size)
      END
    ), 0) as total FROM packing_processes WHERE metal_type = ?`,
    [metalType],
  );

  const tppStock = tppReturns - packingConsumed;

  // --- TOTAL LOSS ---
  const processLoss = await querySum(
    `SELECT COALESCE(SUM(l), 0) as total FROM (
      SELECT COALESCE(SUM(loss_weight), 0) as l FROM melting_process WHERE metal_type = ? AND status = 'COMPLETED'
      UNION ALL
      SELECT COALESCE(SUM(loss_weight), 0) FROM rolling_processes WHERE metal_type = ? AND status = 'COMPLETED'
      UNION ALL
      SELECT COALESCE(SUM(loss_weight), 0) FROM press_processes WHERE metal_type = ? AND status = 'COMPLETED'
      UNION ALL
      SELECT COALESCE(SUM(loss_weight), 0) FROM tpp_processes WHERE metal_type = ? AND status = 'COMPLETED'
      UNION ALL
      SELECT COALESCE(SUM(loss_weight), 0) FROM packing_processes WHERE metal_type = ? AND status = 'COMPLETED'
    )`,
    [metalType, metalType, metalType, metalType, metalType],
  );

  let oldJobLoss = 0;
  if (hasProductionJobs && hasJobSteps) {
    oldJobLoss = await querySum(
      `SELECT COALESCE(SUM(js.loss_weight), 0) as total
       FROM job_steps js
       JOIN production_jobs pj ON js.job_id = pj.id
       WHERE pj.metal_type = ?`,
      [metalType],
    );
  }

  const totalLoss = Math.max(processLoss + oldJobLoss, 0);

  // Update stock_master with recalculated values
  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE stock_master SET
        opening_stock = ?, dhal_stock = ?, rolling_stock = ?,
        press_stock = ?, tpp_stock = ?, total_loss = ?
       WHERE metal_type = ?`,
      [openingStock, dhalStock, rollingStock, pressStock, tppStock, totalLoss, metalType],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      },
    );
  });

  return {
    metal_type: metalType,
    opening_stock: openingStock,
    dhal_stock: dhalStock,
    rolling_stock: rollingStock,
    press_stock: pressStock,
    tpp_stock: tppStock,
    total_loss: totalLoss,
  };
};

const getDetailedScrapAndLoss = () => {
  return new Promise((resolve, reject) => {
    // Instead of immutable transaction logs, query the source of truth directly so edits sync retroactively.
    const query = `
      -- Scrap Returns
      SELECT completed_at as date, metal_type, 'SCRAP' as category, 'Scrap from Melting #' || id as source, scrap_weight as weight FROM melting_process WHERE status = 'COMPLETED' AND scrap_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'SCRAP' as category, 'Scrap from Rolling ' || job_number as source, scrap_weight as weight FROM rolling_processes WHERE status = 'COMPLETED' AND scrap_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'SCRAP' as category, 'Scrap from Press ' || job_number as source, scrap_weight as weight FROM press_processes WHERE status = 'COMPLETED' AND scrap_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'SCRAP' as category, 'Scrap from TPP ' || job_number as source, scrap_weight as weight FROM tpp_processes WHERE status = 'COMPLETED' AND scrap_weight > 0
      UNION ALL
      SELECT end_time as date, metal_type, 'SCRAP' as category, 'Scrap from Packing ' || job_number as source, scrap_weight as weight FROM packing_processes WHERE status = 'COMPLETED' AND scrap_weight > 0
      
      UNION ALL
      
      -- Losses & Gains
      SELECT completed_at as date, metal_type, CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END as category, CASE WHEN loss_weight < 0 THEN 'Gain from Melting #' ELSE 'Loss from Melting #' END || id as source, loss_weight as weight FROM melting_process WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT end_time as date, metal_type, CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END as category, CASE WHEN loss_weight < 0 THEN 'Gain from Rolling ' ELSE 'Loss from Rolling ' END || job_number as source, loss_weight as weight FROM rolling_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT end_time as date, metal_type, CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END as category, CASE WHEN loss_weight < 0 THEN 'Gain from Press ' ELSE 'Loss from Press ' END || job_number as source, loss_weight as weight FROM press_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT end_time as date, metal_type, CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END as category, CASE WHEN loss_weight < 0 THEN 'Gain from TPP ' ELSE 'Loss from TPP ' END || job_number as source, loss_weight as weight FROM tpp_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      UNION ALL
      SELECT end_time as date, metal_type, CASE WHEN loss_weight < 0 THEN 'GAIN' ELSE 'LOSS' END as category, CASE WHEN loss_weight < 0 THEN 'Gain from Packing ' ELSE 'Loss from Packing ' END || job_number as source, loss_weight as weight FROM packing_processes WHERE status = 'COMPLETED' AND loss_weight != 0
      
      ORDER BY date DESC
    `;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

module.exports = {
  getStockByMetal,
  updateOpeningStock,
  updateDhalStock,
  updateProcessStock,
  logTransaction,
  addTotalLoss,
  getLossStats,
  getPurchases,
  getDhalPurchases,
  getPurchaseById,
  editPurchase,
  deletePurchase,
  getDetailedScrapAndLoss,
  recalculateStock,
};
