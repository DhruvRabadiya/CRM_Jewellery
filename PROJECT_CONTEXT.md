# JewelCRM — Complete Project Context

> **Purpose of this file:** Hand this document to any AI agent (or yourself) to get full context on the JewelCRM codebase without needing to read every source file. It covers architecture, database schema, API routes, frontend structure, business logic, and key conventions.

---

## 1. What This App Is

**JewelCRM** is an Electron desktop application for jewellery manufacturing workflow management. It is a self-contained Windows desktop app that bundles three processes:

| Process | Technology | Port |
|---|---|---|
| React SPA (frontend) | React 19 + Vite | `5173` (dev) / `file://` (prod) |
| REST API (backend) | Express.js + SQLite | `3000` |
| Desktop shell | Electron | — |

### Core Purpose
- Track raw metal stock (Gold 24K, Gold 22K, Silver) through the full manufacturing cycle
- Manage production stages: Melting → Rolling → Press → TPP → Packing → Finished Goods
- Manage the selling counter: Customers, Estimates (Order Bills), Counter Inventory, Sales Vault
- Maintain a full accounting ledger per customer (receivables/payables)

---

## 2. Tech Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js 4.x
- **Database:** SQLite via `sqlite3` (callback-based, Promise-wrapped per service)
- **Auth:** JWT (`jsonwebtoken`) + `bcryptjs` for password hashing
- **Validation:** `joi`
- **Env:** `dotenv`
- **Dev:** `nodemon`

### Frontend
- **Framework:** React 19 + Vite 7
- **Routing:** `react-router-dom` 7 with **HashRouter** (required for Electron `file://`)
- **HTTP:** `axios` with interceptors for auth token injection
- **Styling:** Tailwind CSS 4 (custom colors: `gold #d4af37`, `silver #c0c0c0`, `dark #1a1a1a`)
- **Icons:** `lucide-react`
- **Auth Decode:** `jwt-decode`

### Desktop
- **Shell:** Electron
- **Build:** `electron-builder` → Windows NSIS installer
- **Note:** `asar: false` — backend Node.js files stay directly accessible at runtime

---

## 3. Environment Variables

| File | Key | Description |
|---|---|---|
| `backend/.env` | `PORT=3000` | API port |
| `backend/.env` | `JWT_SECRET` | JWT signing secret |
| `backend/.env` | `DB_PATH=./jewelry.db` | SQLite file path |
| `backend/.env` | `DEFAULT_ADMIN_PASSWORD` | Seed admin password |
| `frontend/.env` | `VITE_API_URL=http://localhost:3000/api` | API base URL |

In production, `DB_PATH` points to Electron's `userData` directory for persistence across app updates.

---

## 4. Project Directory Structure

```
CRM_Jewellery/
├── main.js                          # Electron entry point
├── package.json                     # Root: concurrently, electron, electron-builder
│
├── backend/
│   ├── config/
│   │   └── dbConfig.js              # SQLite init, table creation, migrations, seed data
│   └── src/
│       ├── app.js                   # Express app setup, route mounting
│       ├── controllers/             # 15 controllers
│       │   ├── authController.js
│       │   ├── stockController.js
│       │   ├── meltingController.js
│       │   ├── rollingController.js
│       │   ├── pressController.js
│       │   ├── tppController.js
│       │   ├── packingController.js
│       │   ├── jobController.js
│       │   ├── customerController.js
│       │   ├── orderBillController.js
│       │   ├── sellingBillController.js
│       │   ├── counterController.js
│       │   ├── svgController.js
│       │   ├── labourChargeController.js
│       │   └── sellingDashboardController.js
│       ├── middleware/
│       │   └── authMiddleware.js    # JWT verify + requireAdmin guard
│       ├── routes/                  # 16 route files
│       │   ├── authRoutes.js
│       │   ├── stockRoutes.js
│       │   ├── meltingRoutes.js
│       │   ├── rollingRoutes.js
│       │   ├── pressRoutes.js
│       │   ├── tppRoutes.js
│       │   ├── packingRoutes.js
│       │   ├── jobRoutes.js
│       │   ├── customerRoutes.js
│       │   ├── orderBillRoutes.js
│       │   ├── counterRoutes.js
│       │   ├── svgRoutes.js
│       │   ├── labourChargeRoutes.js
│       │   ├── sellingDashboardRoutes.js
│       │   ├── obRateRoutes.js      # DEPRECATED
│       │   └── sellingBillRoutes.js # DEPRECATED
│       ├── services/                # 14 business logic services
│       │   ├── stockService.js
│       │   ├── meltingService.js
│       │   ├── rollingService.js
│       │   ├── pressService.js
│       │   ├── tppService.js
│       │   ├── packingService.js
│       │   ├── jobService.js
│       │   ├── customerService.js
│       │   ├── orderBillService.js
│       │   ├── sellingBillService.js
│       │   ├── counterService.js
│       │   ├── svgService.js
│       │   ├── labourChargeService.js
│       │   └── sellingDashboardService.js
│       └── utils/
│           ├── constants.js         # Metal types, status enums, messages
│           └── common.js            # Helper functions (loss calc, validation)
│
└── frontend/
    ├── vite.config.js               # base: "./" — do not change for Electron
    ├── tailwind.config.js           # Custom color tokens
    └── src/
        ├── App.jsx                  # Router + role-based route guards
        ├── main.jsx                 # React entry point
        ├── api/                     # axios API service modules (mirror routes 1:1)
        │   ├── axiosConfig.js       # Bearer token injector, 401/403 redirect
        │   ├── stockService.js
        │   ├── meltingService.js
        │   ├── jobService.js
        │   ├── customerService.js
        │   ├── orderBillApiService.js
        │   ├── counterService.js
        │   ├── svgService.js
        │   ├── finishedGoodsService.js
        │   ├── labourChargeService.js
        │   └── sellingDashboardService.js
        ├── pages/                   # 16 page components
        │   ├── Login.jsx
        │   ├── ModeSelection.jsx
        │   ├── Dashboard.jsx
        │   ├── StockManagement.jsx
        │   ├── MeltingProcess.jsx
        │   ├── ProductionJobs.jsx
        │   ├── FinishedGoods.jsx
        │   ├── JobHistory.jsx
        │   ├── EmployeeManagement.jsx
        │   ├── SellingCounter.jsx
        │   ├── SvgCounter.jsx
        │   ├── Customers.jsx
        │   ├── SellingLedger.jsx
        │   ├── OrderBills.jsx
        │   ├── SellingDashboard.jsx
        │   └── SellingAdmin.jsx
        ├── components/
        │   ├── Modal.jsx
        │   ├── ConfirmModal.jsx
        │   ├── Toast.jsx
        │   └── forms/
        │       ├── AddStockForm.jsx
        │       └── EditStockForm.jsx
        ├── layouts/
        │   ├── MainLayout.jsx       # Production area: collapsible sidebar
        │   └── SellingLayout.jsx    # Selling area: horizontal top nav
        ├── context/
        │   ├── AuthContext.jsx      # JWT storage, user/role, login/logout
        │   └── SellingSyncContext.jsx
        └── utils/
            ├── formatHelpers.js
            └── metalUtils.js
```

---

## 5. Architecture Overview

### Three-Layer Backend (Routes → Controllers → Services)
- All DB access goes through `backend/config/dbConfig.js`
- SQLite is callback-based, wrapped in Promises per service
- `db.runTransaction(fn)` handles `BEGIN/COMMIT/ROLLBACK` for multi-step atomic operations
- Schema migrations: inline `PRAGMA table_info()` checks + `ALTER TABLE ... ADD COLUMN` (no migration framework)
- All routes (except `POST /api/auth/login`) require `Authorization: Bearer <token>`
- Admin-only routes additionally use `requireAdmin` middleware

### Frontend Auth Flow
- JWT stored in `localStorage`
- `AuthContext` decodes token with `jwt-decode` on load, exposes `isAdmin`
- `axiosConfig.js` injects Bearer token on every request, handles 401/403 by clearing token and redirecting to `/login`
- `App.jsx` has `ProtectedRoute` component for role-based access guards

### Two-Mode UI
After login, user picks a mode via `ModeSelection`:
1. **Production / MainLayout** — `/dashboard`, `/stock`, `/melting`, `/production`, `/finished`, `/employees`
2. **Selling / SellingLayout** — `/selling/dashboard`, `/selling/customers`, `/selling/orders`, `/selling/counter`, `/selling/svg`, `/selling/ledger`, `/selling/admin`

---

## 6. Key Domain & Business Logic

### Metal Types
Defined in `backend/src/utils/constants.js`:
```js
METAL_TYPES: { GOLD_24K: "Gold 24K", GOLD_22K: "Gold 22K", SILVER: "Silver" }
METAL_ORDER: ["Gold 24K", "Silver", "Gold 22K"]  // Display order
```
Silver tracked in grams; Gold (22K/24K) also in grams but with different purity calculations.

### Process Status Lifecycle
Every manufacturing stage follows: `PENDING → RUNNING → COMPLETED`
With endpoints: `create / start / complete / revert / edit / delete`

### Production Process Flow
```
Raw Stock
    ↓
Melting (standalone process)
    ↓
Rolling → Press → TPP → Packing   (sequential production job)
    ↓
Finished Goods inventory
    ↓
Counter Inventory  OR  SVG Vault (Sales Vault)
```

### Stock Ledger Logic
- `stock_master` — 3 rows (one per metal type), aggregated weights
- `stock_transactions` — Full audit ledger for all movements
- Transaction types: `PURCHASE`, `MELT_ISSUE`, `MELT_RETURN`, `JOB_ISSUE`, `JOB_RETURN`, `SCRAP_RETURN`, `ESTIMATE_METAL_IN`

### Estimate / Order Bill Flow
1. Create estimate with line items (metal type, category, size, pieces)
2. Fetch labour rates from `labour_charges` table (metal → category → size → customer tier: Retail/Showroom/Wholesale)
3. Calculate totals: item metal values + total labour charges
4. Apply discount → final amount
5. Record ledger entries: customer receivable, metal payment, cash/online split
6. Edit recalculates diffs; delete reverses all ledger entries atomically

### Labour Charges Structure
`labour_charges` table: `metal_type × category × size_label → { lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }`
Used in estimates to auto-fill per-item labour based on customer type.

### Customer Ledger
`customer_ledger_entries` tracks every DEBIT (sale) and CREDIT (payment/return) per customer. `outstanding_balance` on `customers` table is a running total.

---

## 7. Complete Database Schema

### Authentication
**`users`** — `id, username (UNIQUE), password_hash, role (ADMIN|EMPLOYEE), created_at`
- Default seed: `admin` / `admin123` (or `DEFAULT_ADMIN_PASSWORD` env)

### Stock
**`stock_master`** — `id, metal_type (UNIQUE), opening_stock, rolling_stock, press_stock, tpp_stock, inprocess_weight, total_loss`
- 3 hardcoded rows: Gold 24K, Gold 22K, Silver

**`stock_transactions`** — `id, date, metal_type, transaction_type, weight, description`

### Production Processes
All five process tables share the same schema pattern:

**`melting_process`** — `id, job_number, job_name, metal_type, unit(g), issue_weight, issue_size, issue_pieces, category, employee, description, status(PENDING|RUNNING|COMPLETED), created_at, start_time, end_time, completed_at, return_weight, return_pieces, scrap_weight, loss_weight`

**`rolling_processes`**, **`press_processes`**, **`tpp_processes`**, **`packing_processes`** — Same schema as melting_process

**`process_return_items`** — `id, process_id, process_type(melting|rolling|press|tpp|packing), category, return_weight, return_pieces, created_at`
- Supports multi-category returns from a single process run

**`production_jobs`** (Master job record) — `id, job_number, metal_type, target_product, current_step, status, issue_weight, current_weight, created_at`

**`job_steps`** (Audit trail) — `id, job_id(FK), step_name, issue_weight, return_weight, scrap_weight, loss_weight, return_pieces, created_at`

### Inventory
**`finished_goods`** — `id, metal_type, target_product, pieces, weight, created_at`

**`counter_inventory`** — `id, metal_type, target_product, category, size_label, size_value, pieces, reference_type, reference_id, notes, created_at`

**`svg_inventory`** (Sales Vault) — `id, metal_type, target_product, pieces, weight, created_at`

### Selling
**`customers`** — `id, party_name, firm_name, address, city, phone_no, telephone_no, customer_type(Retail|Showroom|Wholesale), outstanding_balance, created_at, updated_at`

**`selling_bills`** — `id, bill_no(UNIQUE), date, customer_id(FK), customer_name, customer_type, payment_mode(Cash|Online), cash_amount, online_amount, metal_payment_type, metal_purity, metal_weight, metal_rate, metal_value, subtotal, total_lc, discount, total_amount, amount_paid, outstanding_amount, notes, created_at`

**`selling_bill_items`** — `id, bill_id(FK), metal_type, category, custom_label, size, pieces, weight, rate_per_gram, metal_value, lc_pp, t_lc, sort_order`

**`selling_bill_metal_payments`** — `id, bill_id(FK), metal_type, purity, weight, rate, metal_value`

**`customer_ledger_entries`** — `id, customer_id(FK), entry_date, reference_type(SELLING_BILL|ORDER_BILL|MANUAL), reference_id, reference_no, transaction_type, payment_mode, line_type(DEBIT|CREDIT), metal_type, metal_purity, weight_delta, amount_delta, notes, created_at`

**`counter_cash_ledger`** — `id, entry_date, reference_type, reference_id, reference_no, mode(Cash|Online), amount, notes, created_at`

### Estimates (Order Bills)
**`order_bills`** — `id, ob_no(UNIQUE), date, products(JSON), customer_id, customer_name, customer_type(Retail|Showroom|Wholesale), fine_jama, rate_10g, amt_jama, cash_amount, online_amount, payment_mode, fine_diff, gold_rs, subtotal, discount, total_amount, amt_baki, refund_due, ofg_status, fine_carry, created_at`

**`order_bill_items`** — `id, bill_id(FK), metal_type, category, size_label, size_value, pcs, weight, lc_pp, t_lc, is_custom, sort_order`

### Labour Rates
**`labour_charges`** — `id, metal_type, category, size_label, size_value, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, sort_order, created_at, updated_at`
- Unique: `(metal_type, category, size_label)`
- 36 seed entries: 3 metals × categories × sizes × 3 pricing tiers

**`ob_labour_rates`** — LEGACY table, superseded by `labour_charges`

---

## 8. Complete API Reference

**Base URL:** `http://localhost:3000/api`
All routes require `Authorization: Bearer <jwt>` except `POST /auth/login`.

### Auth (`/api/auth`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/login` | Public | Authenticate, returns 24-hour JWT |
| POST | `/change-password` | User | Update own password |
| GET | `/users` | User | List all users |
| POST | `/users` | Admin | Create new user account |

### Stock (`/api/stock`)
| Method | Path | Description |
|---|---|---|
| GET | `/` | Current stock levels (all metals, all pools) |
| POST | `/add` | Purchase raw material stock |
| GET | `/purchases` | List all purchase transactions |
| GET | `/loss-stats` | Scrap & loss breakdown per process type |
| GET | `/scrap-loss-ledger` | Enhanced loss tracking with source breakdown |
| POST | `/recalculate` | Recompute stock from all process transactions |
| PUT | `/purchases/:id` | Edit a purchase entry |
| DELETE | `/purchases/:id` | Delete a purchase entry |

### Manufacturing Processes (`/api/melting`, `/api/rolling`, `/api/press`, `/api/tpp`, `/api/packing`)
All five process route groups follow the same pattern:
| Method | Path | Description |
|---|---|---|
| GET | `/` | List all processes (ordered by ID DESC) |
| POST | `/create` | Create new process (PENDING status) |
| POST | `/start` | Transition to RUNNING, set issued_weight & start_time |
| POST | `/complete` | Mark COMPLETED, capture return, scrap, loss weights |
| PUT | `/:id/edit` | Update any field (column-name whitelisted) |
| POST | `/:id/revert` | Revert back to PENDING |
| DELETE | `/:id/delete` | Delete process (cascade-deletes return_items) |

Melting additionally has: `GET /running` — list only RUNNING melts.

### Jobs (`/api/jobs`)
| Method | Path | Description |
|---|---|---|
| GET | `/combined` | Aggregate view: all process types with latest status |
| GET | `/next-id` | Get next sequential job number (JOB-0001, JOB-0002…) |
| GET | `/finished` | Finished goods inventory |
| DELETE | `/finished/:id` | Admin-only: remove invalid finished goods entry |

### Customers (`/api/customers`)
| Method | Path | Description |
|---|---|---|
| GET | `/` | List all customers |
| GET | `/:id` | Get customer by ID |
| POST | `/` | Create customer |
| PUT | `/:id` | Update customer |
| DELETE | `/:id` | Delete customer |
| GET | `/:id/ledger` | Customer-specific ledger entries |
| POST | `/:id/ledger/entries` | Add manual ledger entry |

### Estimates / Order Bills (`/api/estimates` or `/api/order-bills`)
| Method | Path | Description |
|---|---|---|
| GET | `/next-no` | Get next estimate bill number |
| GET | `/` | List all estimates |
| GET | `/:id` | Get estimate with full line items & metal payments |
| POST | `/` | Create estimate; validates items, calculates totals, logs ledger |
| PUT | `/:id` | Update estimate; recalculates totals, updates ledger diffs |
| DELETE | `/:id` | Delete estimate; reverts all ledger entries |
| POST | `/validate-stock` | Pre-check if ordered items can be fulfilled |

### Counter (`/api/counter`)
| Method | Path | Description |
|---|---|---|
| GET | `/inventory` | List counter_inventory items |
| POST | `/send` | Transfer finished goods → counter inventory |
| POST | `/return` | Return items from counter → finished goods |

### SVG Vault (`/api/svg`)
| Method | Path | Description |
|---|---|---|
| GET | `/inventory` | List SVG vault inventory |
| GET | `/history` | Transaction history for SVG movements |
| POST | `/add` | Add items to vault |
| POST | `/remove` | Deduct items from vault |

### Labour Charges (`/api/labour-charges`)
| Method | Path | Description |
|---|---|---|
| GET | `/` | List all labour charges (metal → category → size → rates) |
| POST | `/` | Create labour charge entry |
| PUT | `/bulk` | Bulk update multiple labour charges |
| PUT | `/:id` | Update single labour charge |
| DELETE | `/:id` | Delete labour charge |

### Selling Dashboard (`/api/selling/dashboard`)
| Method | Path | Description |
|---|---|---|
| GET | `/` | Dashboard metrics (inventory summary, cash position, pending estimates) |

---

## 9. Key Utility Functions

**`backend/src/utils/common.js`**
- `calculateLoss(issueWeight, returnWeight, scrapWeight)` → loss in grams (3 decimal places)
- `formatResponse(res, statusCode, success, message, data)` → standardized JSON response
- `createAppError(message, statusCode, code, details)` → error object with metadata
- `isValidMetalType(metalType)` → validates against METAL_TYPES list
- `sanitizePieces(value)` → clamp pieces to non-negative integer
- `parseUnitWeight(value)` → safe parse float for weight fields

---

## 10. API Response Format

### Success
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "message": "Description of error",
  "data": null
}
```

---

## 11. Development Commands

```bash
# Run everything together (Electron + backend + frontend)
npm start

# Individual processes
cd frontend && npm run dev     # Vite dev server → http://localhost:5173
cd backend  && npm run dev     # nodemon → http://localhost:3000

# Production build
npm run build:frontend         # vite build in frontend/
npm run build:electron         # electron-builder NSIS installer

# Lint
cd frontend && npm run lint
```

> **Note:** No automated tests exist in this codebase.

---

## 12. Critical Constraints & Gotchas

| Constraint | Why |
|---|---|
| `HashRouter` (not `BrowserRouter`) | `file://` URLs don't support HTML5 History API in Electron |
| `vite.config.js` `base: "./"` | Required for Electron's `file://` loading — **do not change** |
| `asar: false` in electron-builder | Backend Node.js files must be directly accessible at runtime |
| `DB_PATH` in production | Points to Electron `userData` so data survives app updates |
| Column whitelist in edit endpoints | Prevents SQL injection via dynamic `UPDATE` statements |
| `--break-system-packages` for pip | Required in the sandboxed Linux shell environment |

---

## 13. Deprecated / Legacy Items

- `sellingBillRoutes.js` / `sellingBillController.js` / `sellingBillService.js` — **DEPRECATED**, replaced by `orderBill*` + counter/SVG flow
- `obRateRoutes.js` — **DEPRECATED**, superseded by `labourChargeRoutes.js`
- `ob_labour_rates` table — **LEGACY**, now using `labour_charges` table
- `SellingBilling.jsx` page — **DEPRECATED**

---

*Last updated: 2026-04-25 | Project: JewelCRM | Owner: Niket (nik84soni@gmail.com)*
