const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");

router.get("/", customerController.getAll);
router.get("/:id/ledger", customerController.getLedger);
router.post("/:id/ledger/entries", customerController.createLedgerEntry);
router.get("/:id", customerController.getById);
router.post("/", customerController.create);
router.put("/:id", customerController.update);
router.delete("/:id", customerController.remove);

module.exports = router;
