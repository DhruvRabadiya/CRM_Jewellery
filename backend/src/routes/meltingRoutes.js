const express = require("express");
const router = express.Router();
const meltingController = require("../controllers/meltingController");

router.post("/start", meltingController.startMelting);

router.post("/complete", meltingController.completeMelting);

router.get("/running", meltingController.getRunningMelts);
router.put("/:id", meltingController.editMeltingProcess);
router.post("/revert/:id", meltingController.revertMeltingProcess);
router.delete("/:id", meltingController.deleteMeltingProcess);
router.get("/", meltingController.getAllMelting);

module.exports = router;
