const svc = require("../services/sellingDashboardService");
const { formatResponse } = require("../utils/common");

const getDashboard = async (req, res) => {
  try {
    const data = await svc.getDashboard();
    return formatResponse(res, 200, true, "Selling dashboard fetched", data);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = { getDashboard };
