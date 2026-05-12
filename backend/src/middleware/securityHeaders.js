'use strict';

/**
 * securityHeaders.js — HTTP security response headers
 * ──────────────────────────────────────────────────────
 * Adds defence-in-depth HTTP headers to every response, mirroring the
 * core protections provided by the `helmet` npm package without adding
 * an external dependency.
 *
 * Headers applied:
 *   X-Content-Type-Options: nosniff       — prevents MIME-type sniffing
 *   X-Frame-Options: DENY                 — blocks clickjacking via iframes
 *   X-XSS-Protection: 0                  — disables legacy browser XSS filter
 *                                           (CSP is the modern replacement)
 *   Content-Security-Policy              — restricts resource origins
 *   Referrer-Policy: no-referrer         — prevents URL leakage in Referer header
 *   Permissions-Policy                   — disables unused browser features
 *
 * X-Powered-By is also removed (Express adds it by default, advertising the
 * framework version to potential attackers).
 *
 * Note: For future public-facing deployments add:
 *   Strict-Transport-Security (HSTS) once HTTPS is enforced.
 */
function securityHeaders(req, res, next) {
  // Prevent MIME sniffing — browser must honour declared Content-Type
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Deny embedding in iframes to prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Disable the IE/legacy browser XSS auditor (it can introduce vulnerabilities)
  res.setHeader('X-XSS-Protection', '0');

  // Modern XSS mitigation — restrict what the page can load
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  // Do not send the Referer header on cross-origin requests
  res.setHeader('Referrer-Policy', 'no-referrer');

  // Disable browser features that this API never uses
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  // Remove Express fingerprint header
  res.removeHeader('X-Powered-By');

  next();
}

module.exports = securityHeaders;
