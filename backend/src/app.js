const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const express = require("express");
const db = require("../config/dbConfig");
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
const svgRoutes = require("./routes/svgRoutes");
const counterRoutes = require("./routes/counterRoutes");
const customerRoutes = require("./routes/customerRoutes");
const sellingDashboardRoutes = require("./routes/sellingDashboardRoutes");
const labourChargeRoutes = require("./routes/labourChargeRoutes");
const estimateRoutes = require("./routes/orderBillRoutes");
const authRoutes = require("./routes/authRoutes");
const { authenticateToken } = require("./middleware/authMiddleware");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ charset: 'utf-8' }));
app.use(bodyParser.text({ charset: 'utf-8' }));
app.use((req, res, next) => {
  res.set('Content-Type', 'application/json; charset=utf-8');
  next();
});

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
app.use("/api/svg", authenticateToken, svgRoutes);
app.use("/api/counter", authenticateToken, counterRoutes);
app.use("/api/customers", authenticateToken, customerRoutes);
app.use("/api/selling/dashboard", authenticateToken, sellingDashboardRoutes);

// Labour charges - admin-configured Metal > Category > Size rates, used by Estimate.
app.use("/api/labour-charges", authenticateToken, labourChargeRoutes);

// Estimates (formerly Order Bills / Selling Counter) - unified billing module.
// Backward-compat alias at /api/order-bills keeps older clients working.
app.use("/api/estimates", authenticateToken, estimateRoutes);
app.use("/api/order-bills", authenticateToken, estimateRoutes);

app.get("/", (req, res) => {
  res.send("Jewelry CRM Backend is Running");
});

// Initialise the database (open → migrate → seed if fresh) then start
// listening.  All route handlers are registered above so no request can
// arrive before the database is ready.
(async () => {
  try {
    await db.initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("[Startup] Database initialization failed:", err.message);
    process.exit(1);
  }
})();
