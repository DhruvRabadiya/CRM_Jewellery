module.exports = {
  METAL_TYPES: {
    GOLD: "Gold",
    SILVER: "Silver",
  },
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
