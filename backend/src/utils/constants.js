module.exports = {
  METAL_TYPES: {
    GOLD_22K: "Gold 22K",
    GOLD_24K: "Gold 24K",
    SILVER: "Silver",
  },
  METAL_ORDER: ["Gold 24K", "Silver", "Gold 22K"],
  STATUS: {
    PENDING: "PENDING",
    RUNNING: "RUNNING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
  },
  TRANSACTION_TYPES: {
    PURCHASE: "PURCHASE",
    MELT_ISSUE: "MELT_ISSUE",
    MELT_RETURN: "MELT_RETURN",
    JOB_ISSUE: "JOB_ISSUE",
    JOB_RETURN: "JOB_RETURN",
    SCRAP_RETURN: "SCRAP_RETURN",
  },
  MESSAGES: {
    INSUFFICIENT_STOCK: "Insufficient Opening Stock available.",
    JOB_NOT_FOUND: "Job not found.",
    STEP_ALREADY_COMPLETED: "This step is already completed.",
    INVALID_INPUT: "Invalid input data provided.",
  },
};

// ─── Bill/Estimate workflow statuses ─────────────────────────────────────────
// Single source of truth for all bill status behaviour.
//
//  Pending   — awaiting production; stock ops are SKIPPED
//  Ready     — items in stock; full stock reservation + validation applies
//  Delivered — transaction complete; same stock behaviour as Ready
//
// Future statuses (e.g. Cancelled, In Production, Partial Delivery) can be
// added here without touching business-logic code — just update STOCK_INACTIVE_STATUSES.

const BILL_STATUSES = {
  PENDING:   'Pending',
  READY:     'Ready',
  DELIVERED: 'Delivered',
};

const BILL_STATUS_LIST = ['Pending', 'Ready', 'Delivered'];

// Statuses where counter-stock should NOT be reserved or validated.
const BILL_STATUS_NO_STOCK = ['Pending'];

const isBillStockActive = (status) =>
  !BILL_STATUS_NO_STOCK.includes(status || BILL_STATUSES.READY);

module.exports = {
  ...module.exports,
  BILL_STATUSES,
  BILL_STATUS_LIST,
  BILL_STATUS_NO_STOCK,
  isBillStockActive,
};
