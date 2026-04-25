const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");
const { requireAdmin } = require("../middleware/authMiddleware");

router.get("/combined", jobController.getCombinedProcesses);
router.get("/next-id", jobController.getNextJobId);
router.get("/finished", jobController.getFinishedGoods);

// Admin only: Delete invalid finished goods entries
router.delete("/finished/:id", requireAdmin, jobController.deleteFinishedGoodsEntry);

module.exports = router;
