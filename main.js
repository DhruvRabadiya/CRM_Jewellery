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
      // Security: contextIsolation=true + nodeIntegration=false is the
      // current Electron best practice.  The preload script exposes only the
      // four IPC channels actually needed via contextBridge.exposeInMainWorld.
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          false, // keep false — preload needs ipcRenderer
      preload:          path.join(__dirname, "preload.js"),
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
//
// Electron 30+ changed how getPrintersAsync() works on Windows — it now relies
// on Chromium's internal printing service which often fails to initialise in
// production (file:// URL) builds, returning an empty list even when a printer
// is physically connected.  We therefore try three sources in order:
//   1. Chromium getPrintersAsync()   — fastest, works when the service is up
//   2. PowerShell Get-Printer        — queries Windows spooler directly (Win32)
//   3. wmic printer list             — older fallback for PowerShell failures
// The first source that returns ≥1 printer wins.
ipcMain.handle("get-printers", async () => {
  const { execSync } = require("child_process");

  // ── Source 1: Chromium ──────────────────────────────────────────────────
  try {
    const list = await mainWindow.webContents.getPrintersAsync();
    if (list && list.length > 0) {
      return list.map((p) => ({
        name:        p.name,
        description: p.description || p.name,
        isDefault:   p.isDefault,
        status:      p.status,
      }));
    }
  } catch (err) {
    console.error("get-printers (Chromium) failed:", err.message);
  }

  // ── Source 2: PowerShell Get-Printer (Windows only) ─────────────────────
  if (process.platform === "win32") {
    try {
      const raw = execSync(
        'powershell -NoProfile -NonInteractive -Command ' +
        '"Get-Printer | Select-Object Name,Default | ConvertTo-Json -Compress"',
        { timeout: 6000, windowsHide: true }
      ).toString().trim();

      if (raw) {
        // PowerShell returns a single object (not array) when only one printer.
        let parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) parsed = [parsed];

        if (parsed.length > 0) {
          return parsed.map((p) => ({
            name:        p.Name        || "",
            description: p.Name        || "",
            isDefault:   p.Default === true,
            status:      0,
          })).filter((p) => p.name);
        }
      }
    } catch (err) {
      console.error("get-printers (PowerShell) failed:", err.message);
    }

    // ── Source 3: wmic fallback ───────────────────────────────────────────
    try {
      const raw = execSync(
        'wmic printer get Name,Default /format:csv',
        { timeout: 6000, windowsHide: true }
      ).toString();

      const lines = raw.split(/\r?\n/).filter(Boolean);
      // First non-empty line is "Node,Default,Name"
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIdx    = header.indexOf("name");
      const defaultIdx = header.indexOf("default");

      if (nameIdx >= 0) {
        const printers = lines.slice(1).map((line) => {
          const cols = line.split(",");
          return {
            name:        (cols[nameIdx]    || "").trim(),
            description: (cols[nameIdx]    || "").trim(),
            isDefault:   (cols[defaultIdx] || "").trim().toLowerCase() === "true",
            status:      0,
          };
        }).filter((p) => p.name && p.name !== "Name");

        if (printers.length > 0) return printers;
      }
    } catch (err) {
      console.error("get-printers (wmic) failed:", err.message);
    }
  }

  return [];
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
const isPdfPrinter = (name = "") => /pdf|xps|onenote|fax|document writer|virtual/i.test(name);

ipcMain.handle("print-estimate", async (event, estimateData) => {
  return new Promise(async (resolve) => {
    const isDev = process.env.NODE_ENV === "development";

    // Extract printer name before passing payload to template.
    let { printerName, ...templateData } = estimateData;

    // Safety net: if the saved printer is a virtual PDF writer, auto-switch to
    // the first real physical printer so the job never becomes a file download.
    if (!printerName || isPdfPrinter(printerName)) {
      try {
        const list = await mainWindow.webContents.getPrintersAsync();
        const real = list.find((p) => !isPdfPrinter(p.name));
        if (real) {
          printerName = real.name;
          console.log("print-estimate: switched from PDF writer to real printer:", printerName);
        } else {
          resolve({ ok: false, error: "No physical printer found. Connect your TSC printer and try again." });
          return;
        }
      } catch (_) {
        resolve({ ok: false, error: "Could not enumerate printers." });
        return;
      }
    }

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
                // Route to the chosen thermal printer.
                deviceName:      printerName,
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
