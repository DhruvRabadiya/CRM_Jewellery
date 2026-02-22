const express = require("express");
const router = express.Router();
const pressController = require("../controllers/pressController");

router.get("/", pressController.getAllPress);
router.post("/create", pressController.createPress);
router.post("/start", pressController.startPress);
router.post("/complete", pressController.completePress);

module.exports = router;
