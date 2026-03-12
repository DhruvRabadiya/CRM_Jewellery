const express = require("express");
const router = express.Router();
const stockController = require("../controllers/stockController");

router.get("/", stockController.getStock);
router.get("/purchases", stockController.getPurchases);
router.get("/loss-stats", stockController.getLossStats);
router.get("/scrap-loss-ledger", stockController.getDetailedScrapAndLoss);

router.post("/add", stockController.addStock);
router.put("/purchases/:id", stockController.editStockPurchase);
router.delete("/purchases/:id", stockController.deleteStockPurchase);

module.exports = router;
