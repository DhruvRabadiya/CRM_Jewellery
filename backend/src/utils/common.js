
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

const VALID_METAL_TYPES = ["Gold", "Silver"];

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
  isValidMetalType,
  sanitizePieces,
};
