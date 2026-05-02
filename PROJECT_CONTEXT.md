# JewelCRM — Complete Project Context

> **Purpose of this file:** Hand this document to any AI agent (or yourself) to get full context on the JewelCRM codebase without needing to read every source file. It covers architecture, database schema, API routes, frontend structure, business logic, key conventions, and all recent changes.

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
├── PROJECT_CONTEXT.md               # This file — full AI/agent context
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
│       │   ├── customerController.js    # ★ Updated: paginate=true support
│       │   ├── orderBillController.js
│       │   ├── sellingBillController.js # DEPRECATED
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
│       │   ├── customerService.js       # ★ Updated: getAllCustomersPaginated() added
│       │   ├── orderBillService.js      # ★ Updated: listBills sorted by date DESC, ob_no DESC
│       │   ├── sellingBillService.js    # DEPRECATED
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
        │   ├── customerService.js       # ★ Updated: getCustomersPaginated() added
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
        │   ├── SellingLedger.jsx        # ★ Fully redesigned — see Section 14
        │   ├── OrderBills.jsx           # ★ Fully redesigned — see Section 14
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

Metal purity constants (used in ledger entries):
- Gold 24K → `"99.99"`
- Gold 22K → `"91.67"`
- Silver → `"99.90"`

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
1. User selects a date, one or more metal types, and a customer (existing or new)
2. Labour rates auto-fill from `labour_charges` table per metal → category → size → customer tier (Retail/Showroom/Wholesale)
3. User enters pieces (PCS) per size row; totals compute live
4. Per-metal JAMA (customer metal deposit) and Rate/10g entered → metal Rs calculated
5. Optional cash/online advance (`amt_jama`) and discount applied → final total
6. On save: counter stock reserved, customer ledger entries written (BILL_TOTAL, BILL_DISCOUNT, PAYMENT_CASH/PAYMENT_ONLINE, METAL_IN), customer outstanding balance updated
7. Edit: all prior accounting reversed and rewritten atomically
8. Delete: all ledger entries, stock reservations, and outstanding balance delta reversed atomically

**Summary formula:**
```
labour_total  = Σ (lc_pp × pcs) per item
metal_rs      = Σ ROUND((weight_diff × rate / 10), -1) per metal
subtotal      = labour_total + metal_rs
total_amount  = subtotal − discount
amt_baki      = max(0, total_amount − amt_jama)   // customer still owes
refund_due    = max(0, amt_jama − total_amount)   // shop owes customer
```

### Multi-Metal Payments
Each estimate supports independent JAMA + Rate for all three metals simultaneously:
- `fine_jama` / `rate_10g` → Gold 24K
- `jama_gold_22k` / `rate_gold_22k` → Gold 22K
- `jama_silver` / `rate_silver` → Silver

### Labour Charges Structure
`labour_charges` table: `metal_type × category × size_label → { lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }`
Used in estimates to auto-fill per-item labour based on customer type.

### Customer Ledger
`customer_ledger_entries` tracks every financial event per customer. Actual `line_type` values in use:

| line_type | Direction | Description |
|---|---|---|
| `BILL_TOTAL` | Debit (+) | Total sale amount charged to customer |
| `BILL_DISCOUNT` | Credit (−) | Discount applied to the bill |
| `PAYMENT_CASH` | Credit (−) | Cash payment received |
| `PAYMENT_ONLINE` | Credit (−) | Online payment received |
| `METAL_IN` | Neutral | Customer metal deposit (weight_delta only) |
| `ADJUSTMENT_DEBIT` | Debit (+) | Manual positive adjustment |
| `ADJUSTMENT_CREDIT` | Credit (−) | Manual negative adjustment |

`outstanding_balance` on the `customers` table is a running total kept in sync with every ledger write.

---

## 7. Complete Database Schema

### Authentication
**`users`** — `id, username (UNIQUE), password_hash, role (ADMIN|EMPLOYEE), created_at`
- Default seed: `admin` / `admin123` (or `DEFAULT_ADMIN_PASSWORD` env)

### Stock
**`stock_master`** — `id, metal_type (UNIQUE), opening_stock, rolling_stock, press_stock, tpp_stock, inprocess_weight, total_loss`
- 3 hardcoded rows: Gold 24K, Gold 22K, Silver

**`stock_transactions`** — `id, date, metal_type, transaction_type, weight, description, reference_type, reference_id`

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
- `reference_type = "ORDER_BILL"` when pieces are reserved by an estimate

**`svg_inventory`** (Sales Vault) — `id, metal_type, target_product, pieces, weight, created_at`

### Selling
**`customers`** — `id, party_name, firm_name, address, city, phone_no, telephone_no, customer_type(Retail|Showroom|Wholesale), outstanding_balance, created_at, updated_at`

**`selling_bills`** — `id, bill_no(UNIQUE), date, customer_id(FK), customer_name, customer_type, payment_mode(Cash|Online), cash_amount, online_amount, metal_payment_type, metal_purity, metal_weight, metal_rate, metal_value, subtotal, total_lc, discount, total_amount, amount_paid, outstanding_amount, notes, created_at`

**`selling_bill_items`** — `id, bill_id(FK), metal_type, category, custom_label, size, pieces, weight, rate_per_gram, metal_value, lc_pp, t_lc, sort_order`

**`selling_bill_metal_payments`** — `id, bill_id(FK), metal_type, purity, weight, rate, metal_value`

**`customer_ledger_entries`** — `id, customer_id(FK), entry_date, reference_type(ORDER_BILL|CUSTOMER_LEDGER|SELLING_BILL), reference_id, reference_no, transaction_type(Estimate|Payment|Adjustment), payment_mode, line_type(BILL_TOTAL|BILL_DISCOUNT|PAYMENT_CASH|PAYMENT_ONLINE|METAL_IN|ADJUSTMENT_DEBIT|ADJUSTMENT_CREDIT), metal_type, metal_purity, weight_delta, amount_delta, notes, created_at`

**`counter_cash_ledger`** — `id, entry_date, reference_type, reference_id, reference_no, mode(Cash|Online|Mixed), amount, notes, created_at`

### Estimates (Order Bills)
**`order_bills`** — Full column list:

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `ob_no` | INTEGER UNIQUE | Estimate number (user-visible) |
| `date` | TEXT | YYYY-MM-DD format |
| `product` | TEXT | Optional product/description label |
| `products` | TEXT (JSON) | Array of metal types, e.g. `["Gold 24K","Silver"]` |
| `customer_id` | INTEGER FK | References `customers.id` (nullable) |
| `customer_name` | TEXT | Snapshot at time of estimate |
| `customer_city` | TEXT | Snapshot |
| `customer_address` | TEXT | Snapshot |
| `customer_phone` | TEXT | Snapshot |
| `customer_type` | TEXT | Retail \| Showroom \| Wholesale |
| `fine_jama` | REAL | Gold 24K metal deposited (g) |
| `rate_10g` | REAL | Gold 24K rate per 10g |
| `jama_gold_22k` | REAL | Gold 22K metal deposited (g) |
| `rate_gold_22k` | REAL | Gold 22K rate per 10g |
| `jama_silver` | REAL | Silver deposited (g) |
| `rate_silver` | REAL | Silver rate per 10g |
| `amt_jama` | REAL | Total cash advance (cash + online) |
| `cash_amount` | REAL | Cash portion of advance |
| `online_amount` | REAL | Online portion of advance |
| `payment_mode` | TEXT | Cash \| Online \| Mixed |
| `total_pcs` | INTEGER | Sum of all item pcs |
| `total_weight` | REAL | Sum of all item weights (g) |
| `labour_total` | REAL | Sum of all item labour charges |
| `fine_diff` | REAL | Gold 24K weight diff (weight − jama) |
| `gold_rs` | REAL | Total metal Rs across all metals |
| `subtotal` | REAL | labour_total + gold_rs |
| `discount` | REAL | Discount amount (capped at subtotal) |
| `total_amount` | REAL | subtotal − discount |
| `amt_baki` | REAL | Balance customer still owes |
| `refund_due` | REAL | Amount shop owes customer (overpaid) |
| `ofg_status` | TEXT | "OF.G AFSL" or "OF.G HDF" |
| `fine_carry` | REAL | Carry-forward fine weight (g) |
| `created_at` | TEXT | Timestamp |

**`order_bill_items`** — `id, bill_id(FK), metal_type, category, size_label, size_value, pcs, weight, lc_pp, t_lc, is_custom(0|1), sort_order`

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

### Customers (`/api/customers`) ★ Updated
| Method | Path | Description |
|---|---|---|
| GET | `/` | List customers — see query params below |
| GET | `/:id` | Get customer by ID |
| POST | `/` | Create customer |
| PUT | `/:id` | Update customer |
| DELETE | `/:id` | Delete customer |
| GET | `/:id/ledger` | Customer ledger: entries, statement, summary |
| POST | `/:id/ledger/entries` | Add manual Payment or Adjustment ledger entry |

**GET `/api/customers` query params:**

| Param | Type | Description |
|---|---|---|
| `search` | string | Filter by party_name, firm_name, city, or phone_no |
| `paginate` | `"true"` | Switch to paginated mode |
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Page size 1–100 (default: 15) |

- Without `paginate=true` → returns flat array `[]` (backward compatible, used by all forms)
- With `paginate=true` → returns `{ customers: [], total, page, limit }` (used by SellingLedger)

**GET `/:id/ledger` response shape:**
```json
{
  "customer": { ...customerRow },
  "entries": [ ...rawLedgerRows ],
  "summary": { "outstanding_amount": 0, "metal_balances": {} },
  "statement": [ ...groupedStatementRows ],
  "ledger_summary": { "total_payable": 0, "total_paid": 0, "remaining_balance": 0 }
}
```

### Estimates / Order Bills (`/api/estimates`) ★ Updated
| Method | Path | Description |
|---|---|---|
| GET | `/next-no` | Get next estimate bill number (MAX ob_no + 1) |
| GET | `/` | List all estimates — sorted by `date DESC, ob_no DESC` |
| GET | `/:id` | Get estimate with full line items |
| POST | `/` | Create estimate; validates stock, calculates totals, writes ledger |
| PUT | `/:id` | Update estimate; reverses old accounting, writes new |
| DELETE | `/:id` | Delete estimate; reverses all accounting atomically |
| POST | `/validate-stock` | Pre-check counter_inventory availability for items |

**POST / PUT payload shape:**
```json
{
  "ob_no": 42,
  "date": "2026-05-02",
  "product": "Necklace set",
  "products": ["Gold 24K", "Silver"],
  "customer_id": 5,
  "customer_name": "Ramesh Shah",
  "customer_phone": "9876543210",
  "customer_address": "123 MG Road",
  "customer_city": "Surat",
  "customer_type": "Retail",
  "fine_jama": 10.5, "rate_10g": 72000,
  "jama_gold_22k": 0, "rate_gold_22k": 0,
  "jama_silver": 0, "rate_silver": 0,
  "amt_jama": 5000,
  "discount": 200,
  "items": [
    { "metal_type": "Gold 24K", "category": "Standard", "size_label": "2.5gm",
      "size_value": 2.5, "pcs": 3, "lc_pp": 450, "sort_order": 0 }
  ]
}
```

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
| GET | `/` | List all; also `GET /?grouped=true` returns `{ metalType: { category: [rows] } }` |
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

### Backend — `backend/src/utils/common.js`
- `calculateLoss(issueWeight, returnWeight, scrapWeight)` → loss in grams (3 decimal places)
- `formatResponse(res, statusCode, success, message, data)` → standardized JSON response
- `createAppError(message, statusCode, code, details)` → error object with metadata
- `isValidMetalType(metalType)` → validates against METAL_TYPES list
- `sanitizePieces(value)` → clamp pieces to non-negative integer
- `parseUnitWeight(value)` → safe parse float for weight fields

### Frontend — inline helpers in `OrderBills.jsx`
These are module-scope functions declared at the top of OrderBills.jsx, not in a shared utility file:

```js
// Format YYYY-MM-DD → "15 Apr 2026"
fmtDate(dateStr)

// Format number as Indian Rupees: "Rs. 1,23,456.00"
fmtMoney(value)

// Format weight to N decimal places
fmt(value, digits = 3)

// Shift a YYYY-MM-DD string by ±N days (used by date navigator)
shiftDate(dateStr, delta)   // useCallback — defined inside component

// Composite key for an item row (used as React key + ref key)
itemKey(metalType, category, sizeLabel)  // → "Gold 24K::Standard::2.5gm"

// Normalize size label for API submission
normalizeEstimateSizeLabel(metalType, sizeLabel)

// Get labour rate for the customer's tier
getRateForCustomerType(row, customerType)  // row = labour_charges row

// Build item rows from grouped charges (used on metal/customer type change)
buildItemsFromCharges(groupedCharges, selectedMetals, customerType, existingItems)

// Full client-side estimate recalculation (mirrors backend _computeSummary)
computeSummary(items, metalPayments, amtJama, discount)
```

### Frontend — `frontend/src/api/customerService.js`
```js
getCustomers(search)                          // flat array, used by forms/dropdowns
getCustomersPaginated(search, page, limit)    // paginated, used by SellingLedger
getCustomerById(id)
getCustomerLedger(id)
createCustomerLedgerEntry(id, payload)
createCustomer(payload)
updateCustomer(id, payload)
deleteCustomer(id)
```

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
| `date` stored as `YYYY-MM-DD` string | Lexicographic comparison is safe and correct for this format |
| `getCustomers()` vs `getCustomersPaginated()` | Forms/dropdowns use flat `getCustomers()`; SellingLedger uses paginated version — do not swap |
| `paginate=true` is the only new query param | All existing callers of `GET /customers` continue to work unchanged |
| `computeSummary` duplicated front+back | Frontend version in `OrderBills.jsx` must stay in sync with `_computeSummary` in `orderBillService.js` |
| `--break-system-packages` for pip | Required in the sandboxed Linux shell environment |

---

## 13. Deprecated / Legacy Items

- `sellingBillRoutes.js` / `sellingBillController.js` / `sellingBillService.js` — **DEPRECATED**, replaced by `orderBill*` + counter/SVG flow
- `obRateRoutes.js` — **DEPRECATED**, superseded by `labourChargeRoutes.js`
- `ob_labour_rates` table — **LEGACY**, now using `labour_charges` table
- `SellingBilling.jsx` page — **DEPRECATED**

---

## 14. Recent UI Architecture — SellingLedger & OrderBills

### SellingLedger.jsx (Fully Redesigned)

**Layout:** Two-column split — scrollable customer list (left) + sticky ledger panel (right).

**Customer list (left panel):**
- Server-side pagination: 15 customers per page (`CUSTOMERS_PER_PAGE = 15`)
- Calls `getCustomersPaginated(search, page, limit)` — never loads the full table
- 300ms debounced search input (party_name, firm_name, city, phone)
- Sort toggle: by Name (A→Z) or by Balance (highest first)
- Avatar initials + customer type badge (color-coded: Retail/Showroom/Wholesale)
- Outstanding balance chip: green if zero, red if > 0
- Skeleton loader (`CustomerSkeleton`) shown during fetch

**Ledger panel (right):**
- Loads on customer selection via `getCustomerLedger(id)`
- Shows `statement` array (grouped rows) from the backend, not raw `entries`
- Date range filter + transaction type filter (All / Estimate / Payment / Adjustment)
- Client-side pagination of statement rows (`LEDGER_PER_PAGE = 30`)
- Debit column (what customer owes) + Credit column (what was paid) + Running balance
- Payment status chips: Pending / Partial / Completed
- `EntryModal` bottom-sheet dialog for adding Payment or Adjustment entries
- Skeleton loader (`TableSkeleton`) while ledger loads

**Key state variables:**
```js
customers, totalCustomers, customerPage  // server-side paginated list
customerSearch, debouncedSearch          // 300ms debounced
sortBy                                   // "name" | "balance"
selectedCustomer, ledger, ledgerLoading  // selected customer's data
dateFrom, dateTo, filterType             // ledger display filters
ledgerPage                               // client-side ledger pagination
showEntryModal, entryType                // modal visibility
```

---

### OrderBills.jsx (Fully Redesigned)

**Three views:** `list` → `form` → `print`

#### List View
- **Date navigator** (prominent, top of list):
  - ← prev day button | date input (YYYY-MM-DD) | next day → button | Today button
  - `selectedDate` state defaults to today's date
  - `dayBills` = all bills filtered to `selectedDate` (client-side, data already loaded)
  - Changing date clears the search field automatically
  - Page resets to 1 on date / search / sort change
- **Stats bar** (3 cards, scoped to selected day): Estimate count · Total Value · Pending Balance
- **Search + Sort bar:**
  - Search by estimate no., customer name, or phone within the selected day
  - Sort: Newest first (ob_no DESC) / Oldest first (ob_no ASC) / Highest amount / Lowest amount
  - Within a single day all dates are equal, so newest/oldest sort by ob_no
- **Table** (20 per page, `BILLS_PER_PAGE = 20`): #ob_no + date · Customer + phone · Metal type badges · Total + discount · Advance · Balance chip (Settled / +Refund / Due amount)
- **Delete modal** with icon and confirmation

#### Form View (5 numbered sections)
1. **Estimate Details** — ob_no, date, optional product/description
2. **Customer** — search existing (debounced, 250ms) or type manually; selected customer shown as indigo card with × to clear; customer type toggle updates all LC rates
3. **Metal Types** — multi-select toggles (Gold 24K / Gold 22K / Silver); each adds/removes its item rows
4. **Items per metal** — one card per metal, one table per category:
   - PCS input with keyboard navigation: Enter/↓ → next field, ↑ → prev field (via `pcsInputRefs` useRef map)
   - Active rows (pcs > 0) highlight indigo-50
   - Per-row stock validation feedback (✓ N avail. / ✗ Only N avail.) from debounced `validateOrderBillStock`
   - Category sub-totals shown live (pcs, weight, labour)
5. **Metal Payment (JAMA)** — per selected metal: JAMA weight + Rate/10g inputs

**Sticky right sidebar:** live summary panel (labour, per-metal breakdown, subtotal, discount input, total, advance input, balance/refund, OFG status) + Save / Save & Print / Cancel buttons + Tips panel.

#### Print View
- Auto-triggers `window.print()` after 150ms
- Groups items by metal type → category
- Summary box with all calculated fields

**Key state variables:**
```js
view                              // "list" | "form" | "print"
bills, selectedDate               // all loaded estimates + active day filter
dayBills, filteredBills, pagedBills  // derived: date → search/sort → paginate
listSearch, listSort, listPage    // list controls
groupedCharges                    // from getLabourChargesGrouped()
editBill, printBill               // form/print targets
obNo, formDate, product           // form header fields
selectedProducts                  // active metal types ["Gold 24K", ...]
selectedCustomer                  // customer object or null
customerName, customerPhone, customerAddress, customerType
items                             // array of item rows
metalPayments                     // { "Gold 24K": { jama, rate }, ... }
amtJama, discount                 // payment fields
stockValidation, validatingStock  // real-time stock check state
pcsInputRefs                      // useRef map: itemKey → <input> DOM element
```

**`shiftDate` helper (inside component as `useCallback`):**
```js
const shiftDate = useCallback((dateStr, delta) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().split("T")[0];
}, []);
```

---

## 15. Backend Changes Log (Recent)

| File | Change | Reason |
|---|---|---|
| `customerService.js` | Added `getAllCustomersPaginated(search, page, limit)` | Server-side pagination for SellingLedger |
| `customerController.js` | `getAll` routes to paginated path when `?paginate=true` | Backward-compatible — existing callers unaffected |
| `orderBillService.js` `listBills()` | `ORDER BY b.date DESC, b.ob_no DESC` (was `ob_no DESC`) | Correct date-descending order for all callers |

---

*Last updated: 2026-05-02 | Project: JewelCRM | Owner: Niket (nik84soni@gmail.com)*
