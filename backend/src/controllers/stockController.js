const stockService = require("../services/stockService");
const { formatResponse, isValidMetalType } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES } = require("../utils/constants");

const getStock = async (req, res) => {
  try {
    const metalTypes = ["Gold 22K", "Gold 24K", "Silver"];
    // Recalculate all stock_master values from source-of-truth tables
    await Promise.all(
      metalTypes.flatMap((m) => [
        stockService.recalculateOpeningStock(m),
        stockService.recalculateInprocessWeight(m),
        stockService.recalculateTotalLoss(m),
      ])
    );

    const [gold22kStock, gold24kStock, silverStock] = await Promise.all([
      stockService.getStockByMetal("Gold 22K"),
      stockService.getStockByMetal("Gold 24K"),
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
      "gold_22k": gold22kStock || defaultStock("Gold 22K"),
      "gold_24k": gold24kStock || defaultStock("Gold 24K"),
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
      return formatResponse(res, 400, false, "Invalid metal type. Must be 'Gold 22K', 'Gold 24K', or 'Silver'.");
    }
    if (!weight || weight <= 0) {
      return formatResponse(res, 400, false, MESSAGES.INVALID_INPUT);
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

const recalculateStock = async (req, res) => {
  try {
    const metalTypes = ["Gold 22K", "Gold 24K", "Silver"];
    await Promise.all(
      metalTypes.flatMap((m) => [
        stockService.recalculateOpeningStock(m),
        stockService.recalculateInprocessWeight(m),
        stockService.recalculateTotalLoss(m),
      ])
    );

    const [gold22kStock, gold24kStock, silverStock] = await Promise.all([
      stockService.getStockByMetal("Gold 22K"),
      stockService.getStockByMetal("Gold 24K"),
      stockService.getStockByMetal("Silver"),
    ]);

    return formatResponse(res, 200, true, "Stock recalculated from source of truth", {
      "gold_22k": gold22kStock,
      "gold_24k": gold24kStock,
      silver: silverStock,
    });
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
  recalculateStock,
};
