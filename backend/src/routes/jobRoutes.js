const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");

router.post("/create", jobController.createJob);

router.post("/step", jobController.completeStep);

router.get("/active", jobController.getActiveJobs);

router.get("/next-id", jobController.getNextJobId);

router.get("/:id", jobController.getJobDetails);
module.exports = router;
