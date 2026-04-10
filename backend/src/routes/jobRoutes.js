const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");

router.get("/combined", jobController.getCombinedProcesses);
router.get("/next-id", jobController.getNextJobId);
router.get("/finished", jobController.getFinishedGoods);

module.exports = router;
