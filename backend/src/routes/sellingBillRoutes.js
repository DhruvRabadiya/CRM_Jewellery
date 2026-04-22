const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/sellingBillController");

router.get("/next-no", ctrl.getNextNo);
router.get("/", ctrl.listBills);
router.get("/:id", ctrl.getBill);
router.post("/", ctrl.createBill);
router.put("/:id", ctrl.updateBill);
router.delete("/:id", ctrl.deleteBill);

module.exports = router;
