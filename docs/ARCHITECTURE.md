# JewelCRM — Architecture Reference

## Three-Process Model

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Shell (main.js)              │
│  • Creates BrowserWindow                                 │
│  • Forks backend child process (production)             │
│  • Exposes 4 IPC channels via preload.js / contextBridge│
└────────┬──────────────────────────────┬─────────────────┘
         │  file:// (prod)              │  fork()
         │  localhost:5173 (dev)        ▼
         ▼                    ┌─────────────────────┐
┌──────────────────┐          │  Express Backend     │
│  React Frontend  │◄────────►│  localhost:3000      │
│  (Vite / Hash   │  REST/JWT │  SQLite (WAL)        │
│   Router)        │          │  127.0.0.1 only      │
└──────────────────┘          └─────────────────────┘
```

---

## Electron IPC

The preload script (`preload.js`) uses `contextBridge.exposeInMainWorld` to
expose exactly four methods as `window.electronAPI`:

| Method                        | IPC channel       | Purpose                          |
|-------------------------------|-------------------|----------------------------------|
| `getPrinters()`               | `get-printers`    | List installed printers          |
| `getPrinterPref()`            | `get-printer-pref`| Load saved thermal printer name  |
| `savePrinterPref(pref)`       | `save-printer-pref`| Persist printer selection       |
| `printEstimate(data)`         | `print-estimate`  | Silent thermal print (80 mm)     |

No other Node APIs are accessible from renderer code.
`nodeIntegration: false`, `contextIsolation: true` are enforced.

---

## Database Schema (key tables)

### Core stock

| Table                  | Purpose                                             |
|------------------------|-----------------------------------------------------|
| `stock_master`         | One row per metal type — aggregated weight columns  |
| `stock_transactions`   | Full audit ledger for every stock movement          |
| `_db_meta`             | Schema version tracking (`schema_version`, `needs_seed`) |

### Manufacturing

| Table                  | Purpose                                             |
|------------------------|-----------------------------------------------------|
| `melting_process`      | Melting jobs                                        |
| `rolling_processes`    | Rolling jobs                                        |
| `press_processes`      | Press jobs                                          |
| `tpp_processes`        | Tinning/plating/polishing jobs                      |
| `packing_processes`    | Packing jobs                                        |
| `process_return_items` | Return line items for all process types             |
| `finished_goods`       | Post-packing inventory (pieces + weight ledger)     |

### Selling

| Table                    | Purpose                                           |
|--------------------------|---------------------------------------------------|
| `counter_inventory`      | Counter stock (pieces, category, size)            |
| `svg_inventory`          | SVG vault inventory                               |
| `customers`              | CRM party records                                 |
| `order_bills`            | Estimates / bills (header)                        |
| `order_bill_items`       | Estimate line items                               |
| `customer_ledger_entries`| Double-entry ledger per customer (money + metal)  |
| `counter_cash_ledger`    | Cash/bank receipts at counter                     |
| `labour_charges`         | Admin-configured LC rates (Metal › Category › Size)|

### Accounting

| Table              | Purpose                             |
|--------------------|-------------------------------------|
| `roj_med_days`     | Daily accounting sessions           |
| `roj_med_entries`  | Individual ledger lines per day     |

---

## Authentication Flow

```
POST /api/auth/login
  → authController.loginUser
  → db.pGet users WHERE username = ?
  → bcrypt.compare (always runs — timing-attack guard)
  → jwt.sign { id, username, role }  exp: 24h
  → { token, user }

All other /api/* routes
  → authMiddleware.authenticateToken
  → jwt.verify(token, JWT_SECRET)
  → req.user = { id, username, role }
  → next()

Admin-only routes
  → requireAdmin middleware
  → req.user.role === 'ADMIN' or 403
```

---

## Estimate / Billing Flow

```
Frontend: OrderBills.jsx
  → POST /api/estimates  (createBill)
  → orderBillService.createBill(data)
      1. _validateBillInput(data)          — deep validation + normalizePaymentEntries
      2. getNextObNo()                     — MAX(ob_no) + 1
      3. _resolveCustomerId(data)          — find-or-create CRM record
      4. _computeSummary(items, payments)  — computeEstimateBalance (pure)
      5. db.runTransaction(async run => {
           counterService.assertStockAvailable(items)   // if status is stock-active
           INSERT order_bills (header)
           _insertItems(run, billId, items)
           counterService.reserveEstimateStock(...)     // write -ve counter_inventory rows
           _insertAccountingEntries(...)                // ledger + cash_ledger + stock_transactions
           _applyOutstandingDelta(...)                  // sync customers.outstanding_balance
         })
```

### Bill status and stock

| `order_status` | Counter stock reserved? |
|----------------|------------------------|
| `Pending`      | No (items not yet produced) |
| `Ready`        | Yes                     |
| `Delivered`    | Yes                     |

`isBillStockActive(status)` from `constants.js` controls this.

---

## Schema Migrations

Migrations live in `backend/config/db/migrations/`:

| File                             | What it does                                      |
|----------------------------------|---------------------------------------------------|
| `001_base_schema.js`             | All core tables                                   |
| `002_data_fixes.js`              | Data type corrections                             |
| `003_backfills.js`               | Backfill default values                           |
| `004_order_bill_status_columns.js` | Add order_status, delivery_date                 |
| `005_roj_med.js`                 | Daily accounting tables                           |
| `006_metal_purchase.js`          | Metal purchase tracking                           |
| `007_bank_tracking.js`           | Bank/UPI ledger columns                           |
| `008_performance_indexes.js`     | ~30 indexes on high-frequency query columns       |

The runner (`runner.js`) detects schema version in `_db_meta`, applies pending
migrations in order, each in its own `BEGIN IMMEDIATE TRANSACTION`.

---

## Security Headers

Applied by `middleware/securityHeaders.js` to every response:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0` (modern browsers use CSP instead)
- `Content-Security-Policy: default-src 'self'`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Powered-By` header removed

---

## Logging

`backend/src/utils/logger.js` provides structured logging:

- **Development**: colorized human-readable (`[INFO] message {meta}`)
- **Production**: JSON lines (`{"level":"info","message":"...","meta":{...},"ts":"..."}`)

Usage: `logger.info(msg, meta?)`, `logger.warn(...)`, `logger.error(...)`, `logger.debug(...)`

---

## Frontend State

| Context              | What it manages                                      |
|----------------------|------------------------------------------------------|
| `AuthContext`        | JWT token (localStorage), decoded user, `isAdmin`    |
| `SellingSyncContext` | Cross-module cache invalidation (counter, estimates) |

`axiosConfig.js` injects `Authorization: Bearer <token>` on every request and
redirects to `/login` on 401/403.

---

## Thermal Printing

1. Frontend calls `window.electronAPI.printEstimate(estimateData)`.
2. Main process creates a hidden `BrowserWindow` (380 × 1400 px).
3. Loads `frontend/dist/print-template.html`.
4. Injects `window.__ESTIMATE_DATA__` via `executeJavaScript`.
5. Waits 400 ms for render, then calls `webContents.print()` with:
   - `silent: true` (no dialog)
   - `deviceName: printerName` (saved preference)
   - `pageSize: { width: 80000, height: 297000 }` (80 mm thermal)
   - `margins: { marginType: 'none' }`
6. Timeout: 20 s before auto-close.

---

## Scalability Notes

The current architecture is well-suited for single-shop production use.
For future scale:

- **Multiple branches**: Add a `branch_id` column to stock/process/bill tables +
  branch-scoped JWT claims + tenant middleware.
- **Cloud sync**: Replace SQLite with PostgreSQL; the service layer's
  `pRun/pGet/pAll` abstractions can be swapped for a PG adapter.
- **Concurrent users**: The Express backend and SQLite WAL mode handle moderate
  concurrency. For 100+ concurrent users, move to PostgreSQL.
- **SaaS**: Add an organisation table + row-level `org_id` scoping.

