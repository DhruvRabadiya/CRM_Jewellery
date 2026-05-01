'use strict';

/**
 * free-port.js
 * ------------
 * Releases PORT (default 3000) before the backend starts so that a leftover
 * process from a previous run never causes EADDRINUSE.
 *
 * Works on Windows (netstat + taskkill) and Linux/macOS (lsof/fuser + kill).
 * Exits silently with code 0 whether or not a process was found.
 *
 * Run automatically via the "prestart" and "predev" npm hooks in
 * backend/package.json — no manual invocation needed.
 */

const { execSync } = require('child_process');
const PORT = parseInt(process.env.PORT || '3000', 10);

function killOnWindows(port) {
  try {
    // netstat output has the PID in the last whitespace-delimited column
    const out = execSync(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (!out) return;

    // There may be multiple LISTENING lines (IPv4 + IPv6); collect unique PIDs
    const pids = [...new Set(
      out.split('\n')
         .map(line => line.trim().split(/\s+/).pop())
         .filter(pid => pid && /^\d+$/.test(pid) && pid !== '0')
    )];

    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
        console.log(`[free-port] Released port ${port} (killed PID ${pid})`);
      } catch (_) {
        // PID may have already exited — ignore
      }
    }
  } catch (_) {
    // findstr exits non-zero when nothing matches — port is already free
  }
}

function killOnUnix(port) {
  try {
    // lsof preferred; fall back to fuser
    try {
      const pids = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).trim();
      if (!pids) return;
      execSync(`echo "${pids}" | xargs kill -9`, { stdio: 'pipe' });
      console.log(`[free-port] Released port ${port}`);
    } catch (_) {
      execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'pipe' });
    }
  } catch (_) {
    // Nothing to kill
  }
}

if (process.platform === 'win32') {
  killOnWindows(PORT);
} else {
  killOnUnix(PORT);
}
