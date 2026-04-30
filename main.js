const { app, BrowserWindow } = require("electron");
const path = require("path");
const { fork } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");

let mainWindow;
let backendProcess;

// ─── Stable JWT secret ────────────────────────────────────────────────────────
// Generate once and persist in userData so tokens survive app restarts.
function getOrCreateJwtSecret() {
  const secretFile = path.join(app.getPath("userData"), "jwt-secret.txt");
  try {
    if (fs.existsSync(secretFile)) {
      return fs.readFileSync(secretFile, "utf8").trim();
    }
    const secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretFile, secret, "utf8");
    return secret;
  } catch (err) {
    console.error("Could not read/write JWT secret file:", err);
    // Fall back to a session-only secret (tokens won't survive restart)
    return crypto.randomBytes(32).toString("hex");
  }
}

// ─── Backend readiness poll ───────────────────────────────────────────────────
// Poll localhost:3000 instead of using a fixed sleep so we open the window
// as soon as the backend is actually ready (handles slow first-run / slow machines).
function waitForBackend(port, retries, delayMs) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume(); // consume response so socket is released
        resolve();
      });
      req.on("error", () => {
        if (n <= 0) return reject(new Error("Backend did not start in time"));
        setTimeout(() => attempt(n - 1), delayMs);
      });
      req.setTimeout(delayMs, () => {
        req.destroy();
        if (n <= 0) return reject(new Error("Backend did not start in time"));
        setTimeout(() => attempt(n - 1), delayMs);
      });
    }
    attempt(retries);
  });
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
  });

  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "frontend", "dist", "index.html"));
  }

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

// ─── Backend process ──────────────────────────────────────────────────────────
function startBackend() {
  console.log("Starting backend in production mode...");
  const backendPath = path.join(__dirname, "backend", "src", "app.js");
  const dbPath = path.join(app.getPath("userData"), "jewelry.db");
  const jwtSecret = getOrCreateJwtSecret();

  backendProcess = fork(backendPath, [], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DB_PATH: dbPath,
      PORT: "3000",
      JWT_SECRET: jwtSecret,   // ← pass stable secret so tokens survive restarts
    },
  });

  backendProcess.on("error", (err) => {
    console.error("Failed to start backend process.", err);
  });

  backendProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Backend process exited unexpectedly with code ${code}`);
    }
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (process.env.NODE_ENV !== "development") {
    startBackend();

    // Wait for backend to actually be ready (up to 15 s) before loading UI
    try {
      await waitForBackend(3000, 30, 500); // 30 retries × 500 ms = 15 s max
      console.log("Backend is ready.");
    } catch (err) {
      console.error("Backend failed to start in time:", err.message);
      // Open the window anyway — frontend will show API error messages
    }
  }

  createWindow();
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});

app.on("activate", function () {
  if (mainWindow === null) createWindow();
});
