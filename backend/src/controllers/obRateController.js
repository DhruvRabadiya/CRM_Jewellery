const svc = require("../services/obRateService");
const { formatResponse } = require("../utils/common");

const getAll = async (req, res) => {
  try {
    const rates = await svc.getAllRates();
    return formatResponse(res, 200, true, "OB labour rates fetched", rates);
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

// Expects body: { updates: [{ id, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }] }
const bulkUpdate = async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0)
      return formatResponse(res, 400, false, "updates array is required");
    const result = await svc.bulkUpdate(updates);
    return formatResponse(res, 200, true, "OB labour rates updated", result);
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

// Expects body: { metal_type, size_label, size_value?, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }
const add = async (req, res) => {
  try {
    const { metal_type, size_label, size_value, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale } = req.body;
    if (!metal_type || !size_label?.trim())
      return formatResponse(res, 400, false, "metal_type and size_label are required");
    const result = await svc.addRate({
      metal_type,
      size_label: size_label.trim(),
      size_value,
      lc_pp_retail,
      lc_pp_showroom,
      lc_pp_wholesale,
    });
    return formatResponse(res, 201, true, "Rate added", result);
  } catch (err) {
    const isDuplicate = err.message?.includes("UNIQUE constraint failed");
    return formatResponse(
      res,
      isDuplicate ? 409 : 500,
      false,
      isDuplicate
        ? `Size "${req.body.size_label}" already exists for ${req.body.metal_type}`
        : err.message
    );
  }
};

// DELETE /ob-rates/:id
const remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return formatResponse(res, 400, false, "Invalid id");
    const result = await svc.deleteRate(id);
    if (!result.deleted) return formatResponse(res, 404, false, "Rate not found");
    return formatResponse(res, 200, true, "Rate deleted");
  } catch (err) {
    return formatResponse(res, 500, false, err.message);
  }
};

module.exports = { getAll, bulkUpdate, add, remove };
