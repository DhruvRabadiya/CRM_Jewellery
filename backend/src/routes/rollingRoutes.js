const express = require("express");
const router = express.Router();
const rollingController = require("../controllers/rollingController");

router.get("/", rollingController.getAllRolling);
router.post("/create", rollingController.createRolling);
router.post("/start", rollingController.startRolling);
router.post("/complete", rollingController.completeRolling);
router.put("/:id/edit", rollingController.editRolling);
router.delete("/:id/delete", rollingController.deleteRolling);
router.post("/:id/revert", rollingController.revertRolling);

module.exports = router;
