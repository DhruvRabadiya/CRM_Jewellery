/**
 * billStatuses.js — Single source of truth for estimate/order workflow statuses.
 *
 * Adding a new status in future:
 *   1. Add it to BILL_STATUS_LIST
 *   2. Add its config object to BILL_STATUS_CONFIG
 *   3. If it should bypass stock ops, add it to BILL_STATUS_NO_STOCK
 *   4. Mirror the change in backend/src/utils/constants.js
 *
 * No other files need to change.
 */

export const BILL_STATUS_LIST = ["Pending", "Ready", "Delivered"];

// Statuses where counter-stock should NOT be reserved/validated.
// Mirrors backend/src/utils/constants.js → BILL_STATUS_NO_STOCK
export const BILL_STATUS_NO_STOCK = ["Pending"];

/** Returns true when the given status requires stock reservation + validation. */
export const isStockActive = (status) =>
  !BILL_STATUS_NO_STOCK.includes(status || "Ready");

/**
 * Per-status UI configuration.
 * Drives colors, labels, and help-text throughout the estimate form + list view.
 */
export const BILL_STATUS_CONFIG = {
  Pending: {
    label:       "Pending",
    description: "Awaiting production — items not yet in stock",
    stockActive: false,
    // Tailwind class groups
    badgeClass:   "bg-amber-100 text-amber-700",
    borderClass:  "border-amber-300",
    bgClass:      "bg-amber-50",
    textClass:    "text-amber-700",
    accentFrom:   "from-amber-50",
    buttonClass:  "bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300",
    ringClass:    "focus:ring-amber-300",
    pillActive:   "bg-amber-50 border-amber-500 text-amber-700",
    pillInactive: "bg-white border-slate-200 text-slate-400 hover:border-slate-300",
  },
  Ready: {
    label:       "Ready",
    description: "In stock — items ready for delivery",
    stockActive: true,
    badgeClass:   "bg-indigo-100 text-indigo-700",
    borderClass:  "border-indigo-300",
    bgClass:      "bg-indigo-50",
    textClass:    "text-indigo-700",
    accentFrom:   "from-indigo-50",
    buttonClass:  "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300",
    ringClass:    "focus:ring-indigo-300",
    pillActive:   "bg-indigo-50 border-indigo-500 text-indigo-700",
    pillInactive: "bg-white border-slate-200 text-slate-400 hover:border-slate-300",
  },
  Delivered: {
    label:       "Delivered",
    description: "Customer received — transaction complete",
    stockActive: true,
    badgeClass:   "bg-emerald-100 text-emerald-700",
    borderClass:  "border-emerald-300",
    bgClass:      "bg-emerald-50",
    textClass:    "text-emerald-700",
    accentFrom:   "from-emerald-50",
    buttonClass:  "bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400",
    ringClass:    "focus:ring-emerald-300",
    pillActive:   "bg-emerald-50 border-emerald-500 text-emerald-700",
    pillInactive: "bg-white border-slate-200 text-slate-400 hover:border-slate-300",
  },
};

/** Fallback config for unknown / legacy status values. */
export const getStatusConfig = (status) =>
  BILL_STATUS_CONFIG[status] || BILL_STATUS_CONFIG.Ready;
