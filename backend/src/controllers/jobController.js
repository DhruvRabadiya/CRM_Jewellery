const jobService = require("../services/jobService");
const stockService = require("../services/stockService");
const rollingService = require("../services/rollingService");
const pressService = require("../services/pressService");
const tppService = require("../services/tppService");
const packingService = require("../services/packingService");
const { calculateLoss, formatResponse } = require("../utils/common");
const {
  MESSAGES,
  TRANSACTION_TYPES,
  JOB_STEPS,
  STATUS,
} = require("../utils/constants");

// 1. Create Job (Start Production)
const createJob = async (req, res) => {
  try {
    const { job_number, metal_type, target_product, issue_weight } = req.body;
    const weight = parseFloat(issue_weight);

    if (!job_number || isNaN(weight) || weight <= 0) {
      return formatResponse(
        res,
        400,
        false,
        "Invalid input. Weight must be greater than 0.",
      );
    }

    const currentStock = await stockService.getStockByMetal(metal_type);
    if (!currentStock || currentStock.dhal_stock < weight) {
      return formatResponse(res, 400, false, MESSAGES.INSUFFICIENT_DHAL);
    }

    await stockService.updateDhalStock(metal_type, weight, false);
    const jobId = await jobService.createJob(
      job_number,
      metal_type,
      target_product,
      JOB_STEPS.ROLLING,
      weight,
    );
    await stockService.logTransaction(
      metal_type,
      TRANSACTION_TYPES.JOB_ISSUE,
      weight,
      `Issued to Job ${job_number}`,
    );

    return formatResponse(res, 201, true, "Job created successfully", {
      jobId,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const completeStep = async (req, res) => {
  try {
    const {
      job_id,
      step_name,
      issue_weight,
      return_weight,
      scrap_weight,
      return_pieces,
    } = req.body;

    const issW = parseFloat(issue_weight) || 0;
    const retW = parseFloat(return_weight) || 0;
    const scrW = parseFloat(scrap_weight) || 0;
    const pieces = parseInt(return_pieces) || 0;

    if (!job_id || !step_name || retW < 0 || scrW < 0) {
      return formatResponse(res, 400, false, "Invalid weights provided.");
    }

    const job = await jobService.getJobById(job_id);
    if (!job) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);

    const lossWeight = calculateLoss(issW, retW, scrW);

    await jobService.logJobStep(
      job_id,
      step_name,
      issW,
      retW,
      scrW,
      lossWeight,
      pieces,
    );

    if (scrW > 0) {
      await stockService.updateOpeningStock(job.metal_type, scrW, true);
      await stockService.logTransaction(
        job.metal_type,
        TRANSACTION_TYPES.SCRAP_RETURN,
        scrW,
        `Scrap from Job ${job.job_number} (${step_name})`,
      );
    }

    if (lossWeight !== 0) {
      await stockService.addTotalLoss(job.metal_type, lossWeight);
    }

    let nextStep = "";
    let status = "PENDING";

    if (step_name === JOB_STEPS.ROLLING) nextStep = JOB_STEPS.PRESS;
    else if (step_name === JOB_STEPS.PRESS) nextStep = JOB_STEPS.TPP;
    else if (step_name === JOB_STEPS.TPP) nextStep = JOB_STEPS.PACKING;
    else if (step_name === JOB_STEPS.PACKING) {
      nextStep = "COMPLETED";
      status = STATUS.COMPLETED;
      await jobService.addFinishedGoods(
        job.metal_type,
        job.target_product,
        pieces,
        retW,
      );
    }

    await jobService.updateJobStep(job_id, nextStep, status, retW);
    return formatResponse(res, 200, true, "Step completed successfully", {
      nextStep,
      loss: lossWeight,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getJobDetails = async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = await jobService.getJobById(jobId);
    const lastStep = await jobService.getLastStep(jobId);
    return formatResponse(res, 200, true, "Job details fetched", {
      job,
      lastStep,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};
const getActiveJobs = async (req, res) => {
  try {
    const jobs = await jobService.getActiveJobs();
    return formatResponse(res, 200, true, "Active jobs fetched", jobs);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};
// Get Next Serial Job ID
const getNextJobId = async (req, res) => {
  try {
    const nextJobNumber = await jobService.getNextJobNumber();
    return formatResponse(res, 200, true, "Next job ID generated", {
      next_job_number: nextJobNumber,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};
const getFinishedGoods = async (req, res) => {
  try {
    const inventory = await jobService.getFinishedGoodsInventory();
    return formatResponse(res, 200, true, "Finished goods fetched", inventory);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};
const startJobStep = async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return formatResponse(res, 400, false, "Job ID required");
    await jobService.startJobStep(job_id);
    return formatResponse(res, 200, true, "Machine started successfully");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};
const getCombinedProcesses = async (req, res) => {
  try {
    const rolling = await rollingService.getAllRollingProcesses();
    const press = await pressService.getAllPressProcesses();
    const tpp = await tppService.getAllTppProcesses();
    const packing = await packingService.getAllPackingProcesses();

    const addStage = (arr, stageName) =>
      arr.map((item) => ({ ...item, stage: stageName }));

    const combined = [
      ...addStage(rolling, "Rolling"),
      ...addStage(press, "Press"),
      ...addStage(tpp, "TPP"),
      ...addStage(packing, "Packing"),
    ];

    combined.sort((a, b) => new Date(b.date) - new Date(a.date));

    return formatResponse(
      res,
      200,
      true,
      "Combined processes fetched",
      combined,
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

// --- SERVICE MAP HELPER ---
const getServiceMap = () => ({
  Rolling: {
    getById: rollingService.getRollingProcessById,
    deleteById: rollingService.deleteRollingProcessById,
    sourcePool: "dhal", // Rolling takes from dhal_stock
    outputPool: "rolling", // Rolling outputs to rolling_stock
    updateSourceStock: (metal, weight, isAdd) =>
      stockService.updateDhalStock(metal, weight, isAdd),
    updateOutputStock: (metal, weight, isAdd) =>
      stockService.updateProcessStock("rolling", metal, weight, isAdd),
  },
  Press: {
    getById: pressService.getPressProcessById,
    deleteById: pressService.deletePressProcessById,
    sourcePool: "rolling", // Press takes from rolling_stock
    outputPool: "press", // Press outputs to press_stock
    updateSourceStock: (metal, weight, isAdd) =>
      stockService.updateProcessStock("rolling", metal, weight, isAdd),
    updateOutputStock: (metal, weight, isAdd) =>
      stockService.updateProcessStock("press", metal, weight, isAdd),
  },
  TPP: {
    getById: tppService.getTppProcessById,
    deleteById: tppService.deleteTppProcessById,
    sourcePool: "press", // TPP takes from press_stock
    outputPool: "tpp", // TPP outputs to tpp_stock
    updateSourceStock: (metal, weight, isAdd) =>
      stockService.updateProcessStock("press", metal, weight, isAdd),
    updateOutputStock: (metal, weight, isAdd) =>
      stockService.updateProcessStock("tpp", metal, weight, isAdd),
  },
  Packing: {
    getById: packingService.getPackingProcessById,
    deleteById: packingService.deletePackingProcessById,
    sourcePool: "tpp", // Packing takes from tpp_stock
    outputPool: null, // Packing outputs to finished_goods (special)
    updateSourceStock: (metal, weight, isAdd) =>
      stockService.updateProcessStock("tpp", metal, weight, isAdd),
    updateOutputStock: null,
  },
});

// Reverse a COMPLETED process back to its previous stage's pool
const reverseProcess = async (req, res) => {
  try {
    const { stage, process_id } = req.body;

    if (!stage || !process_id) {
      return formatResponse(res, 400, false, "Stage and process_id are required.");
    }

    const serviceMap = getServiceMap();
    const stageConfig = serviceMap[stage];
    if (!stageConfig) {
      return formatResponse(res, 400, false, "Invalid stage.");
    }

    const process = await stageConfig.getById(process_id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    if (process.status !== STATUS.COMPLETED) {
      return formatResponse(res, 400, false, "Only COMPLETED processes can be reversed.");
    }

    // 1. Remove return_weight from current stage's output pool
    if (stageConfig.updateOutputStock && process.return_weight > 0) {
      await stageConfig.updateOutputStock(process.metal_type, process.return_weight, false);
    }

    // 2. For Packing, we need to remove from finished_goods instead
    if (stage === "Packing" && process.return_weight > 0) {
      // Remove pieces/weight from finished_goods
      await jobService.removeFinishedGoods(
        process.metal_type,
        process.category,
        process.return_pieces || 0,
        process.return_weight,
      );
    }

    // 3. Return issued weight back to source pool
    if (process.issued_weight > 0) {
      await stageConfig.updateSourceStock(process.metal_type, process.issued_weight, true);
    }

    // 4. Reverse scrap from opening stock
    if (process.scrap_weight > 0) {
      await stockService.updateOpeningStock(process.metal_type, process.scrap_weight, false);
    }

    // 5. Reverse loss from total
    if (process.loss_weight > 0) {
      await stockService.addTotalLoss(process.metal_type, -process.loss_weight);
    }

    // 6. Log the reversal
    await stockService.logTransaction(
      process.metal_type,
      "REVERSAL",
      process.issued_weight,
      `Reversed ${stage} Job ${process.job_number} back to ${stageConfig.sourcePool}_stock`,
    );

    // 7. Delete the process record
    await stageConfig.deleteById(process_id);

    return formatResponse(res, 200, true, `${stage} process reversed successfully. Weight returned to ${stageConfig.sourcePool} stock.`);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

// Edit a COMPLETED process (adjust return/scrap weights)
const editCompletedProcess = async (req, res) => {
  try {
    const { stage, process_id, return_weight, scrap_weight, return_pieces } = req.body;
    const newRetW = parseFloat(return_weight) || 0;
    const newScrW = parseFloat(scrap_weight) || 0;
    const newPieces = parseInt(return_pieces) || 0;

    if (!stage || !process_id) {
      return formatResponse(res, 400, false, "Stage and process_id are required.");
    }
    if (newRetW < 0 || newScrW < 0) {
      return formatResponse(res, 400, false, "Weights cannot be negative.");
    }

    const serviceMap = getServiceMap();
    const stageConfig = serviceMap[stage];
    if (!stageConfig) {
      return formatResponse(res, 400, false, "Invalid stage.");
    }

    const process = await stageConfig.getById(process_id);
    if (!process) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);
    if (process.status !== STATUS.COMPLETED) {
      return formatResponse(res, 400, false, "Only COMPLETED processes can be edited with this endpoint.");
    }

    const issW = process.issued_weight;
    const newLoss = calculateLoss(issW, newRetW, newScrW);
    if (newLoss < 0) {
      return formatResponse(res, 400, false, `Return (${newRetW}) + Scrap (${newScrW}) cannot exceed Issued Weight (${issW}).`);
    }

    const oldRetW = process.return_weight;
    const oldScrW = process.scrap_weight;
    const oldLoss = process.loss_weight;

    // Adjust output pool (return weight diff)
    const retDiff = newRetW - oldRetW;
    if (retDiff !== 0 && stageConfig.updateOutputStock) {
      await stageConfig.updateOutputStock(process.metal_type, Math.abs(retDiff), retDiff > 0);
    }

    // For Packing, adjust finished_goods
    if (stage === "Packing" && retDiff !== 0) {
      const oldPieces = process.return_pieces || 0;
      const piecesDiff = newPieces - oldPieces;
      if (retDiff > 0) {
        await jobService.addFinishedGoods(process.metal_type, process.category, piecesDiff > 0 ? piecesDiff : 0, retDiff);
      } else {
        await jobService.removeFinishedGoods(process.metal_type, process.category, piecesDiff < 0 ? Math.abs(piecesDiff) : 0, Math.abs(retDiff));
      }
    }

    // Adjust scrap in opening stock
    const scrDiff = newScrW - oldScrW;
    if (scrDiff !== 0) {
      await stockService.updateOpeningStock(process.metal_type, Math.abs(scrDiff), scrDiff > 0);
    }

    // Adjust total loss
    const lossDiff = newLoss - oldLoss;
    if (lossDiff !== 0) {
      await stockService.addTotalLoss(process.metal_type, lossDiff);
    }

    // Update the DB record using stage-specific service
    const updateCompletedMap = {
      Rolling: rollingService.completeRollingProcess,
      Press: pressService.completePressProcess,
      TPP: tppService.completeTppProcess,
      Packing: packingService.completePackingProcess,
    };

    await updateCompletedMap[stage](process_id, newRetW, newScrW, newLoss);

    return formatResponse(res, 200, true, `${stage} completed process updated successfully.`, {
      loss: newLoss,
      return_adjusted: retDiff,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createJob,
  completeStep,
  getJobDetails,
  getActiveJobs,
  getNextJobId,
  getFinishedGoods,
  startJobStep,
  getCombinedProcesses,
  reverseProcess,
  editCompletedProcess,
};
