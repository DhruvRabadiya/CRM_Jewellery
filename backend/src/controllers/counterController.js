const counterService = require("../services/counterService");
const jobService = require("../services/jobService");
const packingService = require("../services/packingService");
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

    const unitWeight = parseUnitWeight(target_product);
    const weightToDeduct = calculateTransferWeight({
      requestedPieces: piecesToSend,
      sourcePieces: available.total_pieces,
      sourceWeight: available.total_weight,
      fallbackUnitWeight: unitWeight,
    });

    await db.runTransaction(async () => {
      await packingService.addFinishedGoods(metal_type, target_product, -piecesToSend, -weightToDeduct, {
        reference_type: "COUNTER_SEND",
      });

      await counterService.addCounterInventory(metal_type, target_product, piecesToSend, {
        category: target_product,
        size_label: target_product,
        size_value: unitWeight || 0,
        weight: weightToDeduct,
        reference_type: "COUNTER_SEND",
        notes: "Sent from finished goods",
      });
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

    const unitWeight = parseUnitWeight(target_product);
    const weightToReturn = calculateTransferWeight({
      requestedPieces: piecesToReturn,
      sourcePieces: available.total_pieces,
      sourceWeight: available.total_weight,
      fallbackUnitWeight: unitWeight,
    });

    await db.runTransaction(async () => {
      await counterService.addCounterInventory(metal_type, target_product, -piecesToReturn, {
        category: target_product,
        size_label: target_product,
        size_value: unitWeight || 0,
        weight: -weightToReturn,
        reference_type: "COUNTER_RETURN",
        notes: "Returned to finished goods",
      });

      await packingService.addFinishedGoods(metal_type, target_product, piecesToReturn, weightToReturn, {
        reference_type: "COUNTER_RETURN",
      });
    });

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
