require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

// Import Routes
const stockRoutes = require("./routes/stockRoutes");
const meltingRoutes = require("./routes/meltingRoutes");
const jobRoutes = require("./routes/jobRoutes");
const rollingRoutes = require("./routes/rollingRoutes");
const pressRoutes = require("./routes/pressRoutes");
const tppRoutes = require("./routes/tppRoutes");
const packingRoutes = require("./routes/packingRoutes");
const authRoutes = require("./routes/authRoutes");
const { authenticateToken } = require("./middleware/authMiddleware");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Public Auth routes (login)
app.use("/api/auth", authRoutes);

// Protected Operational Routes
app.use("/api/stock", authenticateToken, stockRoutes);
app.use("/api/melting", authenticateToken, meltingRoutes);
app.use("/api/jobs", authenticateToken, jobRoutes);
app.use("/api/rolling", authenticateToken, rollingRoutes);
app.use("/api/press", authenticateToken, pressRoutes);
app.use("/api/tpp", authenticateToken, tppRoutes);
app.use("/api/packing", authenticateToken, packingRoutes);

app.get("/", (req, res) => {
  res.send("Jewelry CRM Backend is Running");
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
