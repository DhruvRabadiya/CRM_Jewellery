'use strict';

/**
 * logger.js — Structured application logger
 * ──────────────────────────────────────────
 * Drop-in replacement for scattered console.log / console.error calls.
 *
 * In development  → colorized, human-readable lines to stdout/stderr.
 * In production   → JSON-structured lines, ready for log aggregation.
 *
 * Usage:
 *   const logger = require('../utils/logger');
 *   logger.info('Server started', { port: 3000 });
 *   logger.warn('JWT_SECRET not set in environment');
 *   logger.error('DB error', { message: err.message, stack: err.stack });
 *   logger.debug('Query params', { sql, params }); // silent in production
 */

const isDev = process.env.NODE_ENV !== 'production';

// ANSI color codes (no-op in production JSON mode)
const COLORS = {
  info:  '\x1b[36m',  // cyan
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
  debug: '\x1b[90m',  // dark gray
  reset: '\x1b[0m',
};

/**
 * @param {'info'|'warn'|'error'|'debug'} level
 * @param {string} message
 * @param {object} [meta]
 * @returns {string}
 */
function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();

  if (isDev) {
    const color   = COLORS[level] || '';
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta, null, 0) : '';
    return `${color}[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}${COLORS.reset}`;
  }

  // Production: structured JSON (no color codes)
  const entry = { timestamp, level, message };
  if (Object.keys(meta).length) Object.assign(entry, meta);
  return JSON.stringify(entry);
}

const logger = {
  /**
   * General informational messages (startup, lifecycle events).
   * @param {string} message
   * @param {object} [meta]
   */
  info(message, meta = {}) {
    console.log(formatMessage('info', message, meta));
  },

  /**
   * Recoverable conditions that deserve attention.
   * @param {string} message
   * @param {object} [meta]
   */
  warn(message, meta = {}) {
    console.warn(formatMessage('warn', message, meta));
  },

  /**
   * Errors that affect a request or operation.
   * @param {string} message
   * @param {object} [meta]
   */
  error(message, meta = {}) {
    console.error(formatMessage('error', message, meta));
  },

  /**
   * Verbose debug info — silenced in production.
   * @param {string} message
   * @param {object} [meta]
   */
  debug(message, meta = {}) {
    if (isDev) console.log(formatMessage('debug', message, meta));
  },
};

module.exports = logger;
