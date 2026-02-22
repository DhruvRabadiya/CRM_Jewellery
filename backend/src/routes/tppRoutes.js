const express = require("express");
const router = express.Router();
const tppController = require("../controllers/tppController");

router.get("/", tppController.getAllTpp);
router.post("/create", tppController.createTpp);
router.post("/start", tppController.startTpp);
router.post("/complete", tppController.completeTpp);

module.exports = router;
