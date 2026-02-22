const express = require("express");
const router = express.Router();
const packingController = require("../controllers/packingController");

router.get("/", packingController.getAllPacking);
router.post("/create", packingController.createPacking);
router.post("/start", packingController.startPacking);
router.post("/complete", packingController.completePacking);

module.exports = router;
