
const calculateLoss = (issueWeight, returnWeight, scrapWeight) => {
  const loss = issueWeight - (returnWeight + scrapWeight);

  return parseFloat(loss.toFixed(3));
};

const roundWeight = (value, decimals = 4) => {
  const numeric = parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  return parseFloat(numeric.toFixed(decimals));
};

const parseUnitWeight = (label) => {
  if (!label) return null;
  const trimmed = String(label).trim();
  if (!trimmed || trimmed === "Mix" || trimmed === "Other") return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
};

const calculateTransferWeight = ({
  requestedPieces,
  sourcePieces,
  sourceWeight,
  fallbackUnitWeight = null,
}) => {
  const pieces = parseInt(requestedPieces, 10) || 0;
  const totalPieces = parseInt(sourcePieces, 10) || 0;
  const totalWeight = parseFloat(sourceWeight) || 0;

  if (pieces <= 0) return 0;

  if (totalPieces > 0 && totalWeight > 0) {
    return roundWeight((pieces / totalPieces) * totalWeight);
  }

  if (fallbackUnitWeight != null && Number.isFinite(fallbackUnitWeight) && fallbackUnitWeight > 0) {
    return roundWeight(pieces * fallbackUnitWeight);
  }

  return 0;
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
  calculateTransferWeight,
  formatResponse,
  createAppError,
  isValidMetalType,
  parseUnitWeight,
  roundWeight,
  sanitizePieces,
};
