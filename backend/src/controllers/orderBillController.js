const svc = require("../services/orderBillService");
const { formatResponse } = require("../utils/common");

const getNextNo = async (req, res) => {
  try {
    const next = await svc.getNextObNo();
    return formatResponse(res, 200, true, "Next OB number", { ob_no: next });
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

const listBills = async (req, res) => {
  try {
    const bills = await svc.listBills();
    return formatResponse(res, 200, true, "Order bills fetched", bills);
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

const getBill = async (req, res) => {
  try {
    const bill = await svc.getBillById(req.params.id);
    if (!bill) return formatResponse(res, 404, false, "Order bill not found");
    return formatResponse(res, 200, true, "Order bill fetched", bill);
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
    return formatResponse(res, 201, true, "Order bill created", bill);
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
    if (!bill) return formatResponse(res, 404, false, "Order bill not found");
    return formatResponse(res, 200, true, "Order bill updated", bill);
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

const deleteBill = async (req, res) => {
  try {
    const changes = await svc.deleteBill(req.params.id);
    if (!changes) return formatResponse(res, 404, false, "Order bill not found");
    return formatResponse(res, 200, true, "Order bill deleted");
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

module.exports = { getNextNo, listBills, getBill, createBill, updateBill, deleteBill };
