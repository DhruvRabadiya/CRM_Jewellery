const meltingService = require("../services/meltingService");
const stockService = require("../services/stockService");
const { calculateLoss, formatResponse } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES, STATUS } = require("../utils/constants");

const startMelting = async (req, res) => {
  try {
    const { metal_type, issue_weight } = req.body;

    if (!metal_type || !issue_weight || issue_weight <= 0) {
      return formatResponse(res, 400, false, MESSAGES.INVALID_INPUT);
    }

    const currentStock = await stockService.getStockByMetal(metal_type);
    if (!currentStock || currentStock.opening_stock < issue_weight) {
      return formatResponse(res, 400, false, MESSAGES.INSUFFICIENT_STOCK);
    }

    await stockService.updateOpeningStock(metal_type, issue_weight, false);

    const processId = await meltingService.createMeltingProcess(
      metal_type,
      issue_weight,
    );

    await stockService.logTransaction(
      metal_type,
      TRANSACTION_TYPES.MELT_ISSUE,
      issue_weight,
      `Issued to Melt #${processId}`,
    );

    return formatResponse(
      res,
      201,
      true,
      "Melting process started successfully",
      { processId },
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const completeMelting = async (req, res) => {
  try {
    const { process_id, return_weight, scrap_weight } = req.body;

    if (!process_id || return_weight < 0 || scrap_weight < 0) {
      return formatResponse(res, 400, false, MESSAGES.INVALID_INPUT);
    }

    const process = await meltingService.getMeltingProcessById(process_id);
    if (!process) {
      return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    }
    if (process.status === STATUS.COMPLETED) {
      return formatResponse(res, 400, false, MESSAGES.STEP_ALREADY_COMPLETED);
    }

    const lossWeight = calculateLoss(
      process.issue_weight,
      return_weight,
      scrap_weight,
    );

    await meltingService.updateMeltingProcess(
      process_id,
      return_weight,
      scrap_weight,
      lossWeight,
    );

    await stockService.updateDhalStock(process.metal_type, return_weight, true);

    if (scrap_weight > 0) {
      await stockService.updateOpeningStock(
        process.metal_type,
        scrap_weight,
        true,
      );
    }

    if (lossWeight > 0) {
      await stockService.addTotalLoss(process.metal_type, lossWeight);
    }

    await stockService.logTransaction(
      process.metal_type,
      TRANSACTION_TYPES.MELT_RETURN,
      return_weight,
      `Dhal from Melt #${process_id}`,
    );
    if (scrap_weight > 0)
      await stockService.logTransaction(
        process.metal_type,
        TRANSACTION_TYPES.SCRAP_RETURN,
        scrap_weight,
        `Scrap from Melt #${process_id}`,
      );

    return formatResponse(res, 200, true, "Melting completed successfully", {
      loss: lossWeight,
      dhal_added: return_weight,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getRunningMelts = async (req, res) => {
  try {
    const melts = await meltingService.getRunningMelts();
    return formatResponse(res, 200, true, "Running melts fetched", melts);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  startMelting,
  completeMelting,
  getRunningMelts,
};
