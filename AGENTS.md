# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This App Is

**JewelCRM** is an Electron desktop app for jewellery manufacturing workflow management. It packages three processes together:
- A React (Vite) SPA frontend served via `file://` in production
- An Express/SQLite backend running on `localhost:3000`
- An Electron shell that launches both and creates the window

## Development Commands

### Run the full app (all three processes together)
```bash
npm start   # from root — uses concurrently + wait-on
```

### Run frontend and backend independently
```bash
cd frontend && npm run dev     # Vite dev server on :5173
cd backend  && npm run dev     # nodemon on :3000
```

### Build for production
```bash
npm run build:frontend   # runs vite build in frontend/
npm run build:electron   # packages with electron-builder (NSIS installer)
```

### Lint
```bash
cd frontend && npm run lint
```

There are no automated tests in this codebase.

## Architecture

### Three-process Electron app
`main.js` (root) is the Electron entry. In dev it loads `http://localhost:5173`; in production it forks `backend/src/app.js` as a child process and loads `frontend/dist/index.html` as a `file://` URL. The backend's `DB_PATH` in production points to Electron's `userData` directory so data persists across app updates.

### Frontend
- `HashRouter` is used (not `BrowserRouter`) because `file://` URLs don't support the HTML5 History API.
- `AuthContext` stores the JWT in `localStorage`, decodes it with `jwt-decode` on load, and exposes `isAdmin`.
- `axiosConfig.js` injects the Bearer token on every request and handles 401/403 by clearing the token and redirecting to `/login`.
- Two layout modes selected after login via `ModeSelection`: `MainLayout` (production/warehouse) and `SellingLayout` (POS/counter).
- Frontend API modules in `src/api/` mirror backend route groups 1:1.

### Backend
- Three-layer: Routes → Controllers → Services. All DB access goes through `backend/config/dbConfig.js`.
- SQLite via `sqlite3` (callback-based, wrapped in Promises per service). `db.runTransaction()` handles BEGIN/COMMIT/ROLLBACK for multi-step atomic operations.
- Schema migrations are inline in `dbConfig.js` using `PRAGMA table_info()` checks + `ALTER TABLE ... ADD COLUMN` — no migration framework.
- All routes except `POST /api/auth/login` require `Authorization: Bearer <token>` via `authMiddleware.js`.
- Admin-only routes use the `requireAdmin` middleware.

### Production process state machine
Every manufacturing stage (melting, rolling, press, TPP, packing) follows the same lifecycle: `PENDING → RUNNING → COMPLETED`, with identical endpoint patterns: `create / start / complete / revert / edit / delete`.

### Metal types and weight
Metal types are defined in `backend/src/utils/constants.js` (`METAL_TYPES`). Weight calculations use `parseUnitWeight` from `common.js`. Silver is tracked in grams; gold in grams as well but with different purity (22K/24K).

### Key domain tables
- `stock_master` — one row per metal type, aggregated weights
- `stock_transactions` — full audit ledger for all stock movements
- `finished_goods` — post-packing inventory
- `counter_inventory` — selling counter (items sent out / returned)
- `svg_inventory` — SVG vault inventory
- `customers` — party/customer accounts

## Environment Variables

| File | Key variables |
|------|--------------|
| `backend/.env` | `PORT=3000`, `JWT_SECRET`, `DB_PATH=./jewelry.db` |
| `frontend/.env` | `VITE_API_URL=http://localhost:3000/api` |

The root `.env` is read by `backend/src/app.js` (it resolves two levels up from `backend/src/`).

## Important Constraints

- `vite.config.js` sets `base: "./"` — required for Electron's `file://` loading; do not change this.
- `electron-builder` uses `asar: false` so backend Node.js files remain directly accessible at runtime.
- Default admin credentials are seeded on first startup if no users exist (see `dbConfig.js`).
- Tailwind custom colors `gold` (`#d4af37`), `silver` (`#c0c0c0`), and `dark` (`#1a1a1a`) are defined in `frontend/tailwind.config.js`.
