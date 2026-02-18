const express = require("express");
const router = express.Router();
const meltingController = require("../controllers/meltingController");

router.post("/start", meltingController.startMelting);

router.post("/complete", meltingController.completeMelting);

router.get("/running", meltingController.getRunningMelts);

module.exports = router;
