const packingService = require("../services/packingService");
const stockService = require("../services/stockService");
const { calculateLoss, formatResponse } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES, STATUS } = require("../utils/constants");

const createPacking = async (req, res) => {
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
      description,
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
      Math.round(currentStock.tpp_stock * 1000) < Math.round(weight * 1000)
    ) {
      return formatResponse(
        res,
        400,
        false,
        "Insufficient pooled TPP Stock available to queue this job.",
      );
    }

    const processId = await packingService.createPackingProcess(
      job_number,
      metal_type,
      unit,
      weight,
      pieces,
      category,
      employee,
      description || "",
    );

    // DEDUCT IMMEDIATELY UPON CREATION
    await stockService.updateProcessStock("tpp", metal_type, weight, false);
    await stockService.logTransaction(
      metal_type,
      TRANSACTION_TYPES.JOB_ISSUE,
      weight,
      `Queued Packing Job ${job_number}`,
    );

    return formatResponse(res, 201, true, "Packing process queued", {
      processId,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const startPacking = async (req, res) => {
  try {
    const { process_id, issued_weight, issue_pieces, employee, description } = req.body;
    const weight = parseFloat(issued_weight);
    const pieces = parseInt(issue_pieces) || 0;
    if (!process_id || isNaN(weight) || weight <= 0)
      return formatResponse(res, 400, false, "Invalid issued weight.");

    const process = await packingService.getPackingProcessById(process_id);
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
        Math.round(currentStock.tpp_stock * 1000) < Math.round(delta * 1000)
      ) {
        return formatResponse(
          res,
          400,
          false,
          "Insufficient pooled TPP Stock to increase weight.",
        );
      }
      await stockService.updateProcessStock(
        "tpp",
        process.metal_type,
        delta,
        false,
      );
      await stockService.logTransaction(
        process.metal_type,
        "ADJUSTMENT",
        delta,
        `Start delta adjustment (added) for Packing Job ${process.job_number}`,
      );
    } else if (delta < 0) {
      await stockService.updateProcessStock(
        "tpp",
        process.metal_type,
        Math.abs(delta),
        true,
      );
      await stockService.logTransaction(
        process.metal_type,
        "ADJUSTMENT",
        Math.abs(delta),
        `Start delta adjustment (refunded) for Packing Job ${process.job_number}`,
      );
    }

    await packingService.startPackingProcess(process_id, weight, pieces, employee, description);
    return formatResponse(res, 200, true, "Packing process started");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const completePacking = async (req, res) => {
  try {
    const { process_id, return_weight, scrap_weight, return_pieces, description } = req.body;
    const retW = parseFloat(return_weight) || 0;
    const retP = parseInt(return_pieces) || 0;
    const scrW = parseFloat(scrap_weight) || 0;
    const pieces = retP; // Packing currently expects just `pieces` for Finished Goods creation.

    if (!process_id || retW < 0 || scrW < 0)
      return formatResponse(res, 400, false, "Invalid weights.");
    if (pieces < 0) return formatResponse(res, 400, false, "Invalid pieces.");

    const process = await packingService.getPackingProcessById(process_id);
    if (!process)
      return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    if (process.status === STATUS.COMPLETED)
      return formatResponse(res, 400, false, "Process already completed.");

    const issW = process.issued_weight;
    const lossWeight = calculateLoss(issW, retW, scrW);

    await packingService.completePackingProcess(
      process_id,
      retW,
      retP,
      scrW,
      lossWeight,
      description !== undefined ? description : null,
    );

    // Remove old finished goods if it was retroactively added while RUNNING
    const oldRetW = process.return_weight || 0;
    if (oldRetW > 0) {
      await packingService.removeFinishedGoods(
        process.metal_type,
        process.category,
        oldRetW,
      );
    }
    await packingService.addFinishedGoods(
      process.metal_type,
      process.category,
      retP,
      retW,
    );

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
        `Scrap from Packing ${process.job_number}`,
      );
    } else if (scrWeightDiff < 0) {
      await stockService.updateOpeningStock(
        process.metal_type,
        Math.abs(scrWeightDiff),
        false,
      );
    }

    if (lossWeight !== 0)
      await stockService.addTotalLoss(process.metal_type, lossWeight);

    return formatResponse(
      res,
      200,
      true,
      "Packing completed. Finished Goods added.",
      { loss: lossWeight },
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getAllPacking = async (req, res) => {
  try {
    const processes = await packingService.getAllPackingProcesses();
    return formatResponse(
      res,
      200,
      true,
      "Packing processes fetched",
      processes,
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const editPacking = async (req, res) => {
  try {
    const process_id = req.params.id;
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

    if (!process_id || isNaN(newWeight) || newWeight <= 0) {
      return formatResponse(res, 400, false, "Invalid issued weight.");
    }

    const process = await packingService.getPackingProcessById(process_id);
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
    }

    if (delta > 0) {
      const currentStock = await stockService.getStockByMetal(
        process.metal_type,
      );
      if (
        !currentStock ||
        Math.round(currentStock.tpp_stock * 1000) < Math.round(delta * 1000)
      ) {
        return formatResponse(
          res,
          400,
          false,
          "Insufficient pooled TPP Stock to increase issued weight.",
        );
      }
      await stockService.updateProcessStock(
        "tpp",
        process.metal_type,
        delta,
        false,
      );
    } else if (delta < 0) {
      await stockService.updateProcessStock(
        "tpp",
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
    if (req.body.category !== undefined) {
      updates.category = req.body.category;
    }
    if (description !== undefined) {
      updates.description = description;
    }
    if (employee !== undefined) {
      updates.employee = employee;
    }

    if (process.status === "COMPLETED") {
      // Re-create the Finished Goods Record if Return Weight or Return Pieces or Category changed
      if (
        newRetWeight !== process.return_weight ||
        newPieces !== process.return_pieces ||
        req.body.category !== undefined
      ) {
        if ((process.return_weight || 0) > 0) {
          // Delete the heuristic old row
          await packingService.removeFinishedGoods(
            process.metal_type,
            process.category,
            process.return_weight,
          );
        }
        if (newRetWeight > 0) {
          // Add new finished goods
          await packingService.addFinishedGoods(
            process.metal_type,
            updates.category || process.category,
            newPieces,
            newRetWeight,
          );
        }
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

      // Sync exact gain/loss ledger differences
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

    await packingService.editPackingProcessUniversal(process_id, updates);

    return formatResponse(
      res,
      200,
      true,
      "Packing process updated successfully.",
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const deletePacking = async (req, res) => {
  try {
    const process_id = req.params.id;
    const process = await packingService.getPackingProcessById(process_id);

    if (!process) return formatResponse(res, 404, false, "Process not found.");

    // PENDING Deletion
    if (process.status === "PENDING") {
      if (process.issue_size > 0) {
        await stockService.updateProcessStock(
          "tpp",
          process.metal_type,
          process.issue_size,
          true,
        );
        await stockService.logTransaction(
          process.metal_type,
          "REVERSAL",
          process.issue_size,
          `Deleted Queued Packing Job ${process.job_number}`,
        );
      }
      await packingService.deletePackingProcessById(process_id);
      return formatResponse(
        res,
        200,
        true,
        "Pending packing process deleted and stock refunded.",
      );
    }

    // RUNNING or COMPLETED Deletion
    if (process.status === "RUNNING" || process.status === "COMPLETED") {
      // 1. Revert Output from Finished Goods pool
      if (process.return_weight > 0) {
        await packingService.removeFinishedGoods(
          process.metal_type,
          process.category,
          process.return_weight,
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

      // 3. Revert Loss/Gain Weight
      if (process.loss_weight !== 0) {
        await stockService.addTotalLoss(
          process.metal_type,
          -process.loss_weight,
        );
      }

      // 4. Refund Issued Weight to TPP Pool
      if (process.issued_weight > 0) {
        await stockService.updateProcessStock(
          "tpp",
          process.metal_type,
          process.issued_weight,
          true,
        );
        await stockService.logTransaction(
          process.metal_type,
          "REVERSAL",
          process.issued_weight,
          `Deleted ${process.status} Packing Job ${process.job_number} (Full Reversal)`,
        );
      }

      await packingService.deletePackingProcessById(process_id);
      return formatResponse(
        res,
        200,
        true,
        `${process.status.charAt(0) + process.status.slice(1).toLowerCase()} packing process deleted and stock refunded.`,
      );
    }
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const revertPacking = async (req, res) => {
  try {
    const process_id = req.params.id;
    const process = await packingService.getPackingProcessById(process_id);

    if (!process) return formatResponse(res, 404, false, "Process not found.");

    if (process.status === "COMPLETED") {
      if (process.return_weight > 0) {
        // Packing outputs directly to Finished Goods. We remove it from there.
        await packingService.removeFinishedGoods(
          process.metal_type,
          process.category,
          process.return_weight,
        );
      }
      
      if (process.scrap_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.scrap_weight, false);
      }
      
      if (process.loss_weight !== 0) {
        await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
      }

      await stockService.logTransaction(process.metal_type, "REVERSAL", process.issued_weight, `Reverted Packing Job ${process.job_number} to RUNNING`);

      const updates = {
        status: "RUNNING",
        return_weight: 0,
        return_pieces: 0,
        scrap_weight: 0,
        loss_weight: 0,
        end_time: null,
      };
      await packingService.editPackingProcessUniversal(process_id, updates);
      return formatResponse(res, 200, true, "Packing process reverted to RUNNING.");

    } else if (process.status === "RUNNING") {
      const delta = process.issued_weight - process.issue_size;
      
      if (delta > 0) {
         await stockService.updateProcessStock("tpp", process.metal_type, delta, true);
      } else if (delta < 0) {
         const currentStock = await stockService.getStockByMetal(process.metal_type);
         if (!currentStock || Math.round(currentStock.tpp_stock * 1000) < Math.round(Math.abs(delta) * 1000)) {
            return formatResponse(res, 400, false, "Cannot revert: Insufficient TPP stock to restore PENDING issue_size.");
         }
         await stockService.updateProcessStock("tpp", process.metal_type, Math.abs(delta), false);
      }

      await stockService.logTransaction(process.metal_type, "REVERSAL", Math.abs(delta), `Reverted Packing Job ${process.job_number} to PENDING`);

      const updates = {
        status: "PENDING",
        issued_weight: 0,
        start_time: null,
      };
      await packingService.editPackingProcessUniversal(process_id, updates);
      return formatResponse(res, 200, true, "Packing process reverted to PENDING.");

    } else if (process.status === "PENDING") {
      if (process.issue_size > 0) {
        await stockService.updateProcessStock("tpp", process.metal_type, process.issue_size, true);
        await stockService.logTransaction(
          process.metal_type,
          "REVERSAL",
          process.issue_size,
          `Deleted Queued Packing Job ${process.job_number}`
        );
      }
      await packingService.deletePackingProcessById(process_id);
      return formatResponse(
        res,
        200,
        true,
        "Pending packing process queue removed and stock refunded.",
      );

    } else {
      return formatResponse(res, 400, false, "Invalid status for process reversal.");
    }
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createPacking,
  startPacking,
  completePacking,
  getAllPacking,
  editPacking,
  deletePacking,
  revertPacking,
};
