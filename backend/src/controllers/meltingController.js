const db = require("../../config/dbConfig");
const meltingService = require("../services/meltingService");
const stockService = require("../services/stockService");
const { calculateLoss, formatResponse, isValidMetalType, sanitizePieces } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES, STATUS } = require("../utils/constants");

const createMelting = async (req, res) => {
  try {
    const { job_number, job_name, metal_type, unit, issue_size, issue_pieces, category, employee, description } = req.body;
    const weight = parseFloat(issue_size);
    const pieces = sanitizePieces(issue_pieces);

    if (!job_number || isNaN(weight) || weight <= 0) {
      return formatResponse(res, 400, false, "Invalid input. Issue size must be greater than 0.");
    }
    if (!isValidMetalType(metal_type)) {
      return formatResponse(res, 400, false, "Invalid metal type. Must be 'Gold' or 'Silver'.");
    }

    const currentStock = await stockService.getStockByMetal(metal_type);
    if (!currentStock || Math.round(currentStock.opening_stock * 1000) < Math.round(weight * 1000)) {
      return formatResponse(res, 400, false, "Insufficient Opening Stock available.");
    }

    const processId = await meltingService.createMeltingProcess(
      job_number, job_name, metal_type, unit || "g", weight, pieces, category || "", employee || "", description || ""
    );

    await stockService.updateOpeningStock(metal_type, weight, false);
    await stockService.updateInprocessWeight(metal_type, weight, true);
    await stockService.logTransaction(metal_type, "JOB_ISSUE", weight, `Queued Melting Job ${job_number}`);

    return formatResponse(res, 201, true, "Melting process queued", { processId });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const startMelting = async (req, res) => {
  try {
    const { process_id, issued_weight, issue_pieces, employee, description } = req.body;
    const weight = parseFloat(issued_weight);
    const pieces = sanitizePieces(issue_pieces);

    if (!process_id || isNaN(weight) || weight <= 0) {
      return formatResponse(res, 400, false, "Invalid issued weight.");
    }

    const process = await meltingService.getMeltingProcessById(process_id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);

    const pendingWeight = process.issue_size || process.issue_weight || 0;
    const delta = weight - pendingWeight;

    if (delta > 0) {
      const currentStock = await stockService.getStockByMetal(process.metal_type);
      if (!currentStock || Math.round(currentStock.opening_stock * 1000) < Math.round(delta * 1000)) {
        return formatResponse(res, 400, false, "Insufficient Opening Stock to increase weight.");
      }
      await stockService.updateOpeningStock(process.metal_type, delta, false);
      await stockService.updateInprocessWeight(process.metal_type, delta, true);
    } else if (delta < 0) {
      await stockService.updateOpeningStock(process.metal_type, Math.abs(delta), true);
      await stockService.updateInprocessWeight(process.metal_type, Math.abs(delta), false);
    }

    await meltingService.startMeltingProcess(process_id, weight, pieces, employee, description);
    return formatResponse(res, 200, true, "Melting process started");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const completeMelting = async (req, res) => {
  try {
    const { process_id, return_items, scrap_weight, description } = req.body;
    const scrW = parseFloat(scrap_weight) || 0;

    if (!process_id || scrW < 0) {
      return formatResponse(res, 400, false, "Invalid input.");
    }

    const process = await meltingService.getMeltingProcessById(process_id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    if (process.status === "COMPLETED") return formatResponse(res, 400, false, "Process already completed.");

    const items = Array.isArray(return_items) && return_items.length > 0 ? return_items : [];
    const totalRetW = items.reduce((sum, item) => sum + (parseFloat(item.return_weight) || 0), 0);
    const totalRetPieces = items.reduce((sum, item) => sum + (parseInt(item.return_pieces) || 0), 0);

    const issW = process.issued_weight || process.issue_size || process.issue_weight || 0;
    const lossWeight = calculateLoss(issW, totalRetW, scrW);

    await meltingService.completeMeltingProcess(
      process_id, totalRetW, totalRetPieces, scrW, lossWeight,
      description !== undefined ? description : null
    );

    // Save return items
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM process_return_items WHERE process_id = ? AND process_type = 'melting'`, [process_id], (err) => err ? reject(err) : resolve());
    });
    for (const item of items) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO process_return_items (process_id, process_type, category, return_weight, return_pieces) VALUES (?, 'melting', ?, ?, ?)`,
          [process_id, item.category || "", parseFloat(item.return_weight) || 0, parseInt(item.return_pieces) || 0],
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    // Return weight goes back to opening_stock (non-packing)
    const retWeightDiff = totalRetW - (process.return_weight || 0);
    if (retWeightDiff > 0) {
      await stockService.updateOpeningStock(process.metal_type, retWeightDiff, true);
    } else if (retWeightDiff < 0) {
      await stockService.updateOpeningStock(process.metal_type, Math.abs(retWeightDiff), false);
    }

    const scrWeightDiff = scrW - (process.scrap_weight || 0);
    if (scrWeightDiff > 0) {
      await stockService.updateOpeningStock(process.metal_type, scrWeightDiff, true);
      await stockService.logTransaction(process.metal_type, "SCRAP_RETURN", scrWeightDiff, `Scrap from Melting Job ${process.job_number || process_id}`);
    } else if (scrWeightDiff < 0) {
      await stockService.updateOpeningStock(process.metal_type, Math.abs(scrWeightDiff), false);
    }

    const lossWeightDiff = lossWeight - (process.loss_weight || 0);
    if (lossWeightDiff !== 0) {
      await stockService.addTotalLoss(process.metal_type, lossWeightDiff);
    }

    // Deduct issued_weight from inprocess on completion
    await stockService.updateInprocessWeight(process.metal_type, issW, false);

    return formatResponse(res, 200, true, "Melting completed successfully", { loss: lossWeight, return_weight: totalRetW });
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

const editMeltingProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const { issued_weight, return_weight, scrap_weight, issue_pieces, return_pieces, return_items, description, employee, category } = req.body;

    const process = await meltingService.getMeltingProcessById(id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);

    const oldIssueSize = process.issue_size || process.issue_weight || 0;
    const oldIssuedWeight = process.issued_weight || oldIssueSize;

    // If return_items array provided, derive aggregate from items
    const hasReturnItems = Array.isArray(return_items) && return_items.length > 0;
    const effectiveReturnWeight = hasReturnItems
      ? return_items.reduce((s, i) => s + (parseFloat(i.return_weight) || 0), 0)
      : return_weight;
    const effectiveReturnPieces = hasReturnItems
      ? return_items.reduce((s, i) => s + (parseInt(i.return_pieces) || 0), 0)
      : return_pieces;

    let updates = {};
    if (description !== undefined) updates.description = description;
    if (employee !== undefined) updates.employee = employee;
    if (category !== undefined) updates.category = category;

    if (process.status === "PENDING") {
      const newSize = issued_weight !== undefined ? parseFloat(issued_weight) : oldIssueSize;
      if (isNaN(newSize) || newSize <= 0) return formatResponse(res, 400, false, "Invalid weight.");
      const delta = newSize - oldIssueSize;
      if (delta > 0) {
        const currentStock = await stockService.getStockByMetal(process.metal_type);
        if (!currentStock || Math.round(currentStock.opening_stock * 1000) < Math.round(delta * 1000)) {
          return formatResponse(res, 400, false, "Insufficient stock for update");
        }
        await stockService.updateOpeningStock(process.metal_type, delta, false);
        await stockService.updateInprocessWeight(process.metal_type, delta, true);
      } else if (delta < 0) {
        await stockService.updateOpeningStock(process.metal_type, Math.abs(delta), true);
        await stockService.updateInprocessWeight(process.metal_type, Math.abs(delta), false);
      }
      updates.issue_size = newSize;
      updates.issue_weight = newSize;
      if (issue_pieces !== undefined) updates.issue_pieces = parseInt(issue_pieces) || 0;

    } else if (process.status === "RUNNING") {
      const newWeight = issued_weight !== undefined ? parseFloat(issued_weight) : oldIssuedWeight;
      if (isNaN(newWeight) || newWeight <= 0) return formatResponse(res, 400, false, "Invalid weight.");
      const delta = newWeight - oldIssuedWeight;
      if (delta > 0) {
        const currentStock = await stockService.getStockByMetal(process.metal_type);
        if (!currentStock || Math.round(currentStock.opening_stock * 1000) < Math.round(delta * 1000)) {
          return formatResponse(res, 400, false, "Insufficient stock for update");
        }
        await stockService.updateOpeningStock(process.metal_type, delta, false);
        await stockService.updateInprocessWeight(process.metal_type, delta, true);
      } else if (delta < 0) {
        await stockService.updateOpeningStock(process.metal_type, Math.abs(delta), true);
        await stockService.updateInprocessWeight(process.metal_type, Math.abs(delta), false);
      }
      updates.issued_weight = newWeight;
      if (issue_pieces !== undefined) updates.issue_pieces = parseInt(issue_pieces) || 0;

    } else if (process.status === "COMPLETED") {
      const newIssuedWeight = issued_weight !== undefined ? parseFloat(issued_weight) : oldIssuedWeight;
      if (isNaN(newIssuedWeight) || newIssuedWeight <= 0) return formatResponse(res, 400, false, "Invalid weight.");
      const newRetWeight = effectiveReturnWeight !== undefined ? parseFloat(effectiveReturnWeight) || 0 : (process.return_weight || 0);
      const newScrWeight = scrap_weight !== undefined ? parseFloat(scrap_weight) || 0 : (process.scrap_weight || 0);
      const newRetPieces = effectiveReturnPieces !== undefined ? parseInt(effectiveReturnPieces) || 0 : (process.return_pieces || 0);
      const newLossWeight = calculateLoss(newIssuedWeight, newRetWeight, newScrWeight);

      const retWeightDiff = newRetWeight - (process.return_weight || 0);
      if (retWeightDiff > 0) await stockService.updateOpeningStock(process.metal_type, retWeightDiff, true);
      else if (retWeightDiff < 0) await stockService.updateOpeningStock(process.metal_type, Math.abs(retWeightDiff), false);

      const scrWeightDiff = newScrWeight - (process.scrap_weight || 0);
      if (scrWeightDiff > 0) await stockService.updateOpeningStock(process.metal_type, scrWeightDiff, true);
      else if (scrWeightDiff < 0) await stockService.updateOpeningStock(process.metal_type, Math.abs(scrWeightDiff), false);

      const lossWeightDiff = newLossWeight - (process.loss_weight || 0);
      if (lossWeightDiff !== 0) await stockService.addTotalLoss(process.metal_type, lossWeightDiff);

      updates.issued_weight = newIssuedWeight;
      updates.issue_weight = newIssuedWeight;
      updates.return_weight = newRetWeight;
      updates.scrap_weight = newScrWeight;
      updates.loss_weight = newLossWeight;
      updates.return_pieces = newRetPieces;
    }

    await meltingService.editMeltingProcess(id, updates);

    // Update process_return_items if new items provided and process is COMPLETED
    if (hasReturnItems && process.status === "COMPLETED") {
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM process_return_items WHERE process_id = ? AND process_type = 'melting'`, [id], (err) => err ? reject(err) : resolve());
      });
      for (const item of return_items) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO process_return_items (process_id, process_type, category, return_weight, return_pieces) VALUES (?, 'melting', ?, ?, ?)`,
            [id, item.category || process.category || '', parseFloat(item.return_weight) || 0, parseInt(item.return_pieces) || 0],
            (err) => err ? reject(err) : resolve()
          );
        });
      }
    }

    return formatResponse(res, 200, true, "Melting process updated.");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const deleteMeltingProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const process = await meltingService.getMeltingProcessById(id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);

    if (process.status === "PENDING") {
      const issueW = process.issue_size || process.issue_weight || 0;
      if (issueW > 0) {
        await stockService.updateOpeningStock(process.metal_type, issueW, true);
        await stockService.updateInprocessWeight(process.metal_type, issueW, false);
        await stockService.logTransaction(process.metal_type, "REVERSAL", issueW, `Deleted Queued Melting Job ${process.job_number || id}`);
      }
    } else if (process.status === "RUNNING") {
      const issueW = process.issued_weight || process.issue_weight || process.issue_size || 0;
      if (issueW > 0) {
        await stockService.updateOpeningStock(process.metal_type, issueW, true);
        await stockService.updateInprocessWeight(process.metal_type, issueW, false);
        await stockService.logTransaction(process.metal_type, "REVERSAL", issueW, `Deleted Running Melting Job ${process.job_number || id}`);
      }
    } else if (process.status === "COMPLETED") {
      // Reverse return/scrap from opening_stock
      if (process.return_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.return_weight, false);
      }
      if (process.scrap_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.scrap_weight, false);
      }
      if (process.loss_weight !== 0) {
        await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
      }
      // Refund original issued weight to opening stock
      const issueW = process.issued_weight || process.issue_weight || 0;
      if (issueW > 0) {
        await stockService.updateOpeningStock(process.metal_type, issueW, true);
        await stockService.logTransaction(process.metal_type, "REVERSAL", issueW, `Deleted Completed Melting Job ${process.job_number || id} (Full Reversal)`);
      }
    }

    await meltingService.deleteMeltingProcess(id);
    return formatResponse(res, 200, true, "Melting process deleted and stock refunded.");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const revertMeltingProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const process = await meltingService.getMeltingProcessById(id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);

    if (process.status === "COMPLETED") {
      // Reverse completion: remove return/scrap from opening_stock, restore inprocess
      if (process.return_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.return_weight, false);
      }
      if (process.scrap_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.scrap_weight, false);
      }
      if (process.loss_weight !== 0) {
        await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
      }
      const issueW = process.issued_weight || process.issue_weight || 0;
      await stockService.updateInprocessWeight(process.metal_type, issueW, true);
      await stockService.logTransaction(process.metal_type, "REVERSAL", issueW, `Reverted Melting Job ${process.job_number || id} to RUNNING`);

      await meltingService.editMeltingProcess(id, {
        return_weight: 0, return_pieces: 0, scrap_weight: 0, loss_weight: 0, status: "RUNNING", end_time: null, completed_at: null,
      });
      return formatResponse(res, 200, true, "Melting process reverted to RUNNING successfully.");

    } else if (process.status === "RUNNING") {
      const issuedW = process.issued_weight || process.issue_weight || 0;
      const issueSize = process.issue_size || process.issue_weight || 0;
      const delta = issuedW - issueSize;
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
      await stockService.logTransaction(process.metal_type, "REVERSAL", Math.abs(delta), `Reverted Melting Job ${process.job_number || id} to PENDING`);
      await meltingService.editMeltingProcess(id, { status: "PENDING", issued_weight: 0, start_time: null });
      return formatResponse(res, 200, true, "Melting process reverted to PENDING.");

    } else if (process.status === "PENDING") {
      const issueW = process.issue_size || process.issue_weight || 0;
      if (issueW > 0) {
        await stockService.updateOpeningStock(process.metal_type, issueW, true);
        await stockService.updateInprocessWeight(process.metal_type, issueW, false);
        await stockService.logTransaction(process.metal_type, "REVERSAL", issueW, `Deleted Queued Melting Job ${process.job_number || id}`);
      }
      await meltingService.deleteMeltingProcess(id);
      return formatResponse(res, 200, true, "Pending melting process queue removed and stock refunded.");
    } else {
      return formatResponse(res, 400, false, "Invalid status for process reversal.");
    }
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
  createMelting,
  startMelting,
  completeMelting,
  getAllMelting,
  editMeltingProcess,
  deleteMeltingProcess,
  revertMeltingProcess,
  getRunningMelts,
};
