# JewelCRM

Desktop CRM and manufacturing workflow manager for jewellery businesses.
Built with **Electron + Express/SQLite + React (Vite)**.

---

## Quick Start

### Prerequisites

| Tool    | Minimum Version |
|---------|----------------|
| Node.js | 18 LTS         |
| npm     | 9+             |

### Install

```bash
# Root (Electron shell + build scripts)
npm install

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### Environment

```bash
# backend/.env
PORT=3000
JWT_SECRET=change-me-in-production
DB_PATH=./jewelry.db          # overridden to userData in production builds

# frontend/.env
VITE_API_URL=http://localhost:3000/api
```

### Run (development)

```bash
npm start        # starts Electron + Vite (port 5173) + Express (port 3000) together
```

Or independently:

```bash
cd frontend && npm run dev    # Vite dev server only
cd backend  && npm run dev    # nodemon on :3000 only
```

### Build (production installer)

```bash
npm run build:frontend   # vite build → frontend/dist/
npm run build:electron   # electron-builder → NSIS installer
```

### Lint

```bash
cd frontend && npm run lint
```

---

## Architecture Overview

```
main.js          ← Electron entry point
preload.js       ← contextBridge: exposes window.electronAPI to renderer
backend/
  src/
    app.js                 ← Express server (security, CORS, routes, error handling)
    middleware/            ← authMiddleware, rateLimiter, securityHeaders, errorHandler
    routes/                ← thin route files (auth, stock, melting, …)
    controllers/           ← request parsing + response shaping
    services/              ← all business logic + DB access (async/await, pRun/pGet/pAll)
    utils/                 ← logger, constants, common helpers, sellingPayments
  config/
    dbConfig.js            ← SQLite open, WAL, PRAGMAs, promise helpers, runTransaction
    db/migrations/         ← versioned schema migrations (001 … 008)
    db/seeds/              ← initial admin user + default data
frontend/
  src/
    api/                   ← axios wrappers per domain (mirrors backend routes 1:1)
    components/            ← Modal, ConfirmModal, Toast, form sub-components
    context/               ← AuthContext (JWT), SellingSyncContext (cache invalidation)
    layouts/               ← MainLayout (warehouse), SellingLayout (POS)
    pages/                 ← full page components
    utils/                 ← billStatuses, formatHelpers, metalUtils, sellingPayments
```

### Key design decisions

- **HashRouter** is required because production loads `frontend/dist/index.html`
  via `file://` which does not support HTML5 History API.
- **Electron security**: `contextIsolation: true`, `nodeIntegration: false`.
  Only four IPC channels are exposed via `window.electronAPI` (preload.js).
- **JWT** is 24 h, stored in `localStorage`. The `JWT_SECRET` is persisted in
  Electron's `userData` folder between app restarts.
- **SQLite WAL mode** with `busy_timeout = 5 s` and `foreign_keys = ON`.
- **Schema migrations** use `_db_meta.schema_version`; each migration runs in
  its own transaction so a crash leaves a consistent version counter.
- **Rate limiting** is in-memory sliding-window (no external packages):
  - `/api/auth/*` — 20 req / 15 min per IP
  - `/api/*` — 300 req / 1 min per IP
- **CORS** restricts origins to `null` (Electron `file://`) and
  `http://localhost:*` (dev); all other origins are rejected.
- **Backend bind address** is `127.0.0.1` only — not reachable on LAN.

---

## Environment Variables

| File            | Variable      | Default            | Notes                                      |
|-----------------|---------------|--------------------|--------------------------------------------|
| `backend/.env`  | `PORT`        | `3000`             |                                            |
| `backend/.env`  | `JWT_SECRET`  | *random per boot*  | **Set this in production**                 |
| `backend/.env`  | `DB_PATH`     | `./jewelry.db`     | Overridden to `userData/jewelry.db` by Electron |
| `backend/.env`  | `NODE_ENV`    | `development`      |                                            |
| `frontend/.env` | `VITE_API_URL`| `http://localhost:3000/api` |                               |

---

## Default Credentials

On first launch (fresh database) a default admin account is seeded:

| Username | Password  |
|----------|-----------|
| `admin`  | `admin123`|

**Change this immediately after first login.**

---

## Module Reference

| Route prefix             | Module             | Description                              |
|--------------------------|--------------------|------------------------------------------|
| `/api/auth`              | Auth               | Login, change password, user management  |
| `/api/stock`             | Stock              | Opening stock, transactions, purchases   |
| `/api/melting`           | Melting            | Melting process lifecycle                |
| `/api/rolling`           | Rolling            | Rolling process lifecycle                |
| `/api/press`             | Press              | Press process lifecycle                  |
| `/api/tpp`               | TPP                | Tinning/plating lifecycle                |
| `/api/packing`           | Packing            | Packing + finished goods                 |
| `/api/jobs`              | Jobs               | Job numbers, finished-goods inventory    |
| `/api/svg`               | SVG Vault          | SVG inventory (pieces + weight)          |
| `/api/counter`           | Counter            | Selling counter inventory                |
| `/api/customers`         | Customers          | CRM + ledger                             |
| `/api/selling/dashboard` | Selling Dashboard  | Sales summary                            |
| `/api/labour-charges`    | Labour Charges     | Admin-configured rates (Metal/Category/Size) |
| `/api/estimates`         | Estimates          | Unified billing (alias: `/api/order-bills`) |
| `/api/roj-med`           | Roj Med            | Daily accounting ledger                  |

---

## Process State Machine

All five manufacturing stages follow the same lifecycle:

```
PENDING → RUNNING → COMPLETED
```

Each stage exposes: `create`, `start`, `complete`, `revert`, `edit`, `delete`.

---

## Database

SQLite file located at:
- **Development**: `backend/jewelry.db`
- **Production**: `%APPDATA%\JewelCRM\jewelry.db` (Electron `userData`)

WAL mode is enabled. Backup by copying the `.db` file when the app is closed.

---

## Security Notes

- Set `JWT_SECRET` to a long random string in production.
- The backend binds to `127.0.0.1` only (not LAN-accessible).
- All `/api/*` routes except `/api/auth/login` require a valid Bearer token.
- Admin-only routes use `requireAdmin` middleware.
- Security headers (CSP, X-Frame-Options, etc.) are applied on every response.
- Rate limiting protects the auth endpoint from brute-force.

---

## Docs

| File                           | Contents                           |
|--------------------------------|------------------------------------|
| `docs/ARCHITECTURE.md`         | Deep-dive: DB schema, IPC, flows   |
| `docs/AUDIT_REPORT.md`         | Full production audit findings     |

