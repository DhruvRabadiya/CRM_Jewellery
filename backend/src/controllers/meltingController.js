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

const getAllMelts = async (req, res) => {
  try {
    const melts = await meltingService.getAllMeltingProcesses();
    return formatResponse(res, 200, true, "All melts fetched", melts);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getCompletedMelts = async (req, res) => {
  try {
    const melts = await meltingService.getCompletedMelts();
    return formatResponse(res, 200, true, "Completed melts fetched", melts);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getMeltById = async (req, res) => {
  try {
    const { id } = req.params;
    const melt = await meltingService.getMeltingProcessById(id);
    if (!melt) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    return formatResponse(res, 200, true, "Melt fetched", melt);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

// Update a RUNNING melt (edit metal_type and/or issue_weight)
const updateMelt = async (req, res) => {
  try {
    const { id } = req.params;
    const { metal_type, issue_weight } = req.body;
    const newWeight = parseFloat(issue_weight);

    if (!metal_type || isNaN(newWeight) || newWeight <= 0) {
      return formatResponse(res, 400, false, MESSAGES.INVALID_INPUT);
    }

    const process = await meltingService.getMeltingProcessById(id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    if (process.status === STATUS.COMPLETED) {
      return formatResponse(res, 400, false, "Cannot use this endpoint for completed melts. Use PUT /:id/completed instead.");
    }

    const oldWeight = process.issue_weight;
    const oldMetal = process.metal_type;

    // Reverse old stock deduction: add old weight back to old metal's opening stock
    await stockService.updateOpeningStock(oldMetal, oldWeight, true);

    // Check new stock availability
    const currentStock = await stockService.getStockByMetal(metal_type);
    if (!currentStock || currentStock.opening_stock < newWeight) {
      // Rollback: re-deduct old weight from old metal
      await stockService.updateOpeningStock(oldMetal, oldWeight, false);
      return formatResponse(res, 400, false, MESSAGES.INSUFFICIENT_STOCK);
    }

    // Deduct new weight from new metal's opening stock
    await stockService.updateOpeningStock(metal_type, newWeight, false);

    // Update the melting process record
    await meltingService.updateMeltingProcessDetails(id, metal_type, newWeight);

    return formatResponse(res, 200, true, "Melting process updated successfully");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

// Update a COMPLETED melt (edit return_weight and scrap_weight, recalculate loss)
const updateCompletedMelt = async (req, res) => {
  try {
    const { id } = req.params;
    const { return_weight, scrap_weight } = req.body;
    const newRetW = parseFloat(return_weight) || 0;
    const newScrW = parseFloat(scrap_weight) || 0;

    if (newRetW < 0 || newScrW < 0) {
      return formatResponse(res, 400, false, "Weights cannot be negative.");
    }

    const process = await meltingService.getMeltingProcessById(id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    if (process.status !== STATUS.COMPLETED) {
      return formatResponse(res, 400, false, "This melt is not completed yet.");
    }

    const newLoss = calculateLoss(process.issue_weight, newRetW, newScrW);
    if (newLoss < 0) {
      return formatResponse(res, 400, false, `Return (${newRetW}) + Scrap (${newScrW}) cannot exceed Issue Weight (${process.issue_weight}).`);
    }

    const oldRetW = process.return_weight;
    const oldScrW = process.scrap_weight;
    const oldLoss = process.loss_weight;

    // Reverse old dhal stock change and apply new
    const dhalDiff = newRetW - oldRetW;
    if (dhalDiff !== 0) {
      await stockService.updateDhalStock(process.metal_type, Math.abs(dhalDiff), dhalDiff > 0);
    }

    // Reverse old scrap stock change and apply new
    const scrapDiff = newScrW - oldScrW;
    if (scrapDiff !== 0) {
      await stockService.updateOpeningStock(process.metal_type, Math.abs(scrapDiff), scrapDiff > 0);
    }

    // Adjust total loss
    const lossDiff = newLoss - oldLoss;
    if (lossDiff !== 0) {
      if (lossDiff > 0) {
        await stockService.addTotalLoss(process.metal_type, lossDiff);
      } else {
        // Subtract loss (addTotalLoss only adds, so we use a negative update manually)
        await stockService.addTotalLoss(process.metal_type, lossDiff);
      }
    }

    // Update the melting process record
    await meltingService.updateCompletedMeltDetails(id, newRetW, newScrW, newLoss);

    return formatResponse(res, 200, true, "Completed melt updated successfully", {
      loss: newLoss,
      dhal_adjusted: dhalDiff,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

// Delete a melting process (reverses all stock changes)
const deleteMelt = async (req, res) => {
  try {
    const { id } = req.params;
    const process = await meltingService.getMeltingProcessById(id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);

    if (process.status === STATUS.RUNNING) {
      // Return issued weight back to opening stock
      await stockService.updateOpeningStock(process.metal_type, process.issue_weight, true);
    } else if (process.status === STATUS.COMPLETED) {
      // Reverse all completed stock changes:
      // 1. Return issue_weight back to opening stock
      await stockService.updateOpeningStock(process.metal_type, process.issue_weight, true);
      // 2. Remove dhal that was added
      if (process.return_weight > 0) {
        await stockService.updateDhalStock(process.metal_type, process.return_weight, false);
      }
      // 3. Remove scrap that was returned to opening stock
      if (process.scrap_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.scrap_weight, false);
      }
      // 4. Subtract loss from total
      if (process.loss_weight > 0) {
        await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
      }
    }

    await meltingService.deleteMeltingProcess(id);
    return formatResponse(res, 200, true, "Melting process deleted successfully");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  startMelting,
  completeMelting,
  getRunningMelts,
  getAllMelts,
  getCompletedMelts,
  getMeltById,
  updateMelt,
  updateCompletedMelt,
  deleteMelt,
};
