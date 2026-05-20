#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups/supabase}"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is required." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --schema=public \
  --file="$BACKUP_DIR/public.dump"

psql "$SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -c "\\copy (select id, email, encrypted_password, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, last_sign_in_at from auth.users) to '$BACKUP_DIR/auth_users.csv' with csv header"

echo "Supabase export written to $BACKUP_DIR"
