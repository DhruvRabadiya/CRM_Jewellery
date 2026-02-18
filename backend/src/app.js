const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

// Import Routes
const stockRoutes = require("./routes/stockRoutes");
const meltingRoutes = require("./routes/meltingRoutes");
const jobRoutes = require("./routes/jobRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

app.use("/api/stock", stockRoutes);
app.use("/api/melting", meltingRoutes);
app.use("/api/jobs", jobRoutes);

app.get("/", (req, res) => {
  res.send("Jewelry CRM Backend is Running");
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
