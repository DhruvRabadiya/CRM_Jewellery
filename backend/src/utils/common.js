
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

const isValidMetalType = (metalType) => {
  return metalType === 'Gold' || metalType === 'Silver';
};

const sanitizePieces = (value) => {
  const parsed = parseInt(value);
  if (isNaN(parsed) || parsed < 0) return 0;
  return parsed;
};

module.exports = {
  calculateLoss,
  formatResponse,
  isValidMetalType,
  sanitizePieces,
};
