const stockService = require("../services/stockService");
const { formatResponse } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES } = require("../utils/constants");

const getStock = async (req, res) => {
  try {
    const [goldStock, silverStock] = await Promise.all([
      stockService.getStockByMetal("Gold"),
      stockService.getStockByMetal("Silver"),
    ]);

    const defaultStock = (metal) => ({
      metal_type: metal,
      opening_stock: 0,
      dhal_stock: 0,
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

    if (!metal_type || !weight || weight <= 0) {
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

const editPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const { weight, description } = req.body;

    if (!weight || weight <= 0) {
      return formatResponse(res, 400, false, "Valid wait is required");
    }

    const transaction = await stockService.getTransactionById(id);
    if (!transaction) {
      return formatResponse(res, 404, false, "Purchase not found");
    }

    if (transaction.transaction_type !== TRANSACTION_TYPES.PURCHASE) {
      return formatResponse(res, 400, false, "Only PURCHASE transactions can be edited here");
    }

    const oldWeight = transaction.weight;
    const newWeight = parseFloat(weight);
    const weightDiff = newWeight - oldWeight;

    // Adjust Opening Stock
    if (weightDiff !== 0) {
      await stockService.updateOpeningStock(transaction.metal_type, Math.abs(weightDiff), weightDiff > 0);
    }

    // Update Transaction
    await stockService.updateTransaction(id, newWeight, description);

    return formatResponse(res, 200, true, "Purchase updated successfully");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const deletePurchase = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await stockService.getTransactionById(id);
    if (!transaction) {
      return formatResponse(res, 404, false, "Purchase not found");
    }

    if (transaction.transaction_type !== TRANSACTION_TYPES.PURCHASE) {
      return formatResponse(res, 400, false, "Only PURCHASE transactions can be deleted here");
    }

    // Reverse weight from Opening Stock
    await stockService.updateOpeningStock(transaction.metal_type, transaction.weight, false);

    // Delete Transaction
    await stockService.deleteTransaction(id);

    return formatResponse(res, 200, true, "Purchase deleted and stock reversed successfully");
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
  editPurchase,
  deletePurchase,
};
