const meltingService = require("../services/meltingService");
const stockService = require("../services/stockService");
const { calculateLoss, formatResponse } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES, STATUS } = require("../utils/constants");

const startMelting = async (req, res) => {
  try {
    const { metal_type, issue_weight } = req.body;
    const weight = parseFloat(issue_weight);

    if (!metal_type || isNaN(weight) || weight <= 0) {
      return formatResponse(
        res,
        400,
        false,
        "Invalid metal type or issue weight must be greater than 0.",
      );
    }

    const currentStock = await stockService.getStockByMetal(metal_type);
    if (!currentStock || currentStock.opening_stock < weight) {
      return formatResponse(res, 400, false, MESSAGES.INSUFFICIENT_STOCK);
    }


    await stockService.updateOpeningStock(metal_type, weight, false);
    const processId = await meltingService.createMeltingProcess(
      metal_type,
      weight,
    );
    await stockService.logTransaction(
      metal_type,
      TRANSACTION_TYPES.MELT_ISSUE,
      weight,
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


    const retW = parseFloat(return_weight) || 0;
    const scrW = parseFloat(scrap_weight) || 0;


    if (!process_id || retW < 0 || scrW < 0) {
      return formatResponse(
        res,
        400,
        false,
        "Weights cannot be negative numbers.",
      );
    }


    const process = await meltingService.getMeltingProcessById(process_id);
    if (!process)
      return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    if (process.status === STATUS.COMPLETED)
      return formatResponse(res, 400, false, MESSAGES.STEP_ALREADY_COMPLETED);

    const lossWeight = calculateLoss(process.issue_weight, retW, scrW);


    if (lossWeight < 0) {
      return formatResponse(
        res,
        400,
        false,
        `Validation Error: Return (${retW}) + Scrap (${scrW}) cannot exceed the Original Issue Weight (${process.issue_weight}).`,
      );
    }


    await meltingService.updateMeltingProcess(
      process_id,
      retW,
      scrW,
      lossWeight,
    );
    await stockService.updateDhalStock(process.metal_type, retW, true);

    if (scrW > 0) {
      await stockService.updateOpeningStock(process.metal_type, scrW, true);
      await stockService.logTransaction(
        process.metal_type,
        TRANSACTION_TYPES.SCRAP_RETURN,
        scrW,
        `Scrap from Melt #${process_id}`,
      );
    }

    if (lossWeight > 0) {
      await stockService.addTotalLoss(process.metal_type, lossWeight);
    }

    await stockService.logTransaction(
      process.metal_type,
      TRANSACTION_TYPES.MELT_RETURN,
      retW,
      `Dhal from Melt #${process_id}`,
    );

    return formatResponse(res, 200, true, "Melting completed successfully", {
      loss: lossWeight,
      dhal_added: retW,
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

module.exports = { startMelting, completeMelting, getRunningMelts };
