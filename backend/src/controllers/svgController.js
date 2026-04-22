const svgService = require("../services/svgService");
const counterService = require("../services/counterService");
const { formatResponse, isValidMetalType, sanitizePieces } = require("../utils/common");

/**
 * Parse the unit weight (grams) from a category/target_product string.
 * Examples: "1 gm" → 1, "0.05gm" → 0.05, "10g -C|B" → 10, "Mix" → null
 */
const parseUnitWeight = (category) => {
  if (!category) return null;
  const trimmed = category.trim();
  if (trimmed === "Mix" || trimmed === "Other") return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
};

const getInventory = async (req, res) => {
  try {
    const inventory = await svgService.getSvgInventory();
    return formatResponse(res, 200, true, "SVG Inventory fetched", inventory);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

/**
 * Add to SVG Vault — moves items FROM the Selling Counter INTO the SVG vault.
 * Counter → SVG
 */
const addToSvg = async (req, res) => {
  try {
    const { metal_type, target_product, pieces } = req.body;

    if (!metal_type || !target_product || pieces == null) {
      return formatResponse(res, 400, false, "metal_type, target_product, and pieces are required");
    }

    if (!isValidMetalType(metal_type)) {
      return formatResponse(res, 400, false, "Invalid metal type");
    }

    const piecesToMove = sanitizePieces(pieces);
    if (piecesToMove <= 0) {
      return formatResponse(res, 400, false, "Pieces must be greater than zero");
    }

    // Verify enough stock exists in the Selling Counter
    const counterInventory = await counterService.getCounterInventory();
    const available = counterInventory.find(
      (item) => item.metal_type === metal_type && item.target_product === target_product
    );

    if (!available || available.total_pieces < piecesToMove) {
      return formatResponse(res, 400, false, "Insufficient items at the counter for transfer to vault");
    }

    // Calculate weight using unit weight parsing
    const unitWeight = parseUnitWeight(target_product);
    const weight = unitWeight != null
      ? piecesToMove * unitWeight
      : 0; // Mix/Other items get 0 weight in SVG — proportional not reliable

    // Double-entry: Remove from Counter, Add to SVG Vault
    await counterService.addCounterInventory(metal_type, target_product, -piecesToMove);
    await svgService.addSvgInventory(metal_type, target_product, piecesToMove, weight);

    return formatResponse(res, 200, true, `Successfully moved ${piecesToMove} pieces to SVG Vault`);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

/**
 * Remove from SVG Vault — moves items FROM the SVG vault BACK TO the Selling Counter.
 * SVG → Counter
 */
const removeFromSvg = async (req, res) => {
  try {
    const { metal_type, target_product, pieces } = req.body;

    if (!metal_type || !target_product || pieces == null) {
      return formatResponse(res, 400, false, "metal_type, target_product, and pieces are required");
    }

    if (!isValidMetalType(metal_type)) {
      return formatResponse(res, 400, false, "Invalid metal type");
    }

    const piecesToMove = sanitizePieces(pieces);
    if (piecesToMove <= 0) {
      return formatResponse(res, 400, false, "Pieces must be greater than zero");
    }

    // Verify enough stock exists in SVG Vault
    const svgInventory = await svgService.getSvgInventory();
    const available = svgInventory.find(
      (item) => item.metal_type === metal_type && item.target_product === target_product
    );

    if (!available || available.total_pieces < piecesToMove) {
      return formatResponse(res, 400, false, "Insufficient items in SVG Vault");
    }

    // Calculate weight to remove — use unit weight or proportional from SVG stock
    const unitWeight = parseUnitWeight(target_product);
    let weight = 0;
    if (unitWeight != null) {
      weight = piecesToMove * unitWeight;
    } else if (available.total_pieces > 0 && available.total_weight > 0) {
      weight = (piecesToMove / available.total_pieces) * available.total_weight;
    }

    // Double-entry: Remove from SVG, Add back to Counter
    await svgService.addSvgInventory(metal_type, target_product, -piecesToMove, -weight);
    await counterService.addCounterInventory(metal_type, target_product, piecesToMove);

    return formatResponse(res, 200, true, `Successfully returned ${piecesToMove} pieces to Selling Counter`);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = await svgService.getSvgHistory(limit);
    return formatResponse(res, 200, true, "SVG history fetched", history);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getInventory,
  addToSvg,
  removeFromSvg,
  getHistory,
};
