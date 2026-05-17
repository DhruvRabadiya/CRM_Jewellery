'use strict';

/**
 * permissions.js — Canonical Permission Registry (Backend)
 * ──────────────────────────────────────────────────────────
 * Single source of truth for every permission key in the system.
 *
 * HOW TO ADD A NEW PERMISSION
 * ───────────────────────────
 * 1. Add one entry to the PERMISSIONS object below.
 * 2. Mirror it in frontend/src/utils/permissions.js (labels + group).
 * 3. Guard the relevant backend route with requirePermission() if needed.
 * 4. Guard the relevant frontend component with hasPermission().
 * That's it — no migration needed (the column stores arbitrary JSON).
 *
 * ADMIN role always has ALL permissions — these keys only govern EMPLOYEE access.
 */

const PERMISSIONS = {
  // ── Production Area — Navigation ─────────────────────────────────────────────
  VIEW_DASHBOARD:        'view_dashboard',
  VIEW_STOCK:            'view_stock',
  VIEW_PRODUCTION:       'view_production',
  VIEW_FINISHED_GOODS:   'view_finished_goods',

  // ── Production Area — Actions ────────────────────────────────────────────────
  CREATE_JOBS:           'create_jobs',
  EDIT_JOBS:             'edit_jobs',
  DELETE_JOBS:           'delete_jobs',
  REVERT_JOBS:           'revert_jobs',

  // ── Selling Counter — Navigation ─────────────────────────────────────────────
  SELL_VIEW_DASHBOARD:   'sell_view_dashboard',
  SELL_VIEW_STOCKS:      'sell_view_stocks',
  SELL_VIEW_SVG:         'sell_view_svg',
  SELL_VIEW_CUSTOMERS:   'sell_view_customers',
  SELL_VIEW_LEDGER:      'sell_view_ledger',
  SELL_VIEW_ROJ_MED:     'sell_view_roj_med',
  SELL_VIEW_ESTIMATE:    'sell_view_estimate',
};

/** Flat array of every valid permission key — used for server-side validation. */
const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS);

/**
 * Default set of permissions granted to a newly created EMPLOYEE account.
 * Admins can adjust this per-user from the Access Panel.
 */
const DEFAULT_EMPLOYEE_PERMISSIONS = [
  // Production area defaults
  PERMISSIONS.VIEW_DASHBOARD,
  PERMISSIONS.VIEW_PRODUCTION,
  PERMISSIONS.VIEW_FINISHED_GOODS,
  PERMISSIONS.CREATE_JOBS,
  // Selling counter defaults
  PERMISSIONS.SELL_VIEW_DASHBOARD,
  PERMISSIONS.SELL_VIEW_CUSTOMERS,
  PERMISSIONS.SELL_VIEW_ESTIMATE,
];

module.exports = { PERMISSIONS, ALL_PERMISSION_KEYS, DEFAULT_EMPLOYEE_PERMISSIONS };
