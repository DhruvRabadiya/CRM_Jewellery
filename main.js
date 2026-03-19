const { app, BrowserWindow } = require("electron");
const path = require("path");
const { fork } = require("child_process");

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true, // Hide the default 'File, Edit, View' menu for a native feel
  });

  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // In development mode, load the Vite dev server
    mainWindow.loadURL("http://localhost:5173");
  } else {
    // In production mode, load the static compiled Vite file
    mainWindow.loadFile(path.join(__dirname, "frontend", "dist", "index.html"));
  }

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

function startBackend() {
  // If we are in production, we skip this if they are packaged together,
  // or we launch the backend script directly from the package.
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev) {
    console.log("Starting backend in production mode...");
    const backendPath = path.join(__dirname, "backend", "src", "app.js");

    // Set up correct data paths for packaged electron format (app.asar is readonly)
    const dbPath = path.join(app.getPath("userData"), "jewelry.db");

    backendProcess = fork(backendPath, [], {
      env: { ...process.env, NODE_ENV: "production", DB_PATH: dbPath, PORT: "3000" },
    });

    backendProcess.on("error", (err) => {
      console.error("Failed to start backend process.", err);
    });
  }
}

app.whenReady().then(() => {
  // Start backend silently in production. In dev, concurrently does it.
  if (process.env.NODE_ENV !== "development") {
    startBackend();
  }

  // Wait a second for backend to boot up before showing window
  setTimeout(createWindow, 2000);
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  // Kill the backend child process when Electron exits
  if (backendProcess) {
    backendProcess.kill();
  }
});

app.on("activate", function () {
  if (mainWindow === null) createWindow();
});
