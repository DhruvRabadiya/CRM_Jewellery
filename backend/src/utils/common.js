
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

module.exports = {
  calculateLoss,
  formatResponse,
};
