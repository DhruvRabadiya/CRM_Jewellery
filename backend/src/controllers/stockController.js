const stockService = require("../services/stockService");
const { formatResponse } = require("../utils/common");
const { MESSAGES, TRANSACTION_TYPES } = require("../utils/constants");

const getStock = async (req, res) => {
  try {
    const [goldStock, silverStock] = await Promise.all([
      stockService.getStockByMetal("Gold"),
      stockService.getStockByMetal("Silver"),
    ]);

    const data = {
      gold: goldStock || {
        metal_type: "Gold",
        opening_stock: 0,
        dhal_stock: 0,
        total_loss: 0,
      },
      silver: silverStock || {
        metal_type: "Silver",
        opening_stock: 0,
        dhal_stock: 0,
        total_loss: 0,
      },
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

module.exports = {
  getStock,
  addStock,
};
