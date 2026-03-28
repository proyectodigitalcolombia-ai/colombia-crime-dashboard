# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

### `artifacts/crime-dashboard` (`@workspace/crime-dashboard`)

React + Vite dashboard for Colombian crime statistics. Two-tab application:

**Tab 1 — Estadísticas Delictivas:**
- Entry: `src/main.tsx` → `src/pages/Dashboard.tsx`
- Components: `ColombiaMap.tsx` (SVG heat map with blockade overlay in pink), Recharts charts
- Data: fetches from `@workspace/api-server` using generated React Query hooks
- Theme: dark/light mode, Spanish language; auto-refresh controls
- Blockade overlay: departments with active blockades show pink border + glow + count in tooltip

**Tab 2 — Análisis de Ruta (Piratería Terrestre):**
- Component: `RouteAnalyzer.tsx`
- 6-factor risk matrix: piratería, riesgo nocturno, grupos armados, señal celular, condición vial, bloqueos comunitarios
- Real-time weather: `src/hooks/useWeather.ts` fetches Open-Meteo API for each corridor department (free, no key)
- PDF export: `jsPDF` generates structured A4 report on demand
- Blockade CRUD: register/delete active blockades (persisted in PostgreSQL via `/api/blockades`); 30s auto-refresh
- BLOCKADE_HISTORY: static risk-score reference per dept (FIP/INVIAS sources) — only used for composite score calculation, NOT for UI display (real DB data shown instead)
- **Official road closures**: `src/hooks/useRoadConditions.ts` fetches `/api/road-conditions` which scrapes all pages of `policia.gov.co/estado-de-las-vias` (67+ closures, multi-page, refreshed every 6h); shown in "Cierres Oficiales — Policía Nacional" section in blockades tab; badge turns red on total closures

**Tab 3 — Informe Gerencial PDF:**
- Component: `ReportGenerator.tsx` using `jsPDF`
- **6-page** branded PDF: portada (dark navy + SafeNode logo), resumen ejecutivo, ranking departamentos, tipos de delito + gráfico, **comparativo interanual año anterior vs año seleccionado**, bloqueos + conclusiones
- Configurable per client: company name, subtitle, analyst info, logo upload, primary color (10 presets + hex), footer disclaimer — config synced to DB via `/api/auth/config`
- On load, pre-fills config from authenticated user (server-side); logoDataUrl stored locally in `localStorage`
- SafeNode defaults pre-loaded: logo at `public/safenode-logo.png`, color `#00bcd4`

**Authentication System:**
- Auth backend: `artifacts/api-server/src/routes/auth.ts` — JWT Bearer tokens (30-day), bcryptjs passwords
- Routes: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `PATCH /api/auth/config`
- DB: `usersTable` in `lib/db/src/schema/crimes.ts` — stores user config (company name, analyst info, colors, etc.)
- Default admin: `admin@safenode.com.co` / `SafeNode2025!` (seeded on server startup via env `ADMIN_EMAIL`/`ADMIN_PASSWORD`)
- Auth frontend: `src/context/AuthContext.tsx` — JWT stored in `localStorage` (`safenode_token`), exposed via `setAuthTokenGetter` to all API hooks
- Login page: `src/pages/LoginPage.tsx` — dark theme, shown when no valid token
- Route guard: `App.tsx` — `ProtectedRouter` checks auth before rendering Dashboard; shows `LoginPage` for unauthenticated users
- Logout: button in dashboard header top-right (LogOut icon); clears localStorage token

**Alert Banner System:**
- Component: `DataAlertBanner.tsx` — global, shown below tabs on all views
- Monitors: AICRI refresh status (error state from API), road conditions fetch errors, stale data (>35 days)
- Banner types: red (connection error), orange (warning/stale), cyan (informational — active closure count)
- Each banner has retry action button and dismiss (X); auto-clears when data recovers

**Data Sources** (loaded in `artifacts/api-server/src/routes/crimes.ts`):

| Year | Source | Format |
|------|--------|--------|
| 2026 | `INFORMACI%C3%93N_DE_DELITOS_A_NIVEL_DE_REGISTRO_A%C3%91O_2026_1.xlsx` | Individual crime records (~7.2MB, ~124k rows) |
| 2020–2025 | `CUADRO_DE_SALIDA_DELICTIVO_HISTORICO_MENSUALIZADO_20_25_1.xlsx` | Monthly aggregate tables |

The 2026 file has individual registration records (one row per crime). Parser: `parseRegistroFile()` — maps DELITOS column (e.g. "ARTÍCULO 103. HOMICIDIO") to crime type IDs, aggregates by dept+month+type. Department "CUNDINAMARCA" in the police data includes Bogotá D.C.

Refresh strategy: loads 2026 registro file first (fast), then historical cuadro file for 2020-2025 (filters out years already loaded). Falls back to demo data if both fail.

## Known Bugs & Fixes

### Production API Routes Missing (FIXED — needs next deploy)
**Root cause**: The `blockades.ts` and `road-conditions.ts` route files were added locally AFTER the last Render deploy (commit `e45d1ebd7f7573027216a4a5317691c264ee91de`). The live production server has an old compiled bundle without these routes. All unmatched `/api/*` paths fall through to the SPA catch-all and return `index.html` (200 HTML).

**Fix applied**:
1. `artifacts/api-server/src/index.ts` — `ensureSchema()` now creates the `blockades` table on server startup (was only creating `crime_stats` and `refresh_log`)
2. `artifacts/crime-dashboard/src/components/RouteAnalyzer.tsx` — added `Array.isArray()` guard before `.filter()` on `allBlockades`
3. `artifacts/crime-dashboard/src/components/ReportGenerator.tsx` — same guard for `allBlockades.filter()`
4. `artifacts/crime-dashboard/src/pages/Dashboard.tsx` — same guard for `allBlockadesRaw`

**After next auto-deploy**: Both routes will be registered, `blockades` table will be created, and `Q.filter is not a function` crash in Piratería Terrestre tab will be fixed.

### Blob Loader for Bright Data Proxy (ACTIVE)
User's Bright Data proxy extension blocks `<script src="...">` but allows `fetch()`. `blobLoaderPlugin()` in `vite.config.ts` replaces all `<script src>` tags with inline `fetch() + createObjectURL() + import()`. Single bundle build (`inlineDynamicImports: true`) ensures no relative imports break inside the blob URL.

### Build Command for Dashboard
```bash
BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/crime-dashboard run build
```

## Render + GitHub Deployment

The project is configured to deploy as two Render services from a single GitHub repo.

### GitHub Repo
`proyectodigitalcolombia-ai/colombia-crime-dashboard`

### Files
- `render.yaml` — Render Blueprint defining API (Web Service) + Dashboard (Static Site) + PostgreSQL
- `artifacts/crime-dashboard/dist/public/` — pre-built dashboard static files pushed to GitHub
- `artifacts/crime-dashboard/server.js` — minimal Express server (not currently active; Render uses static site)

### Services
| Service | Render ID | URL | Type |
|---------|-----------|-----|------|
| `colombia-crime-api` | `srv-d7256m450q8c7390kbbg` | `https://colombia-crime-api.onrender.com` | Web Service (Node) — serves dashboard + API |
| `colombia-crime-dashboard` | `srv-d7256p24d50c738kd6j0` | `https://colombia-crime-dashboard.onrender.com` | Static Site (broken — build_failed since 2026-03) |
| `colombia-crime-db` | — | internal | PostgreSQL |

**Primary production URL**: `https://colombia-crime-api.onrender.com/` (API server serves both dashboard UI and API endpoints)

### Deploy workflow
The dashboard is served by the API server (Express static middleware). The static site service on Render has persistent build failures unrelated to code. Deploy workflow:
1. Run build: `BASE_PATH=/ pnpm --filter @workspace/crime-dashboard run build`
2. Push `artifacts/crime-dashboard/dist/public/` files via GitHub API
3. The API server auto-deploys from GitHub and picks up new dist files (looks at `../../crime-dashboard/dist/public` relative to its dist dir)
4. Also push to `_site/` as backup

**app.ts static serving**: `const dashboardDist = path.join(__dirname, "../../crime-dashboard/dist/public")` → Express serves the React SPA with catch-all for client-side routing.

### Environment variables (Render dashboard)
- `DATABASE_URL` — auto-linked from Render PostgreSQL  
- `SESSION_SECRET` — auto-generated by Render
- `VITE_API_URL=https://colombia-crime-api.onrender.com` — build-time env var (set in render.yaml)
- `BASE_PATH=/` — set in render.yaml

### CORS notes
- Render static site does NOT support CORS headers via `_headers` or `render.yaml headers:` key
- ES module loading works without CORS headers when serving same-origin assets on Render
- `crossorigin` attributes on `<script type="module">` tags work correctly in production

### Known limitations (upload via GitHub API proxy)
- Max ~1MB per file upload via `@replit/connectors-sdk` connectors proxy
- Vendor chunks (600KB+) can be pushed because they were uploaded early; if they change, may need to regenerate  
- If large chunks need re-upload, use Render build-from-source approach instead
