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
3. Start server:
   - `npm start`
4. Open:
   - `http://localhost:3000`

## Startup Behavior

On startup, the server ensures PostgreSQL schema (table and indexes) exists.

## Deploy

Deploy as a standard Node app with a PostgreSQL database (Render, Railway, Fly.io, VPS, etc.).
Do not deploy this API on GitHub Pages (static-only hosting).
