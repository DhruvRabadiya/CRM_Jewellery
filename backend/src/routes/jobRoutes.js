const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");

router.get("/active", jobController.getActiveJobs);
router.get("/combined", jobController.getCombinedProcesses);
router.get("/next-id", jobController.getNextJobId);
router.get("/finished", jobController.getFinishedGoods);

router.post("/create", jobController.createJob);
router.post("/step", jobController.completeStep);
router.post("/start-step", jobController.startJobStep);
router.post("/reverse", jobController.reverseProcess);
router.post("/edit-completed", jobController.editCompletedProcess);

router.get("/:id", jobController.getJobDetails);

module.exports = router;
