'use strict';

/**
 * preload.js — Electron context bridge
 * ───────────────────────────────────────
 * Runs in an isolated context BEFORE the renderer page loads.
 * Exposes a curated, typed API surface as window.electronAPI so the
 * renderer can call IPC handlers without ever having access to the full
 * Node.js runtime (nodeIntegration: false, contextIsolation: true).
 *
 * Security model:
 *   - Only the four IPC channels used by the app are exposed.
 *   - No Node.js builtins (fs, path, require, etc.) are forwarded.
 *   - All arguments are passed through as-is; the main process validates them.
 *
 * Renderer usage:
 *   const printers = await window.electronAPI.getPrinters();
 *   const pref     = await window.electronAPI.getPrinterPref();
 *   await window.electronAPI.savePrinterPref({ printerName: 'HP LaserJet' });
 *   const result   = await window.electronAPI.printEstimate(data);
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Returns the list of printers installed on the system. */
  getPrinters: () =>
    ipcRenderer.invoke('get-printers'),

  /** Returns the saved printer preference { printerName: string }. */
  getPrinterPref: () =>
    ipcRenderer.invoke('get-printer-pref'),

  /**
   * Persists the selected printer preference.
   * @param {{ printerName: string }} pref
   */
  savePrinterPref: (pref) =>
    ipcRenderer.invoke('save-printer-pref', pref),

  /**
   * Sends estimate data to the main process for silent thermal printing.
   * @param {object} estimateData  — structured print payload + printerName
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  printEstimate: (estimateData) =>
    ipcRenderer.invoke('print-estimate', estimateData),
});
