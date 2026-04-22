const svc = require("../services/sellingBillService");
const { formatResponse } = require("../utils/common");

const getNextNo = async (req, res) => {
  try {
    const next = await svc.getNextBillNo();
    return formatResponse(res, 200, true, "Next bill number", { bill_no: next });
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

const listBills = async (req, res) => {
  try {
    const bills = await svc.listBills();
    return formatResponse(res, 200, true, "Bills fetched", bills);
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

const getBill = async (req, res) => {
  try {
    const bill = await svc.getBillById(req.params.id);
    if (!bill) return formatResponse(res, 404, false, "Bill not found");
    return formatResponse(res, 200, true, "Bill fetched", bill);
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

const createBill = async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return formatResponse(res, 400, false, "date is required");
    const id = await svc.createBill(req.body);
    const bill = await svc.getBillById(id);
    return formatResponse(res, 201, true, "Bill created", bill);
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

const updateBill = async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return formatResponse(res, 400, false, "date is required");
    await svc.updateBill(req.params.id, req.body);
    const bill = await svc.getBillById(req.params.id);
    if (!bill) return formatResponse(res, 404, false, "Bill not found");
    return formatResponse(res, 200, true, "Bill updated", bill);
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

const deleteBill = async (req, res) => {
  try {
    const changes = await svc.deleteBill(req.params.id);
    if (!changes) return formatResponse(res, 404, false, "Bill not found");
    return formatResponse(res, 200, true, "Bill deleted");
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

module.exports = { getNextNo, listBills, getBill, createBill, updateBill, deleteBill };
