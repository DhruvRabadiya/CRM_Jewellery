const jobService = require("../services/jobService");
const meltingService = require("../services/meltingService");
const rollingService = require("../services/rollingService");
const pressService = require("../services/pressService");
const tppService = require("../services/tppService");
const packingService = require("../services/packingService");
const { formatResponse } = require("../utils/common");

// Get Next Serial Job ID
const getNextJobId = async (req, res) => {
  try {
    const nextJobNumber = await jobService.getNextJobNumber();
    return formatResponse(res, 200, true, "Next job ID generated", {
      next_job_number: nextJobNumber,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};
const getFinishedGoods = async (req, res) => {
  try {
    const inventory = await jobService.getFinishedGoodsInventory();
    return formatResponse(res, 200, true, "Finished goods fetched", inventory);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};
const getCombinedProcesses = async (req, res) => {
  try {
    const melting = await meltingService.getAllMeltingProcesses();
    const rolling = await rollingService.getAllRollingProcesses();
    const press = await pressService.getAllPressProcesses();
    const tpp = await tppService.getAllTppProcesses();
    const packing = await packingService.getAllPackingProcesses();

    const addStage = (arr, stageName) =>
      arr.map((item) => ({ ...item, stage: stageName }));

    const combined = [
      ...addStage(melting, "Melting"),
      ...addStage(rolling, "Rolling"),
      ...addStage(press, "Press"),
      ...addStage(tpp, "TPP"),
      ...addStage(packing, "Packing"),
    ];

    // Sort descending by date; melting uses created_at while production processes use date
    combined.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

    return formatResponse(res, 200, true, "Combined processes fetched", combined);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getNextJobId,
  getFinishedGoods,
  getCombinedProcesses,
};
