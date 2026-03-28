const svgService = require("../services/svgService");
const jobService = require("../services/jobService");
const { formatResponse } = require("../utils/common");

const getInventory = async (req, res) => {
  try {
    const inventory = await svgService.getSvgInventory();
    return formatResponse(res, 200, true, "SVG Inventory fetched", inventory);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const addToSvg = async (req, res) => {
  try {
    const { metal_type, target_product, pieces, weight } = req.body;
    
    if (!metal_type || !target_product || !pieces || !weight) {
      return formatResponse(res, 400, false, "All fields are required");
    }

    // Verify enough stock exists in finished_goods
    const finishedGoods = await jobService.getFinishedGoodsInventory();
    const available = finishedGoods.find(
      (item) => item.metal_type === metal_type && item.target_product === target_product
    );

    if (!available || available.total_pieces < pieces || available.total_weight < weight) {
      return formatResponse(res, 400, false, "Insufficient finished goods available for transfer");
    }

    // Double-entry: Add to SVG, remove from finished_goods
    await svgService.addSvgInventory(metal_type, target_product, pieces, weight);
    await jobService.addFinishedGoods(metal_type, target_product, -pieces, -weight);

    return formatResponse(res, 200, true, "Successfully added to SVG Vault");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const removeFromSvg = async (req, res) => {
  try {
    const { metal_type, target_product, pieces, weight } = req.body;
    
    if (!metal_type || !target_product || !pieces || !weight) {
      return formatResponse(res, 400, false, "All fields are required");
    }

    // Verify enough stock exists in SVG
    const svgInventory = await svgService.getSvgInventory();
    const available = svgInventory.find(
      (item) => item.metal_type === metal_type && item.target_product === target_product
    );

    if (!available || available.total_pieces < pieces || available.total_weight < weight) {
      return formatResponse(res, 400, false, "Insufficient items in SVG to return to Stock");
    }

    // Double-entry: Remove from SVG, add back to finished_goods
    await svgService.addSvgInventory(metal_type, target_product, -pieces, -weight);
    await jobService.addFinishedGoods(metal_type, target_product, pieces, weight);

    return formatResponse(res, 200, true, "Successfully returned to Main Stock");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getInventory,
  addToSvg,
  removeFromSvg,
};
