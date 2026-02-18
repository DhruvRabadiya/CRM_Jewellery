const jobService = require("../services/jobService");
const stockService = require("../services/stockService");
const { calculateLoss, formatResponse } = require("../utils/common");
const {
  MESSAGES,
  TRANSACTION_TYPES,
  JOB_STEPS,
  STATUS,
} = require("../utils/constants");


const createJob = async (req, res) => {
  try {
    const { job_number, metal_type, target_product, issue_weight } = req.body;

 
    if (!job_number || !issue_weight || issue_weight <= 0) {
      return formatResponse(res, 400, false, MESSAGES.INVALID_INPUT);
    }

    const currentStock = await stockService.getStockByMetal(metal_type);
    if (!currentStock || currentStock.dhal_stock < issue_weight) {
      return formatResponse(res, 400, false, MESSAGES.INSUFFICIENT_DHAL);
    }

  

 
    const jobId = await jobService.createJob(
      job_number,
      metal_type,
      target_product,
      JOB_STEPS.ROLLING,
    );

    await stockService.logTransaction(
      metal_type,
      TRANSACTION_TYPES.JOB_ISSUE,
      issue_weight,
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


    if (!job_id || !step_name || return_weight < 0) {
      return formatResponse(res, 400, false, MESSAGES.INVALID_INPUT);
    }

    const job = await jobService.getJobById(job_id);
    if (!job) return formatResponse(res, 404, false, MESSAGES.JOB_NOT_FOUND);

    
    const lossWeight = calculateLoss(issue_weight, return_weight, scrap_weight);

    await jobService.logJobStep(
      job_id,
      step_name,
      issue_weight,
      return_weight,
      scrap_weight,
      lossWeight,
      return_pieces || 0,
    );

    if (scrap_weight > 0) {
      await stockService.updateOpeningStock(job.metal_type, scrap_weight, true);
      await stockService.logTransaction(
        job.metal_type,
        TRANSACTION_TYPES.SCRAP_RETURN,
        scrap_weight,
        `Scrap from Job ${job.job_number} (${step_name})`,
      );
    }

    if (lossWeight > 0) {
      await stockService.addTotalLoss(job.metal_type, lossWeight);
    }

    let nextStep = "";
    let status = STATUS.IN_PROGRESS;

    if (step_name === JOB_STEPS.ROLLING) nextStep = JOB_STEPS.PRESS;
    else if (step_name === JOB_STEPS.PRESS) nextStep = JOB_STEPS.TPP;
    else if (step_name === JOB_STEPS.TPP) nextStep = JOB_STEPS.PACKING;
    else if (step_name === JOB_STEPS.PACKING) {
      nextStep = "COMPLETED";
      status = STATUS.COMPLETED;

      await jobService.addFinishedGoods(
        job.metal_type,
        job.target_product,
        return_pieces,
        return_weight,
      );
    }

    await jobService.updateJobStep(job_id, nextStep, status);

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

module.exports = {
  createJob,
  completeStep,
  getJobDetails,
};
