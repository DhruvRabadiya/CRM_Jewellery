const svc = require("../services/orderBillService");
const { formatResponse } = require("../utils/common");

const handleEstimateError = (res, err) => {
  if (err?.statusCode) {
    return formatResponse(res, err.statusCode, false, err.message, err.details || null);
  }

  if (err?.message?.includes("SQLITE_ERROR") && err?.message?.includes("no column named")) {
    return formatResponse(
      res,
      500,
      false,
      "Estimate database schema is out of date. Please restart the backend/app once so the latest migrations can run."
    );
  }

  if (err?.message?.includes("SQLITE_CONSTRAINT")) {
    return formatResponse(res, 409, false, "A conflicting estimate record already exists");
  }

  return formatResponse(res, 500, false, "An unexpected error occurred while processing the estimate");
};

const getNextNo = async (req, res) => {
  try {
    const next = await svc.getNextObNo();
    return formatResponse(res, 200, true, "Next estimate number", { ob_no: next });
  } catch (err) {
    return handleEstimateError(res, err);
  }
};

const listBills = async (req, res) => {
  try {
    const bills = await svc.listBills();
    return formatResponse(res, 200, true, "Estimates fetched", bills);
  } catch (err) {
    return handleEstimateError(res, err);
  }
};

const getBill = async (req, res) => {
  try {
    const bill = await svc.getBillById(req.params.id);
    if (!bill) return formatResponse(res, 404, false, "Estimate not found");
    return formatResponse(res, 200, true, "Estimate fetched", bill);
  } catch (err) {
    return handleEstimateError(res, err);
  }
};

const createBill = async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return formatResponse(res, 400, false, "date is required");
    const id = await svc.createBill(req.body);
    const bill = await svc.getBillById(id);
    return formatResponse(res, 201, true, "Estimate created", bill);
  } catch (err) {
    return handleEstimateError(res, err);
  }
};

const updateBill = async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return formatResponse(res, 400, false, "date is required");
    await svc.updateBill(req.params.id, req.body);
    const bill = await svc.getBillById(req.params.id);
    if (!bill) return formatResponse(res, 404, false, "Estimate not found");
    return formatResponse(res, 200, true, "Estimate updated", bill);
  } catch (err) {
    return handleEstimateError(res, err);
  }
};

const deleteBill = async (req, res) => {
  try {
    const changes = await svc.deleteBill(req.params.id);
    if (!changes) return formatResponse(res, 404, false, "Estimate not found");
    return formatResponse(res, 200, true, "Estimate deleted");
  } catch (err) {
    return handleEstimateError(res, err);
  }
};

module.exports = { getNextNo, listBills, getBill, createBill, updateBill, deleteBill };
