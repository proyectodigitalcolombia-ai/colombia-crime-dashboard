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

React + Vite dashboard for Colombian crime statistics. Displays interactive charts and a department heat map.

- Entry: `src/main.tsx` → `src/pages/Dashboard.tsx`
- Components: `ColombiaMap.tsx` (SVG heat map), charts via Recharts
- Data: fetches from `@workspace/api-server` using generated React Query hooks
- Theme: dark/light mode, Spanish language
- Auto-refresh every 24h; manual refresh button

**Data Sources** (loaded in `artifacts/api-server/src/routes/crimes.ts`):

| Year | Source | Format |
|------|--------|--------|
| 2026 | `INFORMACI%C3%93N_DE_DELITOS_A_NIVEL_DE_REGISTRO_A%C3%91O_2026_1.xlsx` | Individual crime records (~7.2MB, ~124k rows) |
| 2020–2025 | `CUADRO_DE_SALIDA_DELICTIVO_HISTORICO_MENSUALIZADO_20_25_1.xlsx` | Monthly aggregate tables |

The 2026 file has individual registration records (one row per crime). Parser: `parseRegistroFile()` — maps DELITOS column (e.g. "ARTÍCULO 103. HOMICIDIO") to crime type IDs, aggregates by dept+month+type. Department "CUNDINAMARCA" in the police data includes Bogotá D.C.

Refresh strategy: loads 2026 registro file first (fast), then historical cuadro file for 2020-2025 (filters out years already loaded). Falls back to demo data if both fail.

## Render + GitHub Deployment

The project is configured to deploy as two Render services from a single GitHub repo.

### Files
- `render.yaml` — Render Blueprint defining API (Web Service) + Dashboard (Static Site) + PostgreSQL (free)
- `.env.example` — required environment variables
- `.node-version` — pins Node.js 22 for build compatibility

### Services
| Service | Type | Build command |
|---------|------|---------------|
| `colombia-crime-api` | Web Service (Node) | `pnpm install && pnpm --filter @workspace/api-server run build` |
| `colombia-crime-dashboard` | Static Site | `BASE_PATH=/ pnpm --filter @workspace/crime-dashboard run build` |
| `colombia-crime-db` | PostgreSQL (free) | — |

### Environment variables
- `DATABASE_URL` — auto-linked from Render PostgreSQL
- `SESSION_SECRET` — auto-generated by Render
- `VITE_API_URL` — must be set manually to the API service URL (e.g. `https://colombia-crime-api.onrender.com`) — **build-time env var**
- `BASE_PATH` — set to `/` for Render (no subpath needed outside Replit)

### Deploy steps
1. Push this repo to GitHub
2. Go to render.com → New → Blueprint → connect the repo → Render reads `render.yaml` automatically
3. Set `VITE_API_URL` to the API service URL before triggering the dashboard build
