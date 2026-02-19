const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");

router.post("/create", jobController.createJob);

router.post("/step", jobController.completeStep);

router.get("/:id", jobController.getJobDetails);

router.get("/active", jobController.getActiveJobs);
module.exports = router;
