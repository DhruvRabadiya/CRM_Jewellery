const rollingService = require("../services/rollingService");
const stockService = require("../services/stockService");
const { calculateLoss, formatResponse } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES, STATUS } = require("../utils/constants");

const createRolling = async (req, res) => {
  try {
    const {
      job_number,
      job_name,
      metal_type,
      unit,
      employee,
      issue_size,
      issue_pieces,
      category,
    } = req.body;
    const weight = parseFloat(issue_size);
    const pieces = parseInt(issue_pieces) || 0;

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
      Math.round(currentStock.dhal_stock * 1000) < Math.round(weight * 1000)
    ) {
      return formatResponse(
        res,
        400,
        false,
        "Insufficient Dhal Stock available to queue this job.",
      );
    }

    const processId = await rollingService.createRollingProcess(
      job_number,
      job_name,
      metal_type,
      unit,
      employee,
      weight,
      pieces,
      category,
    );

    // DEDUCT IMMEDIATELY UPON CREATION
    await stockService.updateDhalStock(metal_type, weight, false);
    await stockService.logTransaction(
      metal_type,
      TRANSACTION_TYPES.JOB_ISSUE,
      weight,
      `Queued Rolling Job ${job_number}`,
    );

    return formatResponse(res, 201, true, "Rolling process queued", {
      processId,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const startRolling = async (req, res) => {
  try {
    const { process_id, issued_weight, issue_pieces } = req.body;
    const weight = parseFloat(issued_weight);
    const pieces = parseInt(issue_pieces) || 0;
    if (!process_id || isNaN(weight) || weight <= 0) {
      return formatResponse(res, 400, false, "Invalid issued weight.");
    }

    const process = await rollingService.getRollingProcessById(process_id);
    if (!process) {
      return formatResponse(res, 404, false, "Process not found.");
    }

    const delta = weight - process.issue_size;

    if (delta > 0) {
      const currentStock = await stockService.getStockByMetal(
        process.metal_type,
      );
      if (
        !currentStock ||
        Math.round(currentStock.dhal_stock * 1000) < Math.round(delta * 1000)
      ) {
        return formatResponse(
          res,
          400,
          false,
          "Insufficient Dhal Stock to increase weight.",
        );
      }
      await stockService.updateDhalStock(process.metal_type, delta, false);
      await stockService.logTransaction(
        process.metal_type,
        "ADJUSTMENT",
        delta,
        `Start delta adjustment (added) for Rolling Job ${process.job_number}`,
      );
    } else if (delta < 0) {
      await stockService.updateDhalStock(
        process.metal_type,
        Math.abs(delta),
        true,
      );
      await stockService.logTransaction(
        process.metal_type,
        "ADJUSTMENT",
        Math.abs(delta),
        `Start delta adjustment (refunded) for Rolling Job ${process.job_number}`,
      );
    }

    await rollingService.startRollingProcess(process_id, weight, pieces);
    return formatResponse(res, 200, true, "Rolling process started");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const completeRolling = async (req, res) => {
  try {
    const { process_id, return_weight, return_pieces, scrap_weight } = req.body;
    const retW = parseFloat(return_weight) || 0;
    const retP = parseInt(return_pieces) || 0;
    const scrW = parseFloat(scrap_weight) || 0;

    if (!process_id || retW < 0 || scrW < 0) {
      return formatResponse(res, 400, false, "Invalid weights.");
    }

    const process = await rollingService.getRollingProcessById(process_id);
    if (!process)
      return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    if (process.status === STATUS.COMPLETED) {
      return formatResponse(res, 400, false, "Process already completed.");
    }

    const issW = process.issued_weight;
    const lossWeight = calculateLoss(issW, retW, scrW);

    if (lossWeight < 0) {
      return formatResponse(
        res,
        400,
        false,
        `Return + Scrap cannot exceed Issued Weight (${issW}).`,
      );
    }

    await rollingService.completeRollingProcess(
      process_id,
      retW,
      scrW,
      lossWeight,
    );

    // Add pure metal back to pooled rolling_stock
    await stockService.updateProcessStock(
      "rolling",
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
        `Scrap from Rolling ${process.job_number}`,
      );
    }

    if (lossWeight > 0) {
      await stockService.addTotalLoss(process.metal_type, lossWeight);
    }

    return formatResponse(res, 200, true, "Rolling completed", {
      loss: lossWeight,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getAllRolling = async (req, res) => {
  try {
    const processes = await rollingService.getAllRollingProcesses();
    return formatResponse(
      res,
      200,
      true,
      "Rolling processes fetched",
      processes,
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const editRolling = async (req, res) => {
  try {
    const process_id = req.params.id;
    const { issued_weight } = req.body;
    const newWeight = parseFloat(issued_weight);

    if (!process_id || isNaN(newWeight) || newWeight <= 0) {
      return formatResponse(res, 400, false, "Invalid issued weight.");
    }

    const process = await rollingService.getRollingProcessById(process_id);
    if (!process) return formatResponse(res, 404, false, "Process not found.");
    if (process.status !== "RUNNING") {
      return formatResponse(
        res,
        400,
        false,
        "Only RUNNING processes can be edited.",
      );
    }

    const oldWeight = process.issued_weight;
    const delta = newWeight - oldWeight;

    if (delta > 0) {
      const currentStock = await stockService.getStockByMetal(
        process.metal_type,
      );
      if (
        !currentStock ||
        Math.round(currentStock.dhal_stock * 1000) < Math.round(delta * 1000)
      ) {
        return formatResponse(
          res,
          400,
          false,
          "Insufficient Dhal Stock to increase issued weight.",
        );
      }
      await stockService.updateDhalStock(process.metal_type, delta, false);
      await stockService.logTransaction(
        process.metal_type,
        "ADJUSTMENT",
        delta,
        `Increased issued weight for Rolling Job ${process.job_number}`,
      );
    } else if (delta < 0) {
      await stockService.updateDhalStock(
        process.metal_type,
        Math.abs(delta),
        true,
      );
      await stockService.logTransaction(
        process.metal_type,
        "ADJUSTMENT",
        Math.abs(delta),
        `Decreased/Refunded issued weight for Rolling Job ${process.job_number}`,
      );
    }

    await rollingService.updateRollingIssuedWeight(process_id, newWeight);
    return formatResponse(
      res,
      200,
      true,
      "Rolling process updated successfully.",
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const deleteRolling = async (req, res) => {
  try {
    const process_id = req.params.id;
    const process = await rollingService.getRollingProcessById(process_id);

    if (!process) return formatResponse(res, 404, false, "Process not found.");

    // PENDING Deletion
    if (process.status === "PENDING") {
      if (process.issue_size > 0) {
        await stockService.updateDhalStock(
          process.metal_type,
          process.issue_size,
          true,
        );
        await stockService.logTransaction(
          process.metal_type,
          "REVERSAL",
          process.issue_size,
          `Deleted Queued Rolling Job ${process.job_number}`,
        );
      }
      await rollingService.deleteRollingProcessById(process_id);
      return formatResponse(
        res,
        200,
        true,
        "Pending rolling process deleted and stock refunded.",
      );
    }

    // RUNNING Deletion
    if (process.status === "RUNNING") {
      if (process.issued_weight > 0) {
        await stockService.updateDhalStock(
          process.metal_type,
          process.issued_weight,
          true,
        );
        await stockService.logTransaction(
          process.metal_type,
          "REVERSAL",
          process.issued_weight,
          `Deleted Running Rolling Job ${process.job_number}`,
        );
      }
      await rollingService.deleteRollingProcessById(process_id);
      return formatResponse(
        res,
        200,
        true,
        "Running rolling process deleted and stock refunded.",
      );
    }

    if (process.status !== "COMPLETED") {
      return formatResponse(res, 400, false, "Invalid status for deletion.");
    }

    // COMPLETED Deletion Validation
    const currentStock = await stockService.getStockByMetal(process.metal_type);
    if (
      !currentStock ||
      Math.round(currentStock.rolling_stock * 1000) <
        Math.round(process.return_weight * 1000)
    ) {
      return formatResponse(
        res,
        400,
        false,
        "Cannot delete: Downstream processes have already consumed this metal from the Rolling Stock pool.",
      );
    }

    // 1. Revert Return Weight from Rolling Pool
    if (process.return_weight > 0) {
      await stockService.updateProcessStock(
        "rolling",
        process.metal_type,
        process.return_weight,
        false,
      );
    }
    // 2. Revert Scrap Weight from Opening Stock
    if (process.scrap_weight > 0) {
      await stockService.updateOpeningStock(
        process.metal_type,
        process.scrap_weight,
        false,
      );
    }
    // 3. Revert Loss Weight
    if (process.loss_weight > 0) {
      await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
    }
    // 4. Refund Issued Weight to Dhal Stock
    if (process.issued_weight > 0) {
      await stockService.updateDhalStock(
        process.metal_type,
        process.issued_weight,
        true,
      );
    }

    await stockService.logTransaction(
      process.metal_type,
      "REVERSAL",
      process.issued_weight,
      `Deleted Completed Rolling Job ${process.job_number} (Full Reversal)`,
    );

    await rollingService.deleteRollingProcessById(process_id);
    return formatResponse(
      res,
      200,
      true,
      "Rolling process deleted and stock reversed.",
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createRolling,
  startRolling,
  completeRolling,
  getAllRolling,
  editRolling,
  deleteRolling,
};
