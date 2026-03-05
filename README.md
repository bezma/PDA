# PDA Capris - Shared Database (Node + PostgreSQL)

This project now uses PostgreSQL as the shared PDA database backend.

## API Endpoints

- `GET /api/health`
- `GET /api/positions`
- `GET /api/positions/:id`
- `POST /api/positions`
- `DELETE /api/positions/:id`

Frontend database logic remains in `/Users/bezma/Documents/PDA/public/js/pda-database.js`.
LocalStorage fallback is still used only when API is unavailable.

## Requirements

- Node.js 18+
- PostgreSQL 13+

## Environment Variables

Use either `DATABASE_URL` or discrete PG variables.

- `DATABASE_URL` (example: `postgres://user:pass@localhost:5432/pda_capris`)
- `PGHOST` (default: `127.0.0.1`)
- `PGPORT` (default: `5432`)
- `PGUSER` (default: `postgres`)
- `PGPASSWORD` (default: empty)
- `PGDATABASE` (default: `pda_capris`)
- `PGSSL=true` to enable SSL (`rejectUnauthorized: false`)

## Run Locally

1. Install dependencies:
   - `npm install`
2. Set DB environment variables.
3. Apply migrations:
   - `npm run migrate`
4. Start server:
   - `npm start`
5. Open:
   - `http://localhost:3000`

## Migrations

- Migration files live in `migrations/`.
- Applied migrations are tracked in DB table `schema_migrations`.
- Commands:
  - `npm run migrate` - apply pending migrations
  - `npm run migrate:status` - show applied/pending

`npm start` runs migrations before starting the server.

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`

CI runs on every push/PR and performs:

1. `npm ci`
2. `npm run check` (syntax checks)
3. `npm run migrate` against a PostgreSQL 16 service container
4. schema verification (`schema_migrations` and `pda_positions` tables)

## Release Workflow

Recommended flow for Railway:

1. `feature/*` branch -> PR to `staging`
2. Validate on Railway staging environment
3. Merge `staging` -> `main`
4. Railway production auto-deploys from `main`

Set GitHub branch protection for `main` to require PR + passing CI.

## Deploy

Deploy as a standard Node app with a PostgreSQL database (Render, Railway, Fly.io, VPS, etc.).
Do not deploy this API on GitHub Pages (static-only hosting).
