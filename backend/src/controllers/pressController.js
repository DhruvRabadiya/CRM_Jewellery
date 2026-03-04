const pressService = require("../services/pressService");
const stockService = require("../services/stockService");
const { calculateLoss, formatResponse } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES, STATUS } = require("../utils/constants");

const createPress = async (req, res) => {
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
      Math.round(currentStock.rolling_stock * 1000) < Math.round(weight * 1000)
    ) {
      return formatResponse(
        res,
        400,
        false,
        "Insufficient pooled Rolling Stock available to queue this job.",
      );
    }

    const processId = await pressService.createPressProcess(
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
    await stockService.updateProcessStock("rolling", metal_type, weight, false);
    await stockService.logTransaction(
      metal_type,
      TRANSACTION_TYPES.JOB_ISSUE,
      weight,
      `Queued Press Job ${job_number}`,
    );

    return formatResponse(res, 201, true, "Press process queued", {
      processId,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const startPress = async (req, res) => {
  try {
    const { process_id, issued_weight, issue_pieces } = req.body;
    const weight = parseFloat(issued_weight);
    const pieces = parseInt(issue_pieces) || 0;
    if (!process_id || isNaN(weight) || weight <= 0) {
      return formatResponse(res, 400, false, "Invalid issued weight.");
    }

    const process = await pressService.getPressProcessById(process_id);
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
        Math.round(currentStock.rolling_stock * 1000) < Math.round(delta * 1000)
      ) {
        return formatResponse(
          res,
          400,
          false,
          "Insufficient pooled Rolling Stock to increase weight.",
        );
      }
      await stockService.updateProcessStock(
        "rolling",
        process.metal_type,
        delta,
        false,
      );
      await stockService.logTransaction(
        process.metal_type,
        "ADJUSTMENT",
        delta,
        `Start delta adjustment (added) for Press Job ${process.job_number}`,
      );
    } else if (delta < 0) {
      await stockService.updateProcessStock(
        "rolling",
        process.metal_type,
        Math.abs(delta),
        true,
      );
      await stockService.logTransaction(
        process.metal_type,
        "ADJUSTMENT",
        Math.abs(delta),
        `Start delta adjustment (refunded) for Press Job ${process.job_number}`,
      );
    }

    await pressService.startPressProcess(process_id, weight, pieces);
    return formatResponse(res, 200, true, "Press process started");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const completePress = async (req, res) => {
  try {
    const { process_id, return_weight, return_pieces, scrap_weight } = req.body;
    const retW = parseFloat(return_weight) || 0;
    const retP = parseInt(return_pieces) || 0;
    const scrW = parseFloat(scrap_weight) || 0;

    if (!process_id || retW < 0 || scrW < 0) {
      return formatResponse(res, 400, false, "Invalid weights.");
    }

    const process = await pressService.getPressProcessById(process_id);
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

    await pressService.completePressProcess(
      process_id,
      retW,
      retP,
      scrW,
      lossWeight,
    );

    // Add pure metal back to pooled press_stock
    await stockService.updateProcessStock(
      "press",
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
        `Scrap from Press ${process.job_number}`,
      );
    }

    if (lossWeight > 0) {
      await stockService.addTotalLoss(process.metal_type, lossWeight);
    }

    return formatResponse(res, 200, true, "Press completed", {
      loss: lossWeight,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getAllPress = async (req, res) => {
  try {
    const processes = await pressService.getAllPressProcesses();
    return formatResponse(res, 200, true, "Press processes fetched", processes);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const editPress = async (req, res) => {
  try {
    const process_id = req.params.id;
    const {
      issued_weight,
      return_weight,
      scrap_weight,
      issue_pieces,
      return_pieces,
    } = req.body;
    const newWeight = parseFloat(issued_weight);

    if (!process_id || isNaN(newWeight) || newWeight <= 0) {
      return formatResponse(res, 400, false, "Invalid issued weight.");
    }

    const process = await pressService.getPressProcessById(process_id);
    if (!process) return formatResponse(res, 404, false, "Process not found.");

    const oldWeight = process.issue_size || process.issued_weight || 0;
    const delta = newWeight - oldWeight;

    let newRetWeight = process.return_weight;
    let newScrWeight = process.scrap_weight;
    let newPieces = process.return_pieces;
    let newLossWeight = process.loss_weight;

    if (process.status === "COMPLETED") {
      newRetWeight =
        return_weight !== undefined
          ? parseFloat(return_weight) || 0
          : process.return_weight;
      newScrWeight =
        scrap_weight !== undefined
          ? parseFloat(scrap_weight) || 0
          : process.scrap_weight;
      newPieces =
        return_pieces !== undefined
          ? parseInt(return_pieces) || 0
          : process.return_pieces;

      newLossWeight = calculateLoss(newWeight, newRetWeight, newScrWeight);
      if (newLossWeight < 0) {
        return formatResponse(
          res,
          400,
          false,
          "Update makes Return + Scrap exceed Issue limit.",
        );
      }
    }

    if (delta > 0) {
      const currentStock = await stockService.getStockByMetal(
        process.metal_type,
      );
      if (
        !currentStock ||
        Math.round(currentStock.rolling_stock * 1000) < Math.round(delta * 1000)
      ) {
        return formatResponse(
          res,
          400,
          false,
          "Insufficient pooled Rolling Stock to increase issued weight.",
        );
      }
      await stockService.updateProcessStock(
        "rolling",
        process.metal_type,
        delta,
        false,
      );
    } else if (delta < 0) {
      await stockService.updateProcessStock(
        "rolling",
        process.metal_type,
        Math.abs(delta),
        true,
      );
    }

    let updates = {
      issued_weight: newWeight,
      issue_size: newWeight,
      issue_pieces:
        issue_pieces !== undefined
          ? parseInt(issue_pieces) || 0
          : process.issue_pieces,
    };

    if (process.status === "COMPLETED") {
      // Sync Return Weight -> press_stock
      const retWeightDiff = newRetWeight - process.return_weight;
      if (retWeightDiff > 0) {
        await stockService.updateProcessStock(
          "press",
          process.metal_type,
          retWeightDiff,
          true,
        );
      } else if (retWeightDiff < 0) {
        await stockService.updateProcessStock(
          "press",
          process.metal_type,
          Math.abs(retWeightDiff),
          false,
        );
      }

      // Sync Scrap Weight -> opening_stock
      const scrWeightDiff = newScrWeight - process.scrap_weight;
      if (scrWeightDiff > 0) {
        await stockService.updateOpeningStock(
          process.metal_type,
          scrWeightDiff,
          true,
        );
      } else if (scrWeightDiff < 0) {
        await stockService.updateOpeningStock(
          process.metal_type,
          Math.abs(scrWeightDiff),
          false,
        );
      }

      // Sync exact Total Loss ledger differences
      const oldLoss = process.loss_weight;
      const lossWeightDiff = newLossWeight - oldLoss;
      if (lossWeightDiff !== 0) {
        await stockService.addTotalLoss(process.metal_type, lossWeightDiff);
      }

      updates.return_weight = newRetWeight;
      updates.scrap_weight = newScrWeight;
      updates.loss_weight = newLossWeight;
      if (return_pieces !== undefined)
        updates.return_pieces = parseInt(return_pieces) || 0;
    }

    await pressService.editPressProcessUniversal(process_id, updates);

    return formatResponse(
      res,
      200,
      true,
      "Press process updated successfully.",
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const deletePress = async (req, res) => {
  try {
    const process_id = req.params.id;
    const process = await pressService.getPressProcessById(process_id);

    if (!process) return formatResponse(res, 404, false, "Process not found.");

    // PENDING Deletion
    if (process.status === "PENDING") {
      if (process.issue_size > 0) {
        await stockService.updateProcessStock(
          "rolling",
          process.metal_type,
          process.issue_size,
          true,
        );
        await stockService.logTransaction(
          process.metal_type,
          "REVERSAL",
          process.issue_size,
          `Deleted Queued Press Job ${process.job_number}`,
        );
      }
      await pressService.deletePressProcessById(process_id);
      return formatResponse(
        res,
        200,
        true,
        "Pending press process deleted and stock refunded.",
      );
    }

    // RUNNING Deletion
    if (process.status === "RUNNING") {
      if (process.issued_weight > 0) {
        await stockService.updateProcessStock(
          "rolling",
          process.metal_type,
          process.issued_weight,
          true,
        );
        await stockService.logTransaction(
          process.metal_type,
          "REVERSAL",
          process.issued_weight,
          `Deleted Running Press Job ${process.job_number}`,
        );
      }
      await pressService.deletePressProcessById(process_id);
      return formatResponse(
        res,
        200,
        true,
        "Running press process deleted and stock refunded.",
      );
    }

    if (process.status !== "COMPLETED") {
      return formatResponse(res, 400, false, "Invalid status for deletion.");
    }

    // COMPLETED Deletion Validation
    const currentStock = await stockService.getStockByMetal(process.metal_type);
    if (
      !currentStock ||
      Math.round(currentStock.press_stock * 1000) <
        Math.round(process.return_weight * 1000)
    ) {
      return formatResponse(
        res,
        400,
        false,
        "Cannot delete: Downstream processes have already consumed this metal from the Press Stock pool.",
      );
    }

    // 1. Revert Return Weight from Press Pool
    if (process.return_weight > 0) {
      await stockService.updateProcessStock(
        "press",
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
    // 4. Refund Issued Weight to Rolling Pool
    if (process.issued_weight > 0) {
      await stockService.updateProcessStock(
        "rolling",
        process.metal_type,
        process.issued_weight,
        true,
      );
    }

    await stockService.logTransaction(
      process.metal_type,
      "REVERSAL",
      process.issued_weight,
      `Deleted Completed Press Job ${process.job_number} (Full Reversal)`,
    );

    await pressService.deletePressProcessById(process_id);
    return formatResponse(
      res,
      200,
      true,
      "Press process deleted and stock reversed.",
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createPress,
  startPress,
  completePress,
  getAllPress,
  editPress,
  deletePress,
};
