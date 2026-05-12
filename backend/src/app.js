'use strict';

const path   = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const express = require('express');
const cors    = require('cors');

const db     = require('../config/dbConfig');
const logger = require('./utils/logger');

// ─── Middleware ───────────────────────────────────────────────────────────────
const securityHeaders            = require('./middleware/securityHeaders');
const { authRateLimiter,
        apiRateLimiter }         = require('./middleware/rateLimiter');
const { authenticateToken }      = require('./middleware/authMiddleware');
const errorHandler               = require('./middleware/errorHandler');

// ─── Routes ───────────────────────────────────────────────────────────────────
const authRoutes             = require('./routes/authRoutes');
const stockRoutes            = require('./routes/stockRoutes');
const meltingRoutes          = require('./routes/meltingRoutes');
const jobRoutes              = require('./routes/jobRoutes');
const rollingRoutes          = require('./routes/rollingRoutes');
const pressRoutes            = require('./routes/pressRoutes');
const tppRoutes              = require('./routes/tppRoutes');
const packingRoutes          = require('./routes/packingRoutes');
const svgRoutes              = require('./routes/svgRoutes');
const counterRoutes          = require('./routes/counterRoutes');
const customerRoutes         = require('./routes/customerRoutes');
const sellingDashboardRoutes = require('./routes/sellingDashboardRoutes');
const labourChargeRoutes     = require('./routes/labourChargeRoutes');
const estimateRoutes         = require('./routes/orderBillRoutes');
const rojMedRoutes           = require('./routes/rojMedRoutes');

// ─── App ──────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ── Security headers on every response ───────────────────────────────────────
app.use(securityHeaders);

// ── CORS ─────────────────────────────────────────────────────────────────────
// Production renderer is file:// (origin=null). Dev is http://localhost:5173.
// All other origins are rejected.
app.use(cors({
  origin(origin, callback) {
    if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS: origin not allowed'));
  },
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    false,
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ strict: false }));

// ── General API rate limit ────────────────────────────────────────────────────
app.use('/api', apiRateLimiter);

// ─── Public routes ────────────────────────────────────────────────────────────
app.use('/api/auth', authRateLimiter, authRoutes);

// ─── Protected routes ─────────────────────────────────────────────────────────
app.use('/api/stock',             authenticateToken, stockRoutes);
app.use('/api/melting',           authenticateToken, meltingRoutes);
app.use('/api/jobs',              authenticateToken, jobRoutes);
app.use('/api/rolling',           authenticateToken, rollingRoutes);
app.use('/api/press',             authenticateToken, pressRoutes);
app.use('/api/tpp',               authenticateToken, tppRoutes);
app.use('/api/packing',           authenticateToken, packingRoutes);
app.use('/api/svg',               authenticateToken, svgRoutes);
app.use('/api/counter',           authenticateToken, counterRoutes);
app.use('/api/customers',         authenticateToken, customerRoutes);
app.use('/api/selling/dashboard', authenticateToken, sellingDashboardRoutes);
app.use('/api/labour-charges',    authenticateToken, labourChargeRoutes);
app.use('/api/estimates',         authenticateToken, estimateRoutes);
app.use('/api/order-bills',       authenticateToken, estimateRoutes);
app.use('/api/roj-med',           authenticateToken, rojMedRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'JewelCRM Backend' });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found', code: 'NOT_FOUND' });
});

// ─── Global error handler (MUST be last) ─────────────────────────────────────
app.use(errorHandler);

// ─── Startup ──────────────────────────────────────────────────────────────────
(async () => {
  try {
    await db.initializeDatabase();

    const server = app.listen(PORT, '127.0.0.1', () => {
      logger.info('JewelCRM backend listening', { port: PORT, env: process.env.NODE_ENV || 'development' });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error('Port already in use', {
          port:      PORT,
          hint_win:  'netstat -ano | findstr :' + PORT + '  then  taskkill /F /PID <PID>',
          hint_unix: 'lsof -ti:' + PORT + ' | xargs kill -9',
        });
      } else {
        logger.error('Server startup error', { message: err.message });
      }
      process.exit(1);
    });

  } catch (err) {
    logger.error('Database initialization failed', { message: err.message });
    process.exit(1);
  }
})();
