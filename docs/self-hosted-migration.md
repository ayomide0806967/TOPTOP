# Self-Hosted Migration: Supabase to Dokploy PostgreSQL, Redis, Better Auth

This project currently depends on Supabase from browser code and Supabase Edge Functions. The self-hosted target is therefore a backend migration, not only a database migration.

## Target Architecture

- `app`: Node/Hono server that serves the existing static app and mounts Better Auth at `/api/auth/*`.
- `postgres`: primary application database on the Dokploy VPS.
- `redis`: Better Auth secondary storage for sessions, verification records, and short-lived auth data.
- `better-auth`: new auth provider backed by PostgreSQL and Redis.

## Important Auth Constraint

Supabase password hashes should not be treated as Better Auth password hashes. The import path preserves user IDs and emails, then seeds Better Auth users so existing foreign keys keep working. Users should reset passwords after cutover unless we add a deliberate password re-enrollment flow.

## One-Time VPS Setup

1. Create Dokploy compose app from `docker-compose.dokploy.yml`.
2. Set these Dokploy environment variables:
   - `POSTGRES_PASSWORD`
   - `REDIS_PASSWORD`
   - `BETTER_AUTH_URL`
   - `BETTER_AUTH_TRUSTED_ORIGINS`
   - `BETTER_AUTH_SECRET`
3. Deploy once so Postgres and Redis volumes are created.
4. Keep Supabase live until the final smoke test passes.

## Export From Supabase

Use the direct database connection string from Supabase, not the browser anon key.

```bash
SUPABASE_DB_URL='postgresql://...' BACKUP_DIR=./backups/supabase ./scripts/export-supabase-db.sh
```

The export writes:

- `public.dump`: application schema and data.
- `auth_users.csv`: minimal Supabase auth user identity data needed to preserve IDs.

## Import Into Self-Hosted Postgres

Run this against the Dokploy Postgres database from a shell that can reach it:

```bash
TARGET_DATABASE_URL='postgresql://cbt_fast:...@localhost:5432/cbt_fast' BACKUP_DIR=./backups/supabase ./scripts/import-self-hosted-db.sh
```

The import does the following:

1. Creates a small `auth` compatibility schema for existing Supabase foreign keys/functions.
2. Imports Supabase auth user IDs/emails into `auth.users`.
3. Restores the `public` schema dump.
4. Runs Better Auth migrations.
5. Seeds Better Auth `public."user"` rows from `auth.users` and `public.profiles`.
6. Disables public-table RLS because the self-hosted app must enforce authorization in the server API, not with browser-side PostgREST.

`npm run auth:generate` is available if you want a checked-in Better Auth SQL migration, but the CLI requires a reachable PostgreSQL database because it introspects existing tables. The import script uses `npm run auth:migrate` against the real target database instead.

## Code Migration Order

1. Keep the new Node server and `/api/health` running in Dokploy.
2. Replace Supabase Edge Functions with server routes:
   - registration and pending users
   - Paystack initiate/verify/webhook/reconcile
   - WhatsApp link request/confirm
   - bulk account generation
   - admin user updates
3. Replace browser `supabase.from/rpc/storage` calls with first-party `/api/*` routes.
4. Replace browser `supabase.auth.*` calls with the Better Auth client or plain calls to `/api/auth/*`.
5. Remove Supabase URL/anon-key config from HTML pages after every page is using the self-hosted API.

## Cutover Checks

- `GET /api/health` returns `postgres: ok` and `redis: ok`.
- Admin can sign in through Better Auth after password reset/re-enrollment.
- Learner dashboard loads profile, subscription, announcements, and daily quiz data through new API routes.
- Paystack webhook points to the Dokploy app, not Supabase Functions.
- A fresh database backup exists before DNS/webhook cutover.
