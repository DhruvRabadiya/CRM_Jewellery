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
      weight,
      pieces,
      category,
      employee,
      description || "",
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
    const { process_id, issued_weight, issue_pieces, employee, description } = req.body;
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

    await rollingService.startRollingProcess(process_id, weight, pieces, employee, description);
    return formatResponse(res, 200, true, "Rolling process started");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const completeRolling = async (req, res) => {
  try {
    const { process_id, return_weight, return_pieces, scrap_weight, description } = req.body;
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
      retP,
      scrW,
      lossWeight,
      description !== undefined ? description : null,
    );

    // Math diff to prevent double counting if weights were previously updated in RUNNING edit
    const retWeightDiff = retW - (process.return_weight || 0);
    if (retWeightDiff > 0) {
      await stockService.updateProcessStock(
        "rolling",
        process.metal_type,
        retWeightDiff,
        true,
      );
    } else if (retWeightDiff < 0) {
      await stockService.updateProcessStock(
        "rolling",
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
        `Scrap from Rolling ${process.job_number}`,
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

    const process = await rollingService.getRollingProcessById(process_id);
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
    } else if (delta < 0) {
      await stockService.updateDhalStock(
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
      // Sync Return Weight -> rolling_stock
      const retWeightDiff = newRetWeight - process.return_weight;
      if (retWeightDiff > 0) {
        await stockService.updateProcessStock(
          "rolling",
          process.metal_type,
          retWeightDiff,
          true,
        );
      } else if (retWeightDiff < 0) {
        await stockService.updateProcessStock(
          "rolling",
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

    await rollingService.editRollingProcessUniversal(process_id, updates);

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

    // RUNNING or COMPLETED Deletion
    if (process.status === "RUNNING" || process.status === "COMPLETED") {
      // 1. Validate and Revert Return Weight from Rolling Pool
      if (process.return_weight > 0) {
        const currentStock = await stockService.getStockByMetal(
          process.metal_type,
        );
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
        await stockService.addTotalLoss(
          process.metal_type,
          -process.loss_weight,
        );
      }

      // 4. Refund Issued Weight to Dhal Stock
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
          `Deleted ${process.status} Rolling Job ${process.job_number} (Full Reversal)`,
        );
      }

      await rollingService.deleteRollingProcessById(process_id);
      return formatResponse(
        res,
        200,
        true,
        `${process.status.charAt(0) + process.status.slice(1).toLowerCase()} rolling process deleted and stock refunded.`,
      );
    }
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const revertRolling = async (req, res) => {
  try {
    const process_id = req.params.id;
    const process = await rollingService.getRollingProcessById(process_id);

    if (!process) return formatResponse(res, 404, false, "Process not found.");

    if (process.status === "COMPLETED") {
      if (process.return_weight > 0) {
        const currentStock = await stockService.getStockByMetal(process.metal_type);
        if (!currentStock || Math.round(currentStock.rolling_stock * 1000) < Math.round(process.return_weight * 1000)) {
           return formatResponse(res, 400, false, "Cannot revert: Downstream has consumed stock from the Rolling pool.");
        }
        await stockService.updateProcessStock("rolling", process.metal_type, process.return_weight, false);
      }
      
      if (process.scrap_weight > 0) {
        await stockService.updateOpeningStock(process.metal_type, process.scrap_weight, false);
      }
      
      if (process.loss_weight > 0) {
        await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
      }

      await stockService.logTransaction(process.metal_type, "REVERSAL", process.issued_weight, `Reverted Rolling Job ${process.job_number} to RUNNING`);

      const updates = {
        status: "RUNNING",
        return_weight: 0,
        return_pieces: 0,
        scrap_weight: 0,
        loss_weight: 0,
        end_time: null,
      };
      await rollingService.editRollingProcessUniversal(process_id, updates);
      return formatResponse(res, 200, true, "Rolling process reverted to RUNNING.");

    } else if (process.status === "RUNNING") {
      const delta = process.issued_weight - process.issue_size;
      
      if (delta > 0) {
         await stockService.updateDhalStock(process.metal_type, delta, true);
      } else if (delta < 0) {
         const currentStock = await stockService.getStockByMetal(process.metal_type);
         if (!currentStock || Math.round(currentStock.dhal_stock * 1000) < Math.round(Math.abs(delta) * 1000)) {
            return formatResponse(res, 400, false, "Cannot revert: Insufficient Dhal stock to restore PENDING issue_size.");
         }
         await stockService.updateDhalStock(process.metal_type, Math.abs(delta), false);
      }

      await stockService.logTransaction(process.metal_type, "REVERSAL", Math.abs(delta), `Reverted Rolling Job ${process.job_number} to PENDING`);

      const updates = {
        status: "PENDING",
        issued_weight: 0,
        start_time: null,
      };
      await rollingService.editRollingProcessUniversal(process_id, updates);
      return formatResponse(res, 200, true, "Rolling process reverted to PENDING.");

    } else if (process.status === "PENDING") {
      if (process.issue_size > 0) {
        await stockService.updateDhalStock(process.metal_type, process.issue_size, true);
        await stockService.logTransaction(
          process.metal_type,
          "REVERSAL",
          process.issue_size,
          `Deleted Queued Rolling Job ${process.job_number}`
        );
      }
      await rollingService.deleteRollingProcessById(process_id);
      return formatResponse(
        res,
        200,
        true,
        "Pending rolling process queue removed and stock refunded.",
      );

    } else {
      return formatResponse(res, 400, false, "Invalid status for process reversal.");
    }
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
  revertRolling,
};
