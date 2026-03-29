# Workspace

## Overview

This project is a pnpm workspace monorepo using TypeScript, designed to provide a comprehensive solution for analyzing and visualizing Colombian crime statistics. It includes a robust API server, a React-based crime dashboard, and various shared libraries. The primary goal is to offer a powerful tool for understanding crime patterns, assessing route risks, and generating detailed managerial reports. The project aims to consolidate crucial data from various sources, making it accessible and actionable for users.

## User Preferences

I prefer concise and clear communication. When making changes, prioritize iterative development and explain the high-level approach before diving into implementation details. Always ask for confirmation before making significant architectural changes or altering core functionalities.

## System Architecture

The project is structured as a pnpm monorepo with separate packages for deployable applications, shared libraries, and utility scripts.

**Core Technologies:**
- **Monorepo:** pnpm workspaces
- **Backend:** Node.js 24, Express 5
- **Database:** PostgreSQL with Drizzle ORM
- **Frontend:** React, Vite
- **TypeScript:** 5.9
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API Codegen:** Orval (from OpenAPI spec)
- **Build Tool:** esbuild (CJS bundle)

**Monorepo Structure:**
- `artifacts/`: Contains deployable applications like `api-server` and `crime-dashboard`.
- `lib/`: Houses shared libraries such as `api-spec`, `api-client-react`, `api-zod`, and `db`.
- `scripts/`: Holds utility scripts for various tasks.

**TypeScript & Composite Projects:**
All packages extend a base `tsconfig.base.json` with `composite: true`, enabling efficient cross-package type checking and dependency management. The root `tsconfig.json` manages project references.

**API Server (`@workspace/api-server`):**
- Express 5 server handling API requests.
- Routes are defined in `src/routes/` and use `@workspace/api-zod` for validation and `@workspace/db` for persistence.
- Includes authentication routes (`POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `PATCH /api/auth/config`) with JWT Bearer tokens and bcryptjs.
- Serves the React dashboard's static files.

**Database Layer (`@workspace/db`):**
- Drizzle ORM with PostgreSQL, exporting a Drizzle client and schema models.
- Drizzle Kit is used for migrations.

**OpenAPI & Codegen (`@workspace/api-spec`):**
- Manages the OpenAPI 3.1 specification (`openapi.yaml`) and Orval configuration.
- Generates React Query hooks (`@workspace/api-client-react`) and Zod schemas (`@workspace/api-zod`) from the spec.

**Crime Dashboard (`@workspace/crime-dashboard`):**
A React + Vite application for visualizing Colombian crime statistics, featuring:
- **Estadísticas Delictivas:** Displays crime statistics on an SVG heat map of Colombia, with Recharts for data visualization. Includes a blockade overlay.
- **Análisis de Ruta (Piratería Terrestre):** Offers a 6-factor risk matrix for route analysis, real-time weather data (Open-Meteo), PDF export of reports, and CRUD operations for blockades (persisted in PostgreSQL). Fetches official road closures from `policia.gov.co`.
- **Restricciones Puentes Festivos:** Shows 2026 Colombian holiday traffic restrictions for cargo vehicles, with live status indicators and printable reports.
- **Informe Gerencial PDF:** Generates a 6-page branded PDF report with configurable client details, executive summary, departmental rankings, crime types, year-over-year comparisons, and blockade conclusions, using `jsPDF`.
- **Authentication:** Integrated with the `api-server`'s JWT-based authentication system. Stores tokens in `localStorage`.
- **Alert Banner System:** Global component for displaying alerts related to data refresh status, API errors, and stale data.
- **UI/UX:** Dark/light mode, Spanish language. The branding for PDF reports is configurable with logo upload and color presets.

**Data Sources:**
- Crime data is loaded from `.xlsx` files (`INFORMACIÓN_DE_DELITOS_A_NIVEL_DE_REGISTRO_AÑO_2026_1.xlsx` for individual records and `CUADRO_DE_SALIDA_DELICTIVO_HISTORICO_MENSUALIZADO_20_25_1.xlsx` for historical aggregates). Data is parsed and aggregated by department, month, and crime type.

**Deployment:**
The project is deployed on Render using a `render.yaml` Blueprint. The `api-server` (Web Service) serves both the API endpoints and the static files of the `crime-dashboard`.

## External Dependencies

- **PostgreSQL:** Primary database for persistence.
- **Orval:** API codegen tool for generating clients and schemas from OpenAPI.
- **Open-Meteo API:** Used for fetching real-time weather data in the Route Analyzer.
- **jsPDF:** Library for generating PDF reports.
- **Recharts:** React charting library.
- **`policia.gov.co/estado-de-las-vias`:** Scraped for official road closure information.