'use strict';

/**
 * rateLimiter.js — In-memory sliding-window rate limiter
 * ────────────────────────────────────────────────────────
 * Tracks request counts per IP in a Map with automatic expiry.
 * No external packages required — suitable for a local desktop app
 * where a lightweight, zero-dependency solution is preferred.
 *
 * If you later deploy this backend publicly, swap in the `express-rate-limit`
 * npm package for a battle-tested implementation with Redis support.
 *
 * Usage:
 *   const { authRateLimiter } = require('./rateLimiter');
 *   router.post('/login', authRateLimiter, authController.loginUser);
 *
 * Exports:
 *   authRateLimiter — strict (20 req / 15 min) — for /api/auth/*
 *   apiRateLimiter  — generous (300 req / 1 min) — for all other routes
 *   createRateLimiter(options) — factory for custom limiters
 */

/**
 * Creates a rate-limiter middleware.
 *
 * @param {object} [opts]
 * @param {number} [opts.windowMs=900000]  - Time window in milliseconds (default 15 min)
 * @param {number} [opts.max=20]           - Max requests per window per IP
 * @param {string} [opts.message]          - Error message returned when limit exceeded
 * @returns {import('express').RequestHandler}
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max      = 20,
  message  = 'Too many requests. Please try again later.',
} = {}) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();

  // Purge stale entries on each window cycle to prevent unbounded memory growth.
  const pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(ip);
    }
  }, windowMs);

  // Allow the Node.js event loop to exit even if this interval is still active.
  if (pruneInterval.unref) pruneInterval.unref();

  return function rateLimiterMiddleware(req, res, next) {
    const ip  = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count += 1;

    // Expose rate-limit state via standard headers
    res.setHeader('X-RateLimit-Limit',     String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.setHeader('X-RateLimit-Reset',     String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      return res.status(429).json({
        success: false,
        error:   message,
        code:    'RATE_LIMIT_EXCEEDED',
      });
    }

    next();
  };
}

// ─── Pre-built limiters ───────────────────────────────────────────────────────

/**
 * Strict limiter for authentication endpoints.
 * 15 attempts per 15 minutes per IP (testing value — reduce for production).
 */
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      15, // TODO: tighten to 5 before production
  message:  'Too many login attempts. Please wait 15 minutes before trying again.',
});

/**
 * Generous limiter for general API routes.
 * 300 requests per minute — allows normal desktop app usage while blocking
 * runaway loops or misbehaving clients.
 */
const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max:      300,
  message:  'Too many API requests. Please slow down.',
});

module.exports = { authRateLimiter, apiRateLimiter, createRateLimiter };
