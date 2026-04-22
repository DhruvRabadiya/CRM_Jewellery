const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/obRateController");

router.get("/",          ctrl.getAll);
router.put("/bulk",      ctrl.bulkUpdate);
router.post("/",         ctrl.add);
router.delete("/:id",    ctrl.remove);

module.exports = router;
