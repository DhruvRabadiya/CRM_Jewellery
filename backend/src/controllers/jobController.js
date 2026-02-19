const jobService = require("../services/jobService");
const stockService = require("../services/stockService");
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


    if (lossWeight < 0) {
      return formatResponse(
        res,
        400,
        false,
        `Validation Error: Step Return (${retW}) + Scrap (${scrW}) cannot exceed the Input Weight (${issW}).`,
      );
    }

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
        pieces,
        retW,
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
const getActiveJobs = async (req, res) => {
  try {
    const jobs = await jobService.getActiveJobs();
    return formatResponse(res, 200, true, "Active jobs fetched", jobs);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};
module.exports = { createJob, completeStep, getJobDetails,getActiveJobs };
