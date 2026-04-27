# JewelCRM

A desktop CRM and manufacturing-workflow application for jewellery businesses. JewelCRM packages a React user interface, an Express/SQLite backend, and an Electron shell into a single installable Windows application.

---

## 1. Description

### What it does
JewelCRM digitises the day-to-day operations of a jewellery manufacturing and retail business. It tracks raw metal stock (gold and silver), moves jobs through every production stage (melting → rolling → press → TPP → packing), manages the SVG vault, runs the selling counter (POS), and handles customer accounts, order bills, and labour charges — all from a single desktop application that runs offline on a local SQLite database.

### The problem it solves
Most jewellery workshops still rely on paper registers or generic accounting software that does not understand the production lifecycle, metal-weight reconciliation, or counter-issue/return flows specific to the trade. JewelCRM gives owners and operators a purpose-built tool that:

- Maintains a complete audit ledger of every gram of metal that enters or leaves the workshop.
- Enforces a consistent state machine (`PENDING → RUNNING → COMPLETED`) across every production stage.
- Keeps inventory, finished goods, counter stock, and SVG vault stock in sync.
- Works on a single PC without a cloud dependency, while still using a modern web-based UI.

### Who it is for
- **Jewellery manufacturers** managing multi-stage production of gold and silver items.
- **Retail counter staff** issuing finished goods, processing returns, and generating selling bills.
- **Shop owners / admins** who need full visibility over stock movements, customers, and rates.

---

## 2. Features

- **Authentication & roles** — JWT-based login with admin and standard user roles. Admin-only routes are guarded by middleware.
- **Two operating modes** — `MainLayout` for production/warehouse staff and `SellingLayout` for the POS/counter, selected after login.
- **Stock management** — Per-metal master records plus a full transaction ledger (`stock_transactions`) for every movement.
- **Production pipeline** — Melting, rolling, press, TPP, and packing stages, each with `create / start / complete / revert / edit / delete` endpoints and a shared `PENDING → RUNNING → COMPLETED` lifecycle.
- **Job tracking** — Centralised job records that flow across stages.
- **Finished goods & counter inventory** — Separate stores for post-packing inventory and items issued to the selling counter.
- **SVG vault inventory** — Dedicated tracking for SVG stock.
- **Customers & order bills** — Customer/party accounts, order bills, OB rates, and labour charges.
- **Selling bills** — POS-side billing flow.
- **Offline-first** — Local SQLite database stored in Electron's `userData` directory in production, so data persists across app updates.
- **Single-installer distribution** — Packaged as a Windows NSIS installer via `electron-builder`.

---

## 3. Tech Stack

**Frontend**
- React 19
- Vite 7
- React Router (HashRouter)
- Tailwind CSS 4
- Axios
- jwt-decode
- lucide-react (icons)

**Backend**
- Node.js + Express 4
- SQLite (via `sqlite3`)
- JSON Web Tokens (`jsonwebtoken`)
- bcryptjs (password hashing)
- Joi (validation)
- dotenv

**Desktop shell**
- Electron 40
- electron-builder (NSIS installer for Windows)
- concurrently + wait-on + cross-env (dev orchestration)

**Tooling**
- ESLint 9
- nodemon (backend dev reload)

---

## 4. Installation

### Prerequisites
- **Node.js** 18 or higher (LTS recommended) and npm.
- **Git** (to clone the repository).
- **Windows 10/11** for building the desktop installer. Development can be done on macOS/Linux, but `electron-builder --win` targets Windows.
- **Python and Visual Studio Build Tools** may be required on Windows for native modules (`sqlite3`) to compile. *(Assumption based on standard `sqlite3` install behaviour.)*

### Steps

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd CRM_Jewellery

# 2. Install root (Electron) dependencies
npm install

# 3. Install backend dependencies
cd backend
npm install
cd ..

# 4. Install frontend dependencies
cd frontend
npm install
cd ..

# 5. Create environment files (see Configuration section)
```

---

## 5. Usage

### Run the full desktop app in development
From the project root:

```bash
npm start
```

This uses `concurrently` and `wait-on` to:
1. Start the Express backend on `http://localhost:3000`.
2. Start the Vite dev server on `http://localhost:5173`.
3. Launch Electron once both servers are reachable.

### Run frontend or backend independently

```bash
# Backend only (with auto-reload)
cd backend
npm run dev

# Frontend only (Vite dev server)
cd frontend
npm run dev
```

### Build for production

```bash
# Build the React bundle
npm run build:frontend

# Package the Electron app into a Windows NSIS installer
npm run build:electron

# Or do both in one step
npm run pack
```

The packaged installer is written to the `dist/` directory.

### Default login
The backend seeds default admin credentials on first startup if no users exist (see `backend/config/dbConfig.js`). After first login, change the password and create additional users via the admin UI.

---

## 6. Project Structure

```
CRM_Jewellery/
├── main.js                       # Electron entry point (loads dev URL or file:// build)
├── package.json                  # Root scripts and electron-builder config
├── .env                          # Backend env (read by backend/src/app.js)
│
├── backend/
│   ├── package.json
│   ├── config/
│   │   └── dbConfig.js           # SQLite init, schema migrations, transactions, seed admin
│   └── src/
│       ├── app.js                # Express app, mounts /api/* routes
│       ├── middleware/
│       │   └── authMiddleware.js # JWT auth + requireAdmin guard
│       ├── routes/               # Express routers (auth, stock, melting, jobs, ...)
│       ├── controllers/          # Request handlers per domain
│       ├── services/             # DB-facing business logic per domain
│       └── utils/
│           ├── constants.js      # METAL_TYPES, etc.
│           └── common.js         # parseUnitWeight and shared helpers
│
└── frontend/
    ├── package.json
    ├── index.html
    ├── vite.config.js            # base: "./" for Electron file:// loading
    ├── tailwind.config.js        # Custom gold/silver/dark colors
    └── src/
        ├── main.jsx              # React entry
        ├── api/                  # Axios modules mirroring backend route groups
        ├── context/              # AuthContext (JWT in localStorage, isAdmin)
        ├── layouts/              # MainLayout (production), SellingLayout (POS)
        ├── pages/                # Route-level screens including ModeSelection
        └── components/           # Shared UI components
```

> Folder names under `frontend/src` such as `pages/`, `components/`, `context/`, and `layouts/` are inferred from the architecture description in `CLAUDE.md`. The exact names may differ; adjust if needed.

---

## 7. Configuration

Two environment files are required, plus an optional root `.env`.

### `backend/.env`

| Key | Example | Purpose |
|-----|---------|---------|
| `PORT` | `3000` | Port the Express server listens on |
| `JWT_SECRET` | `change-me-to-a-long-random-string` | Secret used to sign JWTs |
| `DB_PATH` | `./jewelry.db` | SQLite database file path (overridden in production to Electron's `userData`) |

### `frontend/.env`

| Key | Example | Purpose |
|-----|---------|---------|
| `VITE_API_URL` | `http://localhost:3000/api` | Base URL the frontend uses for API calls |

### Root `.env` (optional)
`backend/src/app.js` resolves `dotenv` two levels up from `backend/src/`, so a root-level `.env` is also loaded. Use whichever location is convenient, but keep secrets out of source control.

### Production database path
In production, `DB_PATH` is rewritten to point to Electron's `userData` directory so that the SQLite file survives application updates and reinstalls. Do not hardcode a relative path expecting it to persist.

### Important constraints (do not change without understanding the impact)
- `vite.config.js` sets `base: "./"` — required so the built `index.html` loads its assets via relative paths under Electron's `file://` protocol.
- `electron-builder` is configured with `asar: false` so the backend Node.js files remain directly accessible and runnable at runtime.
- The frontend uses `HashRouter` (not `BrowserRouter`) because `file://` URLs do not support the HTML5 History API.

---

## 8. API Documentation

All routes are mounted under `/api`. Every route except `POST /api/auth/login` requires an `Authorization: Bearer <token>` header. Admin-only routes are additionally guarded by `requireAdmin`.

### Route groups

| Base path | Purpose |
|-----------|---------|
| `/api/auth` | Login, token issuance |
| `/api/stock` | Stock master and transactions |
| `/api/melting` | Melting stage |
| `/api/jobs` | Job records flowing through stages |
| `/api/rolling` | Rolling stage |
| `/api/press` | Press stage |
| `/api/tpp` | TPP stage |
| `/api/packing` | Packing stage |
| `/api/svg` | SVG vault inventory |
| `/api/counter` | Selling counter inventory (issues/returns) |
| `/api/customers` | Customer / party accounts |
| `/api/ob-rates` | Order-bill rate management |
| `/api/order-bills` | Order bills |

### Production stage endpoint pattern
Every manufacturing stage (`/api/melting`, `/api/rolling`, `/api/press`, `/api/tpp`, `/api/packing`) follows the same lifecycle endpoints:

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/create` | Create a new stage record (`PENDING`) |
| `POST` | `/start/:id` | Move record to `RUNNING` |
| `POST` | `/complete/:id` | Move record to `COMPLETED` |
| `POST` | `/revert/:id` | Step back one state |
| `PUT`  | `/edit/:id` | Edit record fields |
| `DELETE` | `/delete/:id` | Delete the record |

> The exact path segments above are inferred from the documented "identical endpoint patterns" convention. Verify against each `routes/*Routes.js` file before integrating an external client.

### Example: login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

Successful response (shape may vary; verify against `authController.js`):

```json
{
  "token": "<jwt>",
  "user": { "id": 1, "username": "admin", "role": "admin" }
}
```

### Example: authenticated request

```http
GET /api/stock
Authorization: Bearer <jwt>
```

The frontend's `axiosConfig.js` attaches the token automatically and clears it on `401/403`, redirecting the user to `/login`.

---

## 9. Screenshots / Demo

_Not provided. Placeholders below — replace with real captures from the running app._

- **Login screen** — `docs/screenshots/login.png`
- **Mode selection (Production vs. Selling)** — `docs/screenshots/mode-selection.png`
- **Production dashboard** — `docs/screenshots/production.png`
- **Selling counter / POS** — `docs/screenshots/counter.png`
- **Stock ledger** — `docs/screenshots/stock.png`

---

## 10. Testing

There are currently **no automated tests** in this codebase. Quality is enforced through linting and manual verification.

### Lint the frontend

```bash
cd frontend
npm run lint
```

### Suggested manual smoke test
1. `npm start` from the project root.
2. Log in with the seeded admin credentials.
3. Choose a layout mode.
4. Walk a job through the full pipeline: melting → rolling → press → TPP → packing.
5. Issue an item to the counter, then return it.
6. Confirm `stock_transactions` reflects every movement.

> Adding a test framework (Vitest for the frontend, Jest or Vitest for the backend) is recommended — see Roadmap.

---

## 11. Deployment

JewelCRM is distributed as a Windows desktop application, not a hosted web service.

### Build the installer

```bash
npm run pack
```

This runs `vite build` for the frontend and then `electron-builder --win` to produce an NSIS installer in `dist/`.

### Install on a target machine
1. Copy the generated `JewelCRM Setup <version>.exe` from `dist/` to the target Windows machine.
2. Run the installer.
3. On first launch, Electron will:
   - Fork the bundled backend (`backend/src/app.js`) as a child process on `localhost:3000`.
   - Load the built frontend from `frontend/dist/index.html` via `file://`.
   - Create or open the SQLite database at the `userData` path.
4. Log in with the seeded admin credentials and change the password immediately.

### Updating
Because `DB_PATH` resolves to `userData` in production, reinstalling or upgrading the application preserves the existing database.

---

## 12. Contributing

Contributions are welcome. Suggested workflow:

1. Fork the repository and create a feature branch: `git checkout -b feat/short-description`.
2. Run `npm install` in the root, `backend/`, and `frontend/`.
3. Make your changes. Keep the three-layer backend convention (Routes → Controllers → Services) and use `db.runTransaction()` for any multi-step DB write.
4. Run `cd frontend && npm run lint` and fix any issues.
5. Manually test the affected flows end-to-end via `npm start`.
6. Commit with clear messages and open a pull request describing the change, the user-facing impact, and any schema migrations added in `dbConfig.js`.

### Coding conventions
- Backend: keep route files thin, controllers as request handlers, and all SQL inside services.
- Frontend: keep `src/api/` modules aligned 1:1 with backend route groups.
- Schema changes: add inline migrations using `PRAGMA table_info()` checks plus `ALTER TABLE ... ADD COLUMN` in `dbConfig.js`. There is no migration framework.

---

## 13. License

Licensed under the **ISC License** (per `package.json`). Add or replace with your organisation's preferred license file as needed.

---

## 14. Future Improvements / Roadmap

- **Automated tests** — Add Vitest/Jest coverage for backend services and React components, plus Playwright for end-to-end flows.
- **Migration framework** — Replace inline `ALTER TABLE` migrations with a versioned tool (e.g. `umzug` or `knex` migrations).
- **Cross-platform builds** — Add macOS (`dmg`) and Linux (`AppImage`/`deb`) targets to `electron-builder`.
- **Backup & restore UI** — One-click export/import of the SQLite database.
- **Audit log viewer** — Searchable UI over `stock_transactions` and stage history.
- **Reporting & analytics** — Daily/weekly stock movement, production throughput, and counter sales summaries.
- **Role granularity** — Beyond admin/standard, add per-module permissions.
- **Cloud sync (optional)** — Opt-in sync to a hosted backend for multi-branch businesses.
- **CI/CD** — GitHub Actions workflow to lint, build, and produce a signed installer on tag.

---

### Assumptions made while writing this README
- Default admin seeding creates an `admin` user; the exact username/password is defined in `backend/config/dbConfig.js` and should be verified there.
- Stage endpoint paths (`/create`, `/start/:id`, etc.) follow the "identical endpoint patterns" described in `CLAUDE.md`; the literal segment names should be confirmed against each `routes/*Routes.js` file.
- Native build tools (Python, MSVC) may be required for `sqlite3` on Windows — this is standard but not explicitly documented in the repo.
- Frontend folder names (`pages/`, `components/`, `context/`, `layouts/`) are inferred from the architecture description; rename in the structure tree if your layout differs.
