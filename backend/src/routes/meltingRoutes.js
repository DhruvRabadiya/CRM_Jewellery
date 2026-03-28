const express = require("express");
const router = express.Router();
const meltingController = require("../controllers/meltingController");

router.get("/", meltingController.getAllMelting);
router.post("/create", meltingController.createMelting);
router.post("/start", meltingController.startMelting);
router.post("/complete", meltingController.completeMelting);
router.get("/running", meltingController.getRunningMelts);
router.put("/:id/edit", meltingController.editMeltingProcess);
router.post("/:id/revert", meltingController.revertMeltingProcess);
router.delete("/:id/delete", meltingController.deleteMeltingProcess);

module.exports = router;
