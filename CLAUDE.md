# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Mobile Shop POS & ERP: a phone-retail point-of-sale and back-office system (inventory by IMEI, sales, refunds/exchanges, transfers between stores, repairs, suppliers and invoices, expenses and payroll, owner/partner capital and profit). One repo holds:

- **Frontend** (`src/`): React 19 + Vite 6 + Tailwind 4 SPA, installable as a PWA and wrapped as iOS/Android apps with Capacitor 8 (`android/`, `ios/`).
- **Backend** (`server/src/`): Express 4 + Prisma 6 on PostgreSQL, with a `ws` WebSocket gateway for realtime sync.

All user-facing text (UI strings, API error messages, audit log details) is in **Russian**. Keep new messages in Russian. Currencies are **TJS** (local) and **USD**.

## Commands

```bash
npm run dev              # backend (tsx watch, :3001) + Vite frontend (:3000, proxies /api and /ws to :3001)
npm run server           # backend only
npm run dev:frontend     # frontend only
npm run lint             # tsc --noEmit (the only "lint"; there is no ESLint)
npm test                 # vitest run (unit tests, no DB needed)
npx vitest run server/src/modules/sales/profit.test.ts   # single test file
npx vitest run -t "name of test"                         # single test by name
npm run build            # production web build to dist/
```

Database (local Postgres from `docker-compose.yml` listens on **port 5435**; `docker compose up -d db`):

```bash
npx prisma migrate dev --name <change>   # create a migration after editing prisma/schema.prisma
npx prisma migrate deploy                # apply migrations
npx prisma db seed                       # prisma/seed.ts
```

`npm install` runs `prisma generate` automatically (postinstall). Seeding with `SEED_TEST_DATA=true` creates test users (`admin`/`admin123`, etc.). Without it, new seed users need `SEED_PASSWORD_<LOGIN>` env vars of at least 16 characters.

DB-backed integration suites are plain `tsx` scripts in `scripts/` (not vitest). They need a migrated, seeded local DB:

```bash
npm run test:e2e             # scripts/test-e2e-all.ts: boots `app` on a random port and drives the HTTP API
npm run test:audit-fixes     # creates and drops its own schema, runs migrate + seed + e2e inside it
npm run test:profit-refund
npm run test:functional
npm run audit:owners         # check owner balance consistency
```

CI (`.github/workflows/ci-cd.yml`) runs: `lint` → `test` → `migrate deploy` → `db seed` → `test:e2e` → `test:audit-fixes` + `test:profit-refund` → `build`.

Native: `npm run native:sync` (runs `vite build --mode native`, then `cap sync`). A native build fails unless `VITE_API_URL` (https) and `VITE_WS_URL` (wss) are set (see `.env.native.example`).

## Backend architecture

- `server/src/index.ts` starts the server: it serves `dist/` with an SPA fallback, listens, and attaches the WebSocket gateway. `server/src/app.ts` builds the Express `app` (CORS from `APP_URL`, login rate limiting, a few inline routes such as purchases, sales, devices and stores, and the central error handler), then calls each `registerXRoutes(app)` from `server/src/modules/<domain>/`. Tests import `app` directly.
- Each module has `*.routes.ts`, which handles HTTP, auth guards and response shaping, and `*.service.ts`, which holds the business logic inside `prisma.$transaction`. After a successful write, routes call `RealtimeSyncGateway.broadcast(event, payload, { storeIds })` so connected clients refetch.
- **Errors:** services `throw new Error('<Russian message>')` and the central handler returns it as a 400. For 403 or 409, attach `statusCode` with `Object.assign(new Error(...), { statusCode })`. Prisma errors are never forwarded to the client (P2002 becomes 409, schema drift becomes 503).
- **Auth/RBAC** (`server/src/auth/`): JWT plus a DB-backed `AuthSession` (so logout and revocation work). Roles are `ADMIN | PARTNER | SELLER`. Use `requireRoles(...)` for role checks. Use `enforceStoreScope` / `enforceBodyStoreScope` to force a store-bound user's `storeId` onto the query or body. Many routes also compute store scope inline from `req.user.role` and `req.user.storeId`. One `Store` has `isMainWarehouse`, and store-bound users can still see it for transfer flows.
- **Idempotency:** the client sends an `Idempotency-Key` on every mutation. `operationContext` middleware and `executeOperation` (`server/src/common/request-operation.ts`) cooperate with a patched `prisma.$transaction` (`server/src/prisma/prisma.service.ts`). **Every** interactive `prisma.$transaction(fn)` in a request is automatically deduplicated: a replay returns the stored result from the `operation_requests` table. Do money-moving writes inside one `$transaction` callback so they commit atomically with the stored response.

### Money and finance rules

- **Never use JS `number` arithmetic for money.** Use `D()` from `server/src/common/decimal.ts` (Prisma.Decimal, precision 40, ROUND_HALF_UP). Use `requirePositiveMoney`, `requireNonNegativeMoney` and `roundMoney` from `common/money.ts` to validate input. Decimals are converted to numbers only at the JSON boundary (`decimalJsonReplacer` on the app, and `moneyJson()` for JSON columns such as `AuditLog.financialDetails`). Money columns are `Decimal` in Postgres.
- **Exchange rates:** `ExchangeRate` has one row per business day, keyed `YYYY-MM-DD` in `BUSINESS_TIME_ZONE` (default `Asia/Tashkent`, see `common/business-date.ts`). Write operations call `requireTodayRate(tx)` and **snapshot** `exchangeRate` and the USD amounts onto the record. Reports must sum each record's own stored USD amount or rate, never a period's TJS total divided by today's rate.
- **Two parallel bookkeeping layers are kept in sync:** (1) denormalized balances on domain rows, such as `Store.cashBalanceTjs`, `Supplier.totalDebtUsd` and `Owner.capitalBalanceUsd`, with `LedgerEntry` rows; (2) a double-entry-style ledger, where `postTransaction()` in `server/src/modules/finance/financial-transaction.service.ts` writes a `FinancialTransaction` and moves `FinancialAccount` balances, rejecting overdrafts by default. Money-moving code updates both inside the same transaction.
- Owner profit is split by `profitSharePercent` (must total exactly 100%) with cent-exact remainder distribution (`allocateOwnerProfit` in `modules/sales/profit.ts`, `modules/finance/owner-allocations.ts`). Sales accrue owner profit per sale; refunds and exchanges reverse it.
- Every business write also creates an `AuditLog` row (Russian `details`, with optional `financialDetails`).

## Frontend architecture

- `src/context/AppContext.tsx` is the central data layer: a context wrapping a zustand store. It loads and holds nearly all business data (stores, devices, sales, suppliers, expenses, owners, …), exposes action functions that call the API, and refetches on realtime events (`hooks/useRealtimeSync.ts`). Large collections (sales, repairs, invoices, expenses) load only a recent bounded window. Older data is fetched through `fetch*Range(...)` helpers that merge results into state, and SOLD devices are excluded unless looked up by IMEI or invoice.
- `src/api/client.ts` (`apiClient`) adds the bearer token, a 45s timeout and the auto-generated `Idempotency-Key` for mutations. The key persists in sessionStorage across ambiguous failures so a retry recovers the committed result. `src/api/mappers.ts` converts API rows to the frontend types in `src/types/index.ts`.
- Navigation is state-based rather than URL-based: react-router only separates `/login` from the app. `router/MainLayout.tsx` lazy-loads the page component for `activePage` (`PageId`) from `components/pages/`. Page files are large, self-contained screens. Shared primitives live in `components/ui/`.
- `stores/useAuthStore.ts` holds the session and `stores/useUIStore.ts` holds UI state. The barcode/IMEI scanner lives in `services/scanner/` (ML Kit on native, html5-qrcode on web).
- Client money math uses `src/utils/money.ts`. Report exports (Excel via lazily loaded `exceljs`) live in `src/utils/exportReports.ts`.
- The path alias `@/` maps to the repo root.

## Deployment

- `Dockerfile` + `docker-compose.prod.yml`: a single `app` container serves both the API and `dist/`, behind nginx (`nginx/nginx.conf`, which rate-limits `/api`). `docker-entrypoint.sh` runs migrations on start. `JWT_SECRET` and `APP_URL` are required in production, and the server refuses to boot without them.
- `vercel.json` deploys the static frontend and rewrites `/api/*` to the Render-hosted backend. The CSP there must list any new external origin.
- Backup and restore scripts: `scripts/backup-db.sh` and `scripts/restore-db.sh`.
