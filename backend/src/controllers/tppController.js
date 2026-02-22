const tppService = require("../services/tppService");
const stockService = require("../services/stockService");
const { calculateLoss, formatResponse } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES, STATUS } = require("../utils/constants");

const createTpp = async (req, res) => {
  try {
    const {
      job_number,
      job_name,
      metal_type,
      unit,
      employee,
      issue_size,
      category,
    } = req.body;
    const weight = parseFloat(issue_size);

    if (!job_number || isNaN(weight) || weight <= 0) {
      return formatResponse(
        res,
        400,
        false,
        "Invalid input. Issue size must be greater than 0.",
      );
    }

    const currentStock = await stockService.getStockByMetal(metal_type);
    if (
      !currentStock ||
      Math.round(currentStock.press_stock * 1000) < Math.round(weight * 1000)
    ) {
      return formatResponse(
        res,
        400,
        false,
        "Insufficient pooled Press Stock available to queue this job.",
      );
    }

    const processId = await tppService.createTppProcess(
      job_number,
      job_name,
      metal_type,
      unit,
      employee,
      weight,
      category,
    );

    return formatResponse(res, 201, true, "TPP process created", { processId });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const startTpp = async (req, res) => {
  try {
    const { process_id, issued_weight } = req.body;
    const weight = parseFloat(issued_weight);
    if (!process_id || isNaN(weight) || weight <= 0)
      return formatResponse(res, 400, false, "Invalid issued weight.");

    const process = await tppService.getTppProcessById(process_id);
    if (!process) {
      return formatResponse(res, 404, false, "Process not found.");
    }

    const currentStock = await stockService.getStockByMetal(process.metal_type);
    if (
      !currentStock ||
      Math.round(currentStock.press_stock * 1000) < Math.round(weight * 1000)
    ) {
      return formatResponse(
        res,
        400,
        false,
        "Insufficient pooled Press Stock available.",
      );
    }

    await stockService.updateProcessStock(
      "press",
      process.metal_type,
      weight,
      false,
    );
    await stockService.logTransaction(
      process.metal_type,
      TRANSACTION_TYPES.JOB_ISSUE,
      weight,
      `Issued to TPP Job ${process.job_number}`,
    );

    await tppService.startTppProcess(process_id, weight);
    return formatResponse(res, 200, true, "TPP process started");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const completeTpp = async (req, res) => {
  try {
    const { process_id, return_weight, scrap_weight } = req.body;
    const retW = parseFloat(return_weight) || 0;
    const scrW = parseFloat(scrap_weight) || 0;

    if (!process_id || retW < 0 || scrW < 0)
      return formatResponse(res, 400, false, "Invalid weights.");

    const process = await tppService.getTppProcessById(process_id);
    if (!process)
      return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    if (process.status === STATUS.COMPLETED)
      return formatResponse(res, 400, false, "Process already completed.");

    const issW = process.issued_weight;
    const lossWeight = calculateLoss(issW, retW, scrW);
    if (lossWeight < 0)
      return formatResponse(
        res,
        400,
        false,
        `Return + Scrap cannot exceed Issued Weight (${issW}).`,
      );

    await tppService.completeTppProcess(process_id, retW, scrW, lossWeight);
    await stockService.updateProcessStock(
      "tpp",
      process.metal_type,
      retW,
      true,
    );

    if (scrW > 0) {
      await stockService.updateOpeningStock(process.metal_type, scrW, true);
      await stockService.logTransaction(
        process.metal_type,
        TRANSACTION_TYPES.SCRAP_RETURN,
        scrW,
        `Scrap from TPP ${process.job_number}`,
      );
    }

    if (lossWeight > 0)
      await stockService.addTotalLoss(process.metal_type, lossWeight);

    return formatResponse(res, 200, true, "TPP completed", {
      loss: lossWeight,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getAllTpp = async (req, res) => {
  try {
    const processes = await tppService.getAllTppProcesses();
    return formatResponse(res, 200, true, "TPP processes fetched", processes);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = { createTpp, startTpp, completeTpp, getAllTpp };
