const express = require("express");
const router = express.Router();
const stockController = require("../controllers/stockController");

router.get("/", stockController.getStock);

router.post("/add", stockController.addStock);

module.exports = router;
