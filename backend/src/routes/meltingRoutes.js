const express = require("express");
const router = express.Router();
const meltingController = require("../controllers/meltingController");

router.post("/start", meltingController.startMelting);
router.post("/complete", meltingController.completeMelting);

router.get("/running", meltingController.getRunningMelts);
router.get("/completed", meltingController.getCompletedMelts);
router.get("/all", meltingController.getAllMelts);
router.get("/:id", meltingController.getMeltById);

router.put("/:id", meltingController.updateMelt);
router.put("/:id/completed", meltingController.updateCompletedMelt);

router.delete("/:id", meltingController.deleteMelt);

module.exports = router;
