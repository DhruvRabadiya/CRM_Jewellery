'use strict';

const logger = require('../utils/logger');

/**
 * errorHandler.js — Global Express error handler
 * ─────────────────────────────────────────────────
 * Catches any error passed to next(err) — including thrown errors from async
 * route handlers — and returns a consistent JSON error envelope to the client.
 *
 * MUST be registered as the LAST app.use() call in app.js so it receives
 * errors from all preceding middleware and route handlers.
 *
 * Error shape expected (set by createAppError in common.js):
 *   err.statusCode  — HTTP status to send (default 500)
 *   err.code        — Machine-readable error code (default 'INTERNAL_ERROR')
 *   err.message     — Human-readable description
 *
 * Security: in production, 500-level error messages are replaced with a
 * generic string so internal details are never leaked to the client.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const code       = err.code       || 'INTERNAL_ERROR';
  const message    = err.message    || 'An unexpected error occurred';

  logger.error('Unhandled error', {
    code,
    message,
    method: req.method,
    path:   req.path,
    // Only include stack trace in development to avoid leaking internals
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  const clientMessage =
    process.env.NODE_ENV === 'production' && statusCode >= 500
      ? 'An internal server error occurred. Please contact your administrator.'
      : message;

  res.status(statusCode).json({
    success: false,
    error:   clientMessage,
    code,
  });
}

module.exports = errorHandler;
