const pressService = require("../services/pressService");
const stockService = require("../services/stockService");
const { calculateLoss, formatResponse, isValidMetalType, sanitizePieces } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES, STATUS } = require("../utils/constants");

const createPress = async (req, res) => {
  try {
    const { job_number, job_name, metal_type, unit, employee, issue_size, issue_pieces, category, description } = req.body;
    const weight = parseFloat(issue_size);
    const pieces = sanitizePieces(issue_pieces);

    if (!metal_type || !isValidMetalType(metal_type)) {
      return formatResponse(res, 400, false, "Invalid metal type. Must be 'Gold 22K', 'Gold 24K', or 'Silver'.");
    }
    if (!job_number || isNaN(weight) || weight <= 0) {
      return formatResponse(res, 400, false, "Invalid input. Issue size must be greater than 0.");
    }

    const currentStock = await stockService.getStockByMetal(metal_type);
    if (!currentStock || Math.round(currentStock.opening_stock * 1000) < Math.round(weight * 1000)) {
      return formatResponse(res, 400, false, "Insufficient Opening Stock available to queue this job.");
    }

    const processId = await pressService.createPressProcess(
      job_number, job_name, metal_type, unit, weight, pieces, category, employee, description || "",
    );

    await stockService.updateOpeningStock(metal_type, weight, false);
    await stockService.updateInprocessWeight(metal_type, weight, true);
    await stockService.logTransaction(metal_type, TRANSACTION_TYPES.JOB_ISSUE, weight, `Queued Press Job ${job_number}`);

    return formatResponse(res, 201, true, "Press process queued", { processId });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const startPress = async (req, res) => {
  try {
    const { process_id, issued_weight, issue_pieces, employee, description } = req.body;
    const weight = parseFloat(issued_weight);
    const pieces = sanitizePieces(issue_pieces);
    if (!process_id || isNaN(weight) || weight <= 0) {
      return formatResponse(res, 400, false, "Invalid issued weight.");
    }

    const process = await pressService.getPressProcessById(process_id);
    if (!process) return formatResponse(res, 404, false, "Process not found.");

    const delta = weight - process.issue_size;

    if (delta > 0) {
      const currentStock = await stockService.getStockByMetal(process.metal_type);
      if (!currentStock || Math.round(currentStock.opening_stock * 1000) < Math.round(delta * 1000)) {
        return formatResponse(res, 400, false, "Insufficient Opening Stock to increase weight.");
      }
      await stockService.updateOpeningStock(process.metal_type, delta, false);
      await stockService.updateInprocessWeight(process.metal_type, delta, true);
      await stockService.logTransaction(process.metal_type, "ADJUSTMENT", delta, `Start delta adjustment (added) for Press Job ${process.job_number}`);
    } else if (delta < 0) {
      await stockService.updateOpeningStock(process.metal_type, Math.abs(delta), true);
      await stockService.updateInprocessWeight(process.metal_type, Math.abs(delta), false);
      await stockService.logTransaction(process.metal_type, "ADJUSTMENT", Math.abs(delta), `Start delta adjustment (refunded) for Press Job ${process.job_number}`);
    }

    await pressService.startPressProcess(process_id, weight, pieces, employee, description);
    return formatResponse(res, 200, true, "Press process started");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const completePress = async (req, res) => {
  try {
    const { process_id, return_items, return_weight, return_pieces, scrap_weight, description } = req.body;
    const scrW = parseFloat(scrap_weight) || 0;

    const items = Array.isArray(return_items) && return_items.length > 0 ? return_items : null;
    const retW = items
      ? items.reduce((sum, item) => sum + (parseFloat(item.return_weight) || 0), 0)
      : (parseFloat(return_weight) || 0);
    const retP = items
      ? items.reduce((sum, item) => sum + (parseInt(item.return_pieces) || 0), 0)
      : (parseInt(return_pieces) || 0);

    if (!process_id || retW < 0 || scrW < 0) {
      return formatResponse(res, 400, false, "Invalid weights.");
    }

    const process = await pressService.getPressProcessById(process_id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    if (process.status === STATUS.COMPLETED) {
      return formatResponse(res, 400, false, "Process already completed.");
    }
    if (process.status === "PENDING") {
      return formatResponse(res, 400, false, "Process must be started before completing.");
    }

    const issW = process.issued_weight || process.issue_size || 0;
    const lossWeight = calculateLoss(issW, retW, scrW);

    if (items && items.length > 0) {
      const db = require("../../config/dbConfig");
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM process_return_items WHERE process_id = ? AND process_type = 'press'`, [process_id], (err) => err ? reject(err) : resolve());
      });
      for (const item of items) {
        await new Promise((resolve, reject) => {
          db.run(`INSERT INTO process_return_items (process_id, process_type, category, return_weight, return_pieces) VALUES (?, 'press', ?, ?, ?)`,
            [process_id, item.category || process.category || '', parseFloat(item.return_weight) || 0, parseInt(item.return_pieces) || 0],
            (err) => err ? reject(err) : resolve());
        });
      }
    }

    await pressService.completePressProcess(process_id, retW, retP, scrW, lossWeight, description !== undefined ? description : null);

    // Return goes back to opening_stock (non-packing)
    const retWeightDiff = retW - (process.return_weight || 0);
    if (retWeightDiff > 0) {
      await stockService.updateOpeningStock(process.metal_type, retWeightDiff, true);
    } else if (retWeightDiff < 0) {
      await stockService.updateOpeningStock(process.metal_type, Math.abs(retWeightDiff), false);
    }

    const scrWeightDiff = scrW - (process.scrap_weight || 0);
    if (scrWeightDiff > 0) {
      await stockService.updateOpeningStock(process.metal_type, scrWeightDiff, true);
      await stockService.logTransaction(process.metal_type, "SCRAP_RETURN", scrWeightDiff, `Scrap from Press ${process.job_number}`);
    } else if (scrWeightDiff < 0) {
      await stockService.updateOpeningStock(process.metal_type, Math.abs(scrWeightDiff), false);
    }

    const lossWeightDiff = lossWeight - (process.loss_weight || 0);
    if (lossWeightDiff !== 0) {
      await stockService.addTotalLoss(process.metal_type, lossWeightDiff);
    }

    // Deduct issued_weight from inprocess on completion
    await stockService.updateInprocessWeight(process.metal_type, issW, false);

    return formatResponse(res, 200, true, "Press completed", { loss: lossWeight });
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
    const { issued_weight, return_weight, scrap_weight, issue_pieces, return_pieces, return_items, description, employee } = req.body;
    const newWeight = parseFloat(issued_weight);

    if (!process_id || isNaN(newWeight) || newWeight <= 0) {
      return formatResponse(res, 400, false, "Invalid issued weight.");
    }

    const process = await pressService.getPressProcessById(process_id);
    if (!process) return formatResponse(res, 404, false, "Process not found.");

    const oldWeight = process.issue_size || process.issued_weight || 0;
    const delta = newWeight - oldWeight;

    // Derive aggregate from return_items if provided
    const hasReturnItems = Array.isArray(return_items) && return_items.length > 0;
    const effectiveReturnWeight = hasReturnItems
      ? return_items.reduce((s, i) => s + (parseFloat(i.return_weight) || 0), 0)
      : return_weight;
    const effectiveReturnPieces = hasReturnItems
      ? return_items.reduce((s, i) => s + (parseInt(i.return_pieces) || 0), 0)
      : return_pieces;

    let newRetWeight = process.return_weight;
    let newScrWeight = process.scrap_weight;
    let newPieces = process.return_pieces;
    let newLossWeight = process.loss_weight;

    if (process.status === "COMPLETED") {
      newRetWeight = effectiveReturnWeight !== undefined ? parseFloat(effectiveReturnWeight) || 0 : process.return_weight;
      newScrWeight = scrap_weight !== undefined ? parseFloat(scrap_weight) || 0 : process.scrap_weight;
      newPieces = effectiveReturnPieces !== undefined ? parseInt(effectiveReturnPieces) || 0 : process.return_pieces;
      newLossWeight = calculateLoss(newWeight, newRetWeight, newScrWeight);
    }

    if (delta > 0) {
      const currentStock = await stockService.getStockByMetal(process.metal_type);
      if (!currentStock || Math.round(currentStock.opening_stock * 1000) < Math.round(delta * 1000)) {
        return formatResponse(res, 400, false, "Insufficient Opening Stock to increase issued weight.");
      }
      await stockService.updateOpeningStock(process.metal_type, delta, false);
      if (process.status !== "COMPLETED") {
        await stockService.updateInprocessWeight(process.metal_type, delta, true);
      }
    } else if (delta < 0) {
      await stockService.updateOpeningStock(process.metal_type, Math.abs(delta), true);
      if (process.status !== "COMPLETED") {
        await stockService.updateInprocessWeight(process.metal_type, Math.abs(delta), false);
      }
    }

    let updates = {
      issued_weight: newWeight,
      issue_size: newWeight,
      issue_pieces: issue_pieces !== undefined ? parseInt(issue_pieces) || 0 : process.issue_pieces,
    };
    if (req.body.category !== undefined) updates.category = req.body.category;
    if (description !== undefined) updates.description = description;
    if (employee !== undefined) updates.employee = employee;

    if (process.status === "COMPLETED") {
      const retWeightDiff = newRetWeight - process.return_weight;
      if (retWeightDiff > 0) {
        await stockService.updateOpeningStock(process.metal_type, retWeightDiff, true);
      } else if (retWeightDiff < 0) {
        await stockService.updateOpeningStock(process.metal_type, Math.abs(retWeightDiff), false);
      }

      const scrWeightDiff = newScrWeight - process.scrap_weight;
      if (scrWeightDiff > 0) {
        await stockService.updateOpeningStock(process.metal_type, scrWeightDiff, true);
      } else if (scrWeightDiff < 0) {
        await stockService.updateOpeningStock(process.metal_type, Math.abs(scrWeightDiff), false);
      }

      const oldLoss = process.loss_weight || 0;
      const lossWeightDiff = newLossWeight - oldLoss;
      if (lossWeightDiff !== 0) {
        await stockService.addTotalLoss(process.metal_type, lossWeightDiff);
      }

      updates.return_weight = newRetWeight;
      updates.scrap_weight = newScrWeight;
      updates.loss_weight = newLossWeight;
      updates.return_pieces = newPieces;
    }

    await pressService.editPressProcessUniversal(process_id, updates);

    // Update process_return_items if new items provided and process is COMPLETED
    if (hasReturnItems && process.status === "COMPLETED") {
      const db = require("../../config/dbConfig");
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM process_return_items WHERE process_id = ? AND process_type = 'press'`, [process_id], (err) => err ? reject(err) : resolve());
      });
      for (const item of return_items) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO process_return_items (process_id, process_type, category, return_weight, return_pieces) VALUES (?, 'press', ?, ?, ?)`,
            [process_id, item.category || process.category || '', parseFloat(item.return_weight) || 0, parseInt(item.return_pieces) || 0],
            (err) => err ? reject(err) : resolve()
          );
        });
      }
    }

    return formatResponse(res, 200, true, "Press process updated successfully.");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const deletePress = async (req, res) => {
  try {
    const process_id = req.params.id;
    const process = await pressService.getPressProcessById(process_id);
    if (!process) return formatResponse(res, 404, false, "Process not found.");

    if (process.status === "PENDING") {
      if (process.issue_size > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.issue_size, true);
        await stockService.updateInprocessWeight(process.metal_type, process.issue_size, false);
        await stockService.logTransaction(process.metal_type, "REVERSAL", process.issue_size, `Deleted Queued Press Job ${process.job_number}`);
      }
      await pressService.deletePressProcessById(process_id);
      return formatResponse(res, 200, true, "Pending press process deleted and stock refunded.");
    }

    if (process.status === "RUNNING") {
      if (process.scrap_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.scrap_weight, false);
      }
      if (process.loss_weight !== 0) {
        await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
      }
      if (process.issued_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.issued_weight, true);
        await stockService.updateInprocessWeight(process.metal_type, process.issued_weight, false);
        await stockService.logTransaction(process.metal_type, "REVERSAL", process.issued_weight, `Deleted Running Press Job ${process.job_number} (Full Reversal)`);
      }
      await pressService.deletePressProcessById(process_id);
      return formatResponse(res, 200, true, "Running press process deleted and stock refunded.");
    }

    if (process.status === "COMPLETED") {
      if (process.return_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.return_weight, false);
      }
      if (process.scrap_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.scrap_weight, false);
      }
      if (process.loss_weight !== 0) {
        await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
      }
      if (process.issued_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.issued_weight, true);
        await stockService.logTransaction(process.metal_type, "REVERSAL", process.issued_weight, `Deleted Completed Press Job ${process.job_number} (Full Reversal)`);
      }
      await pressService.deletePressProcessById(process_id);
      return formatResponse(res, 200, true, "Completed press process deleted and stock refunded.");
    }
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const revertPress = async (req, res) => {
  try {
    const process_id = req.params.id;
    const process = await pressService.getPressProcessById(process_id);
    if (!process) return formatResponse(res, 404, false, "Process not found.");

    if (process.status === "COMPLETED") {
      if (process.return_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.return_weight, false);
      }
      if (process.scrap_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.scrap_weight, false);
      }
      if (process.loss_weight !== 0) {
        await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
      }
      await stockService.updateInprocessWeight(process.metal_type, process.issued_weight, true);
      await stockService.logTransaction(process.metal_type, "REVERSAL", process.issued_weight, `Reverted Press Job ${process.job_number} to RUNNING`);

      await pressService.editPressProcessUniversal(process_id, {
        status: "RUNNING", return_weight: 0, return_pieces: 0, scrap_weight: 0, loss_weight: 0, end_time: null,
      });
      return formatResponse(res, 200, true, "Press process reverted to RUNNING.");

    } else if (process.status === "RUNNING") {
      const delta = process.issued_weight - process.issue_size;
      if (delta > 0) {
        await stockService.updateOpeningStock(process.metal_type, delta, true);
        await stockService.updateInprocessWeight(process.metal_type, delta, false);
      } else if (delta < 0) {
        const currentStock = await stockService.getStockByMetal(process.metal_type);
        if (!currentStock || Math.round(currentStock.opening_stock * 1000) < Math.round(Math.abs(delta) * 1000)) {
          return formatResponse(res, 400, false, "Cannot revert: Insufficient Opening Stock to restore PENDING issue_size.");
        }
        await stockService.updateOpeningStock(process.metal_type, Math.abs(delta), false);
        await stockService.updateInprocessWeight(process.metal_type, Math.abs(delta), true);
      }
      await stockService.logTransaction(process.metal_type, "REVERSAL", Math.abs(delta), `Reverted Press Job ${process.job_number} to PENDING`);
      await pressService.editPressProcessUniversal(process_id, { status: "PENDING", issued_weight: 0, start_time: null });
      return formatResponse(res, 200, true, "Press process reverted to PENDING.");

    } else if (process.status === "PENDING") {
      if (process.issue_size > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.issue_size, true);
        await stockService.updateInprocessWeight(process.metal_type, process.issue_size, false);
        await stockService.logTransaction(process.metal_type, "REVERSAL", process.issue_size, `Deleted Queued Press Job ${process.job_number}`);
      }
      await pressService.deletePressProcessById(process_id);
      return formatResponse(res, 200, true, "Pending press process queue removed and stock refunded.");
    } else {
      return formatResponse(res, 400, false, "Invalid status for process reversal.");
    }
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
  revertPress,
};
