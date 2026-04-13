const express = require("express");
const router = express.Router();
const counterController = require("../controllers/counterController");

router.get("/inventory", counterController.getInventory);
router.post("/send", counterController.sendToCounter);
router.post("/return", counterController.returnFromCounter);

module.exports = router;
