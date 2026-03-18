const meltingService = require("../services/meltingService");
const stockService = require("../services/stockService");
const { calculateLoss, formatResponse } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES, STATUS } = require("../utils/constants");

const startMelting = async (req, res) => {
  try {
    const { metal_type, weight_unit, issue_weight, issue_pieces, employee, description } = req.body;
    const weight = parseFloat(issue_weight);
    const pieces = parseInt(issue_pieces) || 0;
    const unit = weight_unit || "g";
    const assignedEmployee = employee || "Unknown";

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
      unit,
      weight,
      pieces,
      assignedEmployee,
      description || "",
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
    const { process_id, return_weight, return_pieces, scrap_weight, description } = req.body;

    const retW = parseFloat(return_weight) || 0;
    const scrW = parseFloat(scrap_weight) || 0;
    const retPieces = parseInt(return_pieces) || 0;

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

    await meltingService.updateMeltingProcess(
      process_id,
      retW,
      retPieces,
      scrW,
      lossWeight,
      description !== undefined ? description : null,
    );
    // Math diff to prevent double counting if weights were previously updated in RUNNING edit
    const retWeightDiff = retW - (process.return_weight || 0);
    if (retWeightDiff > 0) {
      await stockService.updateDhalStock(
        process.metal_type,
        retWeightDiff,
        true,
      );
    } else if (retWeightDiff < 0) {
      await stockService.updateDhalStock(
        process.metal_type,
        Math.abs(retWeightDiff),
        false,
      );
    }

    const scrWeightDiff = scrW - (process.scrap_weight || 0);
    if (scrWeightDiff > 0) {
      await stockService.updateOpeningStock(
        process.metal_type,
        scrWeightDiff,
        true,
      );
      await stockService.logTransaction(
        process.metal_type,
        "SCRAP_RETURN",
        scrWeightDiff,
        `Scrap from Melt #${process_id}`,
      );
    } else if (scrWeightDiff < 0) {
      await stockService.updateOpeningStock(
        process.metal_type,
        Math.abs(scrWeightDiff),
        false,
      );
    }

    const lossWeightDiff = lossWeight - (process.loss_weight || 0);
    if (lossWeightDiff !== 0) {
      await stockService.addTotalLoss(process.metal_type, lossWeightDiff);
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

const editMeltingProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      issued_weight,
      return_weight,
      scrap_weight,
      issue_pieces,
      return_pieces,
      description,
      employee,
    } = req.body;

    const newWeight = parseFloat(issued_weight);
    if (isNaN(newWeight) || newWeight <= 0) {
      return formatResponse(res, 400, false, "Invalid issued weight.");
    }

    const process = await meltingService.getMeltingProcessById(id);
    if (!process)
      return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);

    const weightDiff = newWeight - process.issue_weight;

    let newRetWeight = process.return_weight;
    let newScrWeight = process.scrap_weight;
    let newPieces = process.return_pieces;
    let newLossWeight = process.loss_weight;

    if (process.status === STATUS.COMPLETED) {
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
    }

    if (weightDiff > 0) {
      const currentStock = await stockService.getStockByMetal(
        process.metal_type,
      );
      if (!currentStock || currentStock.opening_stock < weightDiff) {
        return formatResponse(res, 400, false, "Insufficient stock for update");
      }
      await stockService.updateOpeningStock(
        process.metal_type,
        weightDiff,
        false,
      );
    } else if (weightDiff < 0) {
      await stockService.updateOpeningStock(
        process.metal_type,
        Math.abs(weightDiff),
        true,
      );
    }

    let updates = {
      issue_weight: newWeight,
      issue_pieces:
        issue_pieces !== undefined
          ? parseInt(issue_pieces) || 0
          : process.issue_pieces,
    };
    if (description !== undefined) updates.description = description;
    if (employee !== undefined) updates.employee = employee;

    if (process.status === STATUS.COMPLETED) {
      // Handle Dhal Stock diffs (Return goes to Dhal in melting)
      const retWeightDiff = newRetWeight - process.return_weight;
      if (retWeightDiff > 0) {
        await stockService.updateDhalStock(
          process.metal_type,
          retWeightDiff,
          true,
        );
      } else if (retWeightDiff < 0) {
        await stockService.updateDhalStock(
          process.metal_type,
          Math.abs(retWeightDiff),
          false,
        );
      }

      // Handle Scrap Stock diffs (Scrap goes back to Opening Stock)
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

      // Sync the exact gain/loss ledger — revert old and apply new
      const oldLoss = process.loss_weight || 0;
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

    await meltingService.editMeltingProcess(id, updates);

    return formatResponse(res, 200, true, "Melting process updated.");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const deleteMeltingProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const process = await meltingService.getMeltingProcessById(id);
    if (!process)
      return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);

    // 1. Revert Return Weight from Dhal Pool
    if (process.return_weight > 0) {
      const currentStock = await stockService.getStockByMetal(
        process.metal_type,
      );
      if (
        !currentStock ||
        Math.round(currentStock.dhal_stock * 1000) <
          Math.round(process.return_weight * 1000)
      ) {
        return formatResponse(
          res,
          400,
          false,
          "Cannot delete: Downstream processes have already consumed this metal from the Dhal Stock pool.",
        );
      }
      await stockService.updateDhalStock(
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
    if (process.loss_weight !== 0) {
      await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
    }

    // 4. Refund Issued Weight to Opening Stock
    if (process.issue_weight > 0) {
      await stockService.updateOpeningStock(
        process.metal_type,
        process.issue_weight,
        true,
      );
      await stockService.logTransaction(
        process.metal_type,
        "REVERSAL",
        process.issue_weight,
        `Deleted ${process.status} Melting Job #${process.id} (Full Reversal)`,
      );
    }

    await meltingService.deleteMeltingProcess(id);

    return formatResponse(
      res,
      200,
      true,
      `${process.status.charAt(0) + process.status.slice(1).toLowerCase()} melting process deleted and stock refunded.`,
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getAllMelting = async (req, res) => {
  try {
    const processes = await meltingService.getAllMeltingProcesses();
    return formatResponse(res, 200, true, "All melts fetched", processes);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const revertMeltingProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const process = await meltingService.getMeltingProcessById(id);
    if (!process)
      return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);

    if (process.status === "COMPLETED") {
      // Revert from COMPLETED -> RUNNING
      if (process.return_weight > 0) {
        const currentStock = await stockService.getStockByMetal(process.metal_type);
        if (
          !currentStock ||
          Math.round(currentStock.dhal_stock * 1000) < Math.round(process.return_weight * 1000)
        ) {
          return formatResponse(
            res,
            400,
            false,
            "Cannot revert: Downstream processes have already consumed this metal from the Dhal Stock pool.",
          );
        }
        await stockService.updateDhalStock(process.metal_type, process.return_weight, false);
      }

      if (process.scrap_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.scrap_weight, false);
      }

      if (process.loss_weight !== 0) {
        await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
      }

      await stockService.logTransaction(
        process.metal_type,
        "REVERSAL",
        process.issue_weight,
        `Reverted Melting Job #${process.id} to RUNNING`,
      );

      const updates = {
        return_weight: 0,
        return_pieces: 0,
        scrap_weight: 0,
        loss_weight: 0,
        status: "RUNNING",
        completed_at: null,
      };
      await meltingService.editMeltingProcess(id, updates);
      return formatResponse(res, 200, true, "Melting process reverted to RUNNING successfully.");

    } else if (process.status === "RUNNING") {
      // Revert from RUNNING -> Deleted/Removed (Refund Opening Stock)
      await stockService.updateOpeningStock(process.metal_type, process.issue_weight, true);
      await stockService.logTransaction(
        process.metal_type,
        "REVERSAL",
        process.issue_weight,
        `Reverted RUNNING Melting Job #${process.id} back to Opening Stock`,
      );
      await meltingService.deleteMeltingProcess(id);
      return formatResponse(res, 200, true, "Melting process reversed and deleted successfully.");
    } else {
      return formatResponse(res, 400, false, "Process is in an invalid state for reversion.");
    }
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  startMelting,
  completeMelting,
  getRunningMelts,
  editMeltingProcess,
  deleteMeltingProcess,
  getAllMelting,
  revertMeltingProcess,
};
