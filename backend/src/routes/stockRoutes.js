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

router.post("/dhal", stockController.addDhalStock);
router.get("/dhal/purchases", stockController.getDhalPurchases);
router.put("/dhal/purchases/:id", stockController.editDhalPurchase);
router.delete("/dhal/purchases/:id", stockController.deleteDhalPurchase);

router.post("/recalculate", stockController.recalculateStockEndpoint);

module.exports = router;
