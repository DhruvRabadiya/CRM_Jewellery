const svgService = require("../services/svgService");
const counterService = require("../services/counterService");
const db = require("../../config/dbConfig");
const {
  calculateTransferWeight,
  formatResponse,
  isValidMetalType,
  parseUnitWeight,
  sanitizePieces,
} = require("../utils/common");

const getInventory = async (req, res) => {
  try {
    const inventory = await svgService.getSvgInventory();
    return formatResponse(res, 200, true, "SVG Inventory fetched", inventory);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

/**
 * Add to SVG Vault - moves items FROM the Selling Counter INTO the SVG vault.
 * Counter -> SVG
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

    const unitWeight = parseUnitWeight(target_product);
    const weight = calculateTransferWeight({
      requestedPieces: piecesToMove,
      sourcePieces: available.total_pieces,
      sourceWeight: available.total_weight,
      fallbackUnitWeight: unitWeight,
    });

    await db.runTransaction(async () => {
      await counterService.addCounterInventory(metal_type, target_product, -piecesToMove, {
        category: target_product,
        size_label: target_product,
        size_value: unitWeight || 0,
        weight: -weight,
        reference_type: "SVG_TRANSFER_OUT",
        notes: "Moved from counter to SVG vault",
      });
      await svgService.addSvgInventory(metal_type, target_product, piecesToMove, weight);
    });

    return formatResponse(res, 200, true, `Successfully moved ${piecesToMove} pieces to SVG Vault`);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

/**
 * Remove from SVG Vault - moves items FROM the SVG vault BACK TO the Selling Counter.
 * SVG -> Counter
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

    const unitWeight = parseUnitWeight(target_product);
    const weight = calculateTransferWeight({
      requestedPieces: piecesToMove,
      sourcePieces: available.total_pieces,
      sourceWeight: available.total_weight,
      fallbackUnitWeight: unitWeight,
    });

    await db.runTransaction(async () => {
      await svgService.addSvgInventory(metal_type, target_product, -piecesToMove, -weight);
      await counterService.addCounterInventory(metal_type, target_product, piecesToMove, {
        category: target_product,
        size_label: target_product,
        size_value: unitWeight || 0,
        weight,
        reference_type: "SVG_TRANSFER_IN",
        notes: "Returned from SVG vault",
      });
    });

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
