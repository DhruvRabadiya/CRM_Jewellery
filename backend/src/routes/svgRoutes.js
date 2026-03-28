const express = require("express");
const router = express.Router();
const svgController = require("../controllers/svgController");

router.get("/inventory", svgController.getInventory);
router.post("/add", svgController.addToSvg);
router.post("/remove", svgController.removeFromSvg);

module.exports = router;
