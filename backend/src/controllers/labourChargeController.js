const svc = require("../services/labourChargeService");
const { formatResponse } = require("../utils/common");

const getAll = async (req, res) => {
  try {
    let data;
    if (req.query.grouped === "1" || req.query.grouped === "true") {
      data = await svc.getGrouped();
    } else if (req.query.metal) {
      data = await svc.getByMetal(req.query.metal);
    } else {
      data = await svc.getAll();
    }
    return formatResponse(res, 200, true, "Labour charges fetched", data);
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

const _validateBody = (body) => {
  if (! body.metal_type || ! body.metal_type.trim()) return "metal_type is required";
  if (! body.size_label || ! body.size_label.trim()) return "size_label is required";
  if (body.lc_pp_retail != null && isNaN(parseFloat(body.lc_pp_retail))) return "lc_pp_retail must be a number";
  if (body.lc_pp_showroom != null && isNaN(parseFloat(body.lc_pp_showroom))) return "lc_pp_showroom must be a number";
  if (body.lc_pp_wholesale != null && isNaN(parseFloat(body.lc_pp_wholesale))) return "lc_pp_wholesale must be a number";
  return null;
};

const create = async (req, res) => {
  try {
    const err = _validateBody(req.body);
    if (err) return formatResponse(res, 400, false, err);
    const row = await svc.create(req.body);
    return formatResponse(res, 201, true, "Labour charge created", row);
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE")) {
      return formatResponse(res, 409, false, "A labour charge for this metal, category and size already exists");
    }
    return formatResponse(res, 500, false, err.message);
  }
};

const update = async (req, res) => {
  try {
    const err = _validateBody(req.body);
    if (err) return formatResponse(res, 400, false, err);
    const row = await svc.update(req.params.id, req.body);
    return formatResponse(res, 200, true, "Labour charge updated", row);
  } catch (err) {
    if (err.message === "Labour charge not found") return formatResponse(res, 404, false, err.message);
    if (err.message && err.message.includes("UNIQUE")) {
      return formatResponse(res, 409, false, "A labour charge for this metal, category and size already exists");
    }
    return formatResponse(res, 500, false, err.message);
  }
};

const bulkUpdate = async (req, res) => {
  try {
    const updates = Array.isArray(req.body) ? req.body : req.body.updates;
    if (! Array.isArray(updates)) {
      return formatResponse(res, 400, false, "updates must be an array");
    }
    for (const u of updates) {
      if (u.id == null) return formatResponse(res, 400, false, "Each update requires an id");
      if (u.lc_pp_retail != null && isNaN(parseFloat(u.lc_pp_retail))) return formatResponse(res, 400, false, "lc_pp_retail must be a number");
      if (u.lc_pp_showroom != null && isNaN(parseFloat(u.lc_pp_showroom))) return formatResponse(res, 400, false, "lc_pp_showroom must be a number");
      if (u.lc_pp_wholesale != null && isNaN(parseFloat(u.lc_pp_wholesale))) return formatResponse(res, 400, false, "lc_pp_wholesale must be a number");
    }
    const result = await svc.bulkUpdateRates(updates);
    return formatResponse(res, 200, true, "Labour charges updated", result);
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

const remove = async (req, res) => {
  try {
    const result = await svc.remove(req.params.id);
    return formatResponse(res, 200, true, "Labour charge deleted", result);
  } catch (err) {
    if (err.message === "Labour charge not found") return formatResponse(res, 404, false, err.message);
    return formatResponse(res, 500, false, err.message);
  }
};

module.exports = { getAll, create, update, bulkUpdate, remove };
