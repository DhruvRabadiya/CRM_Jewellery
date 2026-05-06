const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { fork } = require("child_process");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const http = require("http");

let mainWindow;
let backendProcess;

// ─── Shop name ────────────────────────────────────────────────────────────────
// Appears at the top of every thermal print receipt.
// Change this to your actual shop name.
const SHOP_NAME = "Jewellery Shop";

// ─── Stable JWT secret ────────────────────────────────────────────────────────
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
    return crypto.randomBytes(32).toString("hex");
  }
}

// ─── Printer preference (persisted in userData) ───────────────────────────────
function printerPrefPath() {
  return path.join(app.getPath("userData"), "printer-pref.json");
}
function loadPrinterPref() {
  try {
    return JSON.parse(fs.readFileSync(printerPrefPath(), "utf8"));
  } catch (_) {
    return { printerName: "" };
  }
}
function savePrinterPref(pref) {
  try {
    fs.writeFileSync(printerPrefPath(), JSON.stringify(pref), "utf8");
  } catch (err) {
    console.error("Could not save printer pref:", err);
  }
}

// ─── Backend readiness poll ───────────────────────────────────────────────────
function waitForBackend(port, retries, delayMs) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();
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

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── Backend process ──────────────────────────────────────────────────────────
function startBackend() {
  console.log("Starting backend in production mode...");
  const backendPath = path.join(__dirname, "backend", "src", "app.js");
  const dbPath      = path.join(app.getPath("userData"), "jewelry.db");
  const jwtSecret   = getOrCreateJwtSecret();

  backendProcess = fork(backendPath, [], {
    env: {
      ...process.env,
      NODE_ENV:   "production",
      DB_PATH:    dbPath,
      PORT:       "3000",
      JWT_SECRET: jwtSecret,
    },
  });

  backendProcess.on("error", (err) => console.error("Backend process error:", err));
  backendProcess.on("exit", (code) => {
    if (code !== 0 && code !== null)
      console.error(`Backend exited unexpectedly (code ${code})`);
  });
}

// ─── Printer list IPC ─────────────────────────────────────────────────────────
// Returns all printers installed on the system so the UI can show a picker.
ipcMain.handle("get-printers", async () => {
  try {
    const list = await mainWindow.webContents.getPrintersAsync();
    // Return only what the UI needs (name, isDefault, description).
    return list.map((p) => ({
      name:        p.name,
      description: p.description || p.name,
      isDefault:   p.isDefault,
      status:      p.status,
    }));
  } catch (err) {
    console.error("get-printers failed:", err);
    return [];
  }
});

// ─── Printer preference IPC ───────────────────────────────────────────────────
ipcMain.handle("get-printer-pref", () => loadPrinterPref());

ipcMain.handle("save-printer-pref", (event, pref) => {
  savePrinterPref(pref);
  return { ok: true };
});

// ─── Thermal print IPC handler ────────────────────────────────────────────────
// estimateData contains printerName (saved pref) so the job goes to the correct
// thermal printer silently — no dialog, no PDF.
ipcMain.handle("print-estimate", async (event, estimateData) => {
  return new Promise((resolve) => {
    const isDev = process.env.NODE_ENV === "development";

    // Extract printer name before passing payload to template.
    const { printerName, ...templateData } = estimateData;

    // Hidden window sized for 80 mm thermal paper.
    const printWin = new BrowserWindow({
      width: 380,
      height: 1400,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const templatePath = isDev
      ? path.join(__dirname, "frontend", "public",  "print-template.html")
      : path.join(__dirname, "frontend", "dist",    "print-template.html");

    printWin.loadFile(templatePath);

    let settled = false;
    function done(result) {
      if (!settled) { settled = true; resolve(result); }
    }

    printWin.webContents.on("did-finish-load", () => {
      const payload = JSON.stringify({ ...templateData, shopName: SHOP_NAME });

      printWin.webContents
        .executeJavaScript(`window.__ESTIMATE_DATA__ = ${payload};`)
        .then(() => {
          // 400 ms for the template to finish rendering.
          setTimeout(() => {
            printWin.webContents.print(
              {
                silent:          true,
                printBackground: false,
                // Route to the chosen thermal printer; empty → OS default.
                deviceName:      printerName || "",
                // 80 mm wide; height 297 mm max (thermal cuts to content).
                pageSize:        { width: 80000, height: 297000 },
                margins:         { marginType: "none" },
              },
              (success, failureReason) => {
                try { printWin.close(); } catch (_) {}
                if (success) {
                  done({ ok: true });
                } else {
                  console.error("Silent print failed:", failureReason);
                  done({ ok: false, error: failureReason || "Print failed" });
                }
              }
            );
          }, 400);
        })
        .catch((err) => {
          try { printWin.close(); } catch (_) {}
          done({ ok: false, error: err.message });
        });
    });

    printWin.on("closed", () => done({ ok: false, error: "Print window closed unexpectedly" }));

    setTimeout(() => {
      try { printWin.close(); } catch (_) {}
      done({ ok: false, error: "Print timed out after 20 s" });
    }, 20000);
  });
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (process.env.NODE_ENV !== "development") {
    startBackend();
    try {
      await waitForBackend(3000, 30, 500);
      console.log("Backend is ready.");
    } catch (err) {
      console.error("Backend failed to start in time:", err.message);
    }
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (backendProcess) backendProcess.kill();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
