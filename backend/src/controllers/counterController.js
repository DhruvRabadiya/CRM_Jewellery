const counterService = require("../services/counterService");
const jobService = require("../services/jobService");
const packingService = require("../services/packingService");
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
    const inventory = await counterService.getCounterInventory();
    return formatResponse(res, 200, true, "Counter inventory fetched", inventory);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const sendToCounter = async (req, res) => {
  try {
    const { metal_type, target_product, pieces } = req.body;

    if (!metal_type || !target_product || pieces == null) {
      return formatResponse(res, 400, false, "metal_type, target_product, and pieces are required");
    }

    if (!isValidMetalType(metal_type)) {
      return formatResponse(res, 400, false, "Invalid metal type");
    }

    const piecesToSend = sanitizePieces(pieces);
    if (piecesToSend <= 0) {
      return formatResponse(res, 400, false, "Pieces must be greater than zero");
    }

    // Verify enough stock exists in finished goods
    const finishedGoods = await jobService.getFinishedGoodsInventory();
    const available = finishedGoods.find(
      (item) => item.metal_type === metal_type && item.target_product === target_product
    );

    if (!available || available.total_pieces < piecesToSend) {
      return formatResponse(res, 400, false, "Insufficient finished goods available for transfer");
    }

    // Calculate weight to deduct: use parsed unit weight for consistency with counter display,
    // fall back to proportional calculation for unparseable categories (Mix, Other)
    const unitWeight = parseUnitWeight(target_product);
    const weightToDeduct = unitWeight != null
      ? piecesToSend * unitWeight
      : (available.total_pieces > 0 ? (piecesToSend / available.total_pieces) * available.total_weight : 0);

    // Deduct from finished goods (insert negative adjustment)
    await packingService.addFinishedGoods(metal_type, target_product, -piecesToSend, -weightToDeduct);

    // Add to counter inventory
    await counterService.addCounterInventory(metal_type, target_product, piecesToSend, {
      category: target_product,
      size_label: target_product,
      size_value: unitWeight || 0,
      notes: "Sent from finished goods",
    });

    return formatResponse(res, 200, true, "Successfully sent to counter");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const returnFromCounter = async (req, res) => {
  try {
    const { metal_type, target_product, pieces } = req.body;

    if (!metal_type || !target_product || pieces == null) {
      return formatResponse(res, 400, false, "metal_type, target_product, and pieces are required");
    }

    if (!isValidMetalType(metal_type)) {
      return formatResponse(res, 400, false, "Invalid metal type");
    }

    const piecesToReturn = sanitizePieces(pieces);
    if (piecesToReturn <= 0) {
      return formatResponse(res, 400, false, "Pieces must be greater than zero");
    }

    // Verify enough stock exists in counter
    const counterInventory = await counterService.getCounterInventory();
    const available = counterInventory.find(
      (item) => item.metal_type === metal_type && item.target_product === target_product
    );

    if (!available || available.total_pieces < piecesToReturn) {
      return formatResponse(res, 400, false, "Insufficient items in counter to return");
    }

    // Calculate weight to return using the same logic as send:
    // parsed unit weight for standard categories, proportional for Mix/Other
    const unitWeight = parseUnitWeight(target_product);
    // For unparseable categories, attempt proportional estimate from finished goods
    let weightToReturn = 0;
    if (unitWeight != null) {
      weightToReturn = piecesToReturn * unitWeight;
    } else {
      // Fallback: estimate from current finished goods average weight per piece
      const finishedGoods = await jobService.getFinishedGoodsInventory();
      const fgItem = finishedGoods.find(
        (item) => item.metal_type === metal_type && item.target_product === target_product
      );
      if (fgItem && fgItem.total_pieces > 0) {
        weightToReturn = (piecesToReturn / fgItem.total_pieces) * fgItem.total_weight;
      }
    }

    // Deduct from counter (insert negative adjustment)
    await counterService.addCounterInventory(metal_type, target_product, -piecesToReturn, {
      category: target_product,
      size_label: target_product,
      size_value: unitWeight || 0,
      notes: "Returned to finished goods",
    });

    // Add back to finished goods
    await packingService.addFinishedGoods(metal_type, target_product, piecesToReturn, weightToReturn);

    return formatResponse(res, 200, true, "Successfully returned from counter to finished goods");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getInventory,
  sendToCounter,
  returnFromCounter,
};
