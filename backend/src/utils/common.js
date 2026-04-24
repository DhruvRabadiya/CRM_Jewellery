
const calculateLoss = (issueWeight, returnWeight, scrapWeight) => {
  const loss = issueWeight - (returnWeight + scrapWeight);

  return parseFloat(loss.toFixed(3));
};


const formatResponse = (res, statusCode, success, message, data = null) => {
  return res.status(statusCode).json({
    success,
    message,
    data,
  });
};

const createAppError = (message, statusCode = 400, code = "APP_ERROR", details = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details != null) error.details = details;
  return error;
};

const VALID_METAL_TYPES = ["Gold 24K", "Silver", "Gold 22K"];

const isValidMetalType = (metalType) => {
  return VALID_METAL_TYPES.includes(metalType);
};

// Clamp pieces to a non-negative integer (handles negative input and NaN)
const sanitizePieces = (value) => {
  const parsed = parseInt(value) || 0;
  return Math.max(parsed, 0);
};

module.exports = {
  calculateLoss,
  formatResponse,
  createAppError,
  isValidMetalType,
  sanitizePieces,
};
