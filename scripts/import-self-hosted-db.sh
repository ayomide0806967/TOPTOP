#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups/supabase}"
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-${DATABASE_URL:-}}"

if [[ -z "$TARGET_DATABASE_URL" ]]; then
  echo "TARGET_DATABASE_URL or DATABASE_URL is required." >&2
  exit 1
fi

if [[ ! -f "$BACKUP_DIR/public.dump" ]]; then
  echo "Missing $BACKUP_DIR/public.dump. Run scripts/export-supabase-db.sh first." >&2
  exit 1
fi

if [[ ! -f "$BACKUP_DIR/auth_users.csv" ]]; then
  echo "Missing $BACKUP_DIR/auth_users.csv. Run scripts/export-supabase-db.sh first." >&2
  exit 1
fi

export DATABASE_URL="$TARGET_DATABASE_URL"

psql "$TARGET_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -f migrations/self_hosted/000_supabase_compat.sql

psql "$TARGET_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -c "\\copy auth.users (id, email, encrypted_password, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, last_sign_in_at) from '$BACKUP_DIR/auth_users.csv' with csv header"

pg_restore \
  --no-owner \
  --no-acl \
  --dbname="$TARGET_DATABASE_URL" \
  "$BACKUP_DIR/public.dump"

npm run auth:migrate

psql "$TARGET_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -f migrations/self_hosted/020_seed_better_auth_users.sql \
  -f migrations/self_hosted/030_disable_public_rls.sql

echo "Self-hosted import completed."
