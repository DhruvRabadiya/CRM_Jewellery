/**
 * permissions.js — Canonical Permission Registry (Frontend)
 * ───────────────────────────────────────────────────────────
 * Mirror of backend/src/utils/permissions.js.
 *
 * HOW TO ADD A NEW PERMISSION
 * ───────────────────────────
 * 1. Add one entry to the PERMISSIONS object below.
 * 2. Add its UI metadata to the appropriate group in PERMISSION_GROUPS.
 * 3. Mirror the key in backend/src/utils/permissions.js.
 * 4. Guard the relevant backend route and frontend component.
 *
 * ADMIN role always has ALL permissions — these keys only govern EMPLOYEE access.
 */

export const PERMISSIONS = {
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

export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS);

/**
 * Groups used by the Access Panel UI.
 * Each group renders as a separate card with its own colour accent.
 * Adding a new permission = add one item to the relevant group here.
 */
export const PERMISSION_GROUPS = [
  // ── Production Area ─────────────────────────────────────────────────────────
  {
    key:    'prod_navigation',
    label:  'Production — Navigation',
    desc:   'Which production-area pages this employee can see',
    color:  'blue',
    area:   'production',
    items: [
      {
        key:   PERMISSIONS.VIEW_DASHBOARD,
        label: 'Dashboard',
        desc:  'View the main production dashboard and summary stats',
      },
      {
        key:   PERMISSIONS.VIEW_STOCK,
        label: 'Stock Management',
        desc:  'View and interact with raw-material stock records',
      },
      {
        key:   PERMISSIONS.VIEW_PRODUCTION,
        label: 'Production Floor',
        desc:  'View the production jobs table and start/complete stages',
      },
      {
        key:   PERMISSIONS.VIEW_FINISHED_GOODS,
        label: 'Finished Goods',
        desc:  'View finished goods inventory and packing records',
      },
    ],
  },
  {
    key:   'prod_actions',
    label: 'Production — Actions',
    desc:  'What this employee can do on the Production Floor',
    color: 'indigo',
    area:  'production',
    items: [
      {
        key:   PERMISSIONS.CREATE_JOBS,
        label: 'Create Jobs',
        desc:  'Create new process jobs on the production floor',
      },
      {
        key:   PERMISSIONS.EDIT_JOBS,
        label: 'Edit Jobs',
        desc:  'Edit details of existing in-progress jobs',
      },
      {
        key:   PERMISSIONS.DELETE_JOBS,
        label: 'Delete Jobs',
        desc:  'Permanently delete jobs and reverse all stock movements (destructive)',
      },
      {
        key:   PERMISSIONS.REVERT_JOBS,
        label: 'Revert Process Steps',
        desc:  'Revert a completed stage back to pending and undo stock changes',
      },
    ],
  },

  // ── Selling Counter ──────────────────────────────────────────────────────────
  {
    key:   'sell_navigation',
    label: 'Selling Counter — Navigation',
    desc:  'Which selling counter pages this employee can access',
    color: 'violet',
    area:  'selling',
    items: [
      {
        key:   PERMISSIONS.SELL_VIEW_DASHBOARD,
        label: 'Dashboard',
        desc:  'View the selling counter daily summary and stats',
      },
      {
        key:   PERMISSIONS.SELL_VIEW_STOCKS,
        label: 'Stocks',
        desc:  'View and manage counter stock inventory',
      },
      {
        key:   PERMISSIONS.SELL_VIEW_SVG,
        label: 'SVG Vault',
        desc:  'Access the SVG vault for secure item storage',
      },
      {
        key:   PERMISSIONS.SELL_VIEW_CUSTOMERS,
        label: 'Customers',
        desc:  'View and manage customer accounts',
      },
      {
        key:   PERMISSIONS.SELL_VIEW_LEDGER,
        label: 'Ledger',
        desc:  'View customer ledger statements and balances',
      },
      {
        key:   PERMISSIONS.SELL_VIEW_ROJ_MED,
        label: 'Roj Med',
        desc:  'Record daily cash entries and close the day',
      },
      {
        key:   PERMISSIONS.SELL_VIEW_ESTIMATE,
        label: 'Estimate / Bills',
        desc:  'Create and manage customer estimates and bills',
      },
    ],
  },
];

/** Default permissions granted to a newly created EMPLOYEE (must match backend). */
export const DEFAULT_EMPLOYEE_PERMISSIONS = [
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
