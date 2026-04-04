const stockService = require("../services/stockService");
const { formatResponse, isValidMetalType } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES } = require("../utils/constants");

const getStock = async (req, res) => {
  try {
    // Recalculate inprocess_weight from actual active processes to stay in sync
    await Promise.all([
      stockService.recalculateInprocessWeight("Gold"),
      stockService.recalculateInprocessWeight("Silver"),
    ]);

    const [goldStock, silverStock] = await Promise.all([
      stockService.getStockByMetal("Gold"),
      stockService.getStockByMetal("Silver"),
    ]);

    const defaultStock = (metal) => ({
      metal_type: metal,
      opening_stock: 0,
      inprocess_weight: 0,
      rolling_stock: 0,
      press_stock: 0,
      tpp_stock: 0,
      total_loss: 0,
    });

    const data = {
      gold: goldStock || defaultStock("Gold"),
      silver: silverStock || defaultStock("Silver"),
    };

    return formatResponse(
      res,
      200,
      true,
      "Stock data fetched successfully",
      data,
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const addStock = async (req, res) => {
  try {
    const { metal_type, weight, description } = req.body;

    if (!metal_type || !isValidMetalType(metal_type)) {
      return formatResponse(res, 400, false, "Invalid metal type. Must be 'Gold' or 'Silver'.");
    }
    if (!weight || weight <= 0) {
      return formatResponse(res, 400, false, MESSAGES.INVALID_INPUT);
    }

    if (!isValidMetalType(metal_type)) {
      return formatResponse(res, 400, false, "Invalid metal type. Must be 'Gold' or 'Silver'.");
    }

    await stockService.updateOpeningStock(metal_type, weight, true);

    const transactionId = await stockService.logTransaction(
      metal_type,
      TRANSACTION_TYPES.PURCHASE,
      weight,
      description || "Manual Stock Addition",
    );

    return formatResponse(res, 201, true, "Stock added successfully", {
      transactionId,
    });
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getLossStats = async (req, res) => {
  try {
    const stats = await stockService.getLossStats();
    return formatResponse(res, 200, true, "Loss stats fetched", stats);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getPurchases = async (req, res) => {
  try {
    const purchases = await stockService.getPurchases();
    return formatResponse(res, 200, true, "Purchases fetched", purchases);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getDetailedScrapAndLoss = async (req, res) => {
  try {
    const ledger = await stockService.getDetailedScrapAndLoss();
    return formatResponse(
      res,
      200,
      true,
      "Scrap & Loss Ledger fetched",
      ledger,
    );
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const editStockPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const { weight, description } = req.body;
    
    const purchase = await stockService.getPurchaseById(id);
    if (!purchase) return formatResponse(res, 404, false, "Purchase not found");
    
    const newWeight = parseFloat(weight);
    if (isNaN(newWeight) || newWeight <= 0) {
      return formatResponse(res, 400, false, "Invalid weight");
    }

    const diff = newWeight - purchase.weight;
    
    if (diff > 0) {
      await stockService.updateOpeningStock(purchase.metal_type, diff, true);
    } else if (diff < 0) {
      await stockService.updateOpeningStock(purchase.metal_type, Math.abs(diff), false);
    }

    await stockService.editPurchase(id, newWeight, description || "");
    return formatResponse(res, 200, true, "Purchase updated successfully");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const deleteStockPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    
    const purchase = await stockService.getPurchaseById(id);
    if (!purchase) return formatResponse(res, 404, false, "Purchase not found");
    
    await stockService.updateOpeningStock(purchase.metal_type, purchase.weight, false);
    await stockService.deletePurchase(id);
    
    return formatResponse(res, 200, true, "Purchase deleted and stock adjusted successfully");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getStock,
  addStock,
  getLossStats,
  getPurchases,
  getDetailedScrapAndLoss,
  editStockPurchase,
  deleteStockPurchase,
};
