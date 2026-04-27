const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/sellingDashboardController");

router.get("/", ctrl.getDashboard);

module.exports = router;
