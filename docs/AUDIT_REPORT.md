# JewelCRM — Production Audit Report

**Date**: 2026-05-12  
**Scope**: Full codebase — backend, frontend, Electron shell, migrations, config  
**Status**: All critical and high-risk items resolved ✓

---

## Executive Summary

The codebase has been audited and refactored across 15 areas. All critical security
vulnerabilities, all syntax-breaking truncations, and all callback-in-Promise
anti-patterns have been resolved. Zero raw `db.run/get/all` callbacks remain
in any service file. Zero console statements remain outside the logger.

---

## 1. Files Fixed / Created

### New Files

| File                                           | Purpose                              |
|------------------------------------------------|--------------------------------------|
| `preload.js`                                   | Electron contextBridge (4 IPC channels) |
| `backend/src/utils/logger.js`                  | Structured logger (dev/prod modes)  |
| `backend/src/middleware/errorHandler.js`       | Global Express error handler         |
| `backend/src/middleware/rateLimiter.js`        | In-memory sliding-window rate limiter|
| `backend/src/middleware/securityHeaders.js`    | Manual helmet-equivalent headers     |
| `backend/config/db/migrations/008_performance_indexes.js` | ~30 DB indexes     |
| `docs/ARCHITECTURE.md`                         | System architecture reference        |
| `docs/AUDIT_REPORT.md`                         | This file                            |

### Modified Files (key changes)

| File                                      | Change                                              |
|-------------------------------------------|-----------------------------------------------------|
| `main.js`                                 | nodeIntegration=false, contextIsolation=true, preload |
| `backend/src/app.js`                      | Security middleware, restricted CORS, rate limits, 127.0.0.1 bind |
| `backend/src/middleware/authMiddleware.js`| Replaced console.warn with logger                   |
| `backend/src/controllers/authController.js` | Async/await, timing-attack guard, input validation |
| `backend/src/services/stockService.js`    | Full async/await migration                          |
| `backend/src/services/rojMedService.js`   | Removed duplicate local helpers                     |
| `backend/src/services/customerService.js`| Full async/await, Promise.all for pagination        |
| `backend/src/services/counterService.js` | Full async/await migration                          |
| `backend/src/services/orderBillService.js` | Surgical async/await migration                    |
| `backend/src/services/meltingService.js` | Full async/await migration                          |
| `backend/src/services/rollingService.js` | Full async/await migration                          |
| `backend/src/services/pressService.js`   | Full async/await migration                          |
| `backend/src/services/tppService.js`     | Full async/await migration                          |
| `backend/src/services/packingService.js` | Full async/await migration                          |
| `backend/src/services/labourChargeService.js` | Full async/await migration                    |
| `backend/src/services/jobService.js`     | Full async/await migration                          |
| `backend/src/services/svgService.js`     | Full async/await migration                          |
| `backend/src/services/sellingDashboardService.js` | Full async/await migration                 |
| `backend/config/db/migrations/runner.js` | Added migration 008, fixed dynamic CURRENT_VERSION  |
| `frontend/src/pages/OrderBills.jsx`      | IPC: window.require → window.electronAPI            |
| `.gitignore`                             | Expanded to cover all build/runtime artifacts       |

### Deleted Files (confirmed unused)

| File                                             | Reason                     |
|--------------------------------------------------|----------------------------|
| `backend/src/services/sellingBillService.js`     | Deprecated stub            |
| `backend/src/controllers/sellingBillController.js` | Deprecated stub          |
| `backend/src/routes/sellingBillRoutes.js`        | Deprecated stub            |
| `frontend/src/api/sellingBillApiService.js`      | Deprecated stub            |
| `frontend/src/pages/SellingBilling.jsx`          | Deprecated stub            |
| `backend/check_tables.js`                        | Debug script               |
| `backend/debug_inventory.js`                     | Debug script               |
| `backend/debug_validation.js`                    | Debug script               |
| `backend/migrate_pieces.js`                      | Ad-hoc migration           |
| `backend/cleanup_finished_goods.js`              | Debug script               |
| `replace_printview.py`                           | Root-level artifact        |
| `PRINTVIEW_REPLACEMENT_SUMMARY.txt`              | Root-level artifact        |

---

## 2. Security Findings

### CRITICAL (fixed)

| Finding | Risk | Fix |
|---------|------|-----|
| `nodeIntegration: true` in Electron | Remote code execution if XSS occurs | Set to `false` |
| `contextIsolation: false` in Electron | Full Node.js access from renderer | Set to `true` + preload.js |
| `window.require("electron")` in renderer | Bypasses contextIsolation | Replaced with `window.electronAPI.*` |
| No security headers | Clickjacking, MIME sniffing, XSS | Added `securityHeaders` middleware |
| Backend bound to `0.0.0.0` | Accessible on LAN without auth | Changed to `127.0.0.1` |
| Wildcard CORS `app.use(cors())` | Any origin can call the API | Restricted to localhost + null origin |

### HIGH (fixed)

| Finding | Risk | Fix |
|---------|------|-----|
| No rate limiting on login | Brute-force password attacks | `authRateLimiter` (20 req/15 min) |
| No API rate limiting | DoS via high request volume | `apiRateLimiter` (300 req/min) |
| User enumeration via timing | Attacker can identify valid usernames | Always run `bcrypt.compare` |
| `console.warn` for JWT secret missing | Secret in logs in production | Replaced with structured `logger.warn` |
| No global error handler | Stack traces leak to client in dev | Added `errorHandler` middleware |

### MEDIUM (fixed)

| Finding | Risk | Fix |
|---------|------|-----|
| Short minimum password length | Weak user accounts | Enforced `MIN_PASSWORD_LENGTH = 6` |
| Username min length not validated | Single-char usernames allowed | Enforced 3-char minimum |
| UNIQUE constraint error exposed as 500 | Leaks implementation details | Returns 409 with friendly message |

---

## 3. Performance Findings

### Database Indexes (migration 008)

Added ~30 indexes covering:

- `stock_transactions(metal_type, transaction_type, reference_type+reference_id)`
- `order_bills(date, customer_id, ob_no, order_status)`
- `order_bill_items(bill_id)`
- `customer_ledger_entries(customer_id, reference_type+reference_id, entry_date)`
- `counter_cash_ledger(reference_type+reference_id, entry_date)`
- All five process tables: `(status)`, `(metal_type, status)`
- `process_return_items(process_id, process_type)`
- `finished_goods(metal_type, target_product)`
- `customers(party_name, phone_no)`

### Async/Await Migration

All 13 service files migrated from callback-in-Promise anti-pattern to
`async/await` with `db.pRun/pGet/pAll`. Benefits:

- Errors now propagate correctly through the call stack (no more silently
  swallowed errors inside callback chains).
- Stack traces are readable.
- Code is linear and debuggable.

### Pagination (customerService)

`getAllCustomersPaginated` now uses `Promise.all` to run the COUNT and data
queries concurrently instead of sequentially, halving DB round-trips.

---

## 4. Code Quality Findings

### Removed

- 12 dead/debug files (see Deleted Files above)
- Duplicate local `run/get/all` helper functions that re-implemented `db.pRun/pGet/pAll`
  in each service file (found in `rojMedService`, `counterService`, `sellingDashboardService`)
- Duplicate IIFE in `app.js` (garbled block from truncated write)
- `require('body-parser')` — replaced with built-in `express.json()`

### Added

- `'use strict'` directive to all refactored backend files
- JSDoc on all public service functions in refactored files
- Whitelisted column sets (`VALID_*_COLUMNS`) prevent SQL injection via
  dynamic `UPDATE` construction in all process edit functions

---

## 5. Architecture Findings

### Three-Layer Pattern (enforced)

```
Route → Controller → Service → DB
```
No direct DB access in controllers or routes. All DB access goes through
service functions which use `db.pRun/pGet/pAll` or `db.runTransaction`.

### IPC Security Model

Before: `window.require("electron").ipcRenderer.invoke(...)` — direct Node.js
access from renderer, bypasses `contextIsolation`.

After: `window.electronAPI.*` — only 4 methods exposed via `contextBridge`,
zero Node.js APIs directly accessible from renderer.

---

## 6. Remaining Recommendations (future work)

| Priority | Item                                             |
|----------|--------------------------------------------------|
| HIGH     | Set a strong `JWT_SECRET` in production `.env`   |
| HIGH     | Change default admin password on first login     |
| MEDIUM   | Add request-body size limit (`express.json({ limit: '1mb' })`) |
| MEDIUM   | Add request logging middleware (Morgan or custom) |
| MEDIUM   | Add E2E tests for the estimate creation flow     |
| LOW      | TypeScript migration (start with service layer)  |
| LOW      | Add `helmet` package when network access allows  |
| LOW      | Consider refresh-token strategy (current: 24h JWT) |
| LOW      | Soft-delete for customers (add `deleted_at` column) |
| LOW      | Branch/multi-tenant: add `branch_id` to all tables |

---

## 7. Verification

Final state:

```
node --check (all JS files, no node_modules/dist): 0 failures
Raw db callbacks in services:                       0
console.* outside logger.js:                        0
Syntax errors introduced by migration:              0
```

