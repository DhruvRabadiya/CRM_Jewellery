const express = require("express");
const router = express.Router();
const rollingController = require("../controllers/rollingController");

router.get("/", rollingController.getAllRolling);
router.post("/create", rollingController.createRolling);
router.post("/start", rollingController.startRolling);
router.post("/complete", rollingController.completeRolling);

module.exports = router;
