#!/bin/bash
# Restore the newest backup into a scratch database and assert the data landed.
# This is the drill that makes the backup real; run it on a schedule.
set -euo pipefail
DIR="${BACKUP_DIR:-./backups}"
ADMIN="${ADMIN_DATABASE_URL:-postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev}"
DRILL_DB="${DRILL_DB:-im_omni_drill}"
LATEST="$(ls -1t "$DIR"/im-omni-*.dump.gz 2>/dev/null | head -1 || true)"
if [ -z "${LATEST:-}" ]; then
  echo "FAIL: no backup found in $DIR"
  exit 1
fi

# Swap only the database name in the URL; credentials and host stay as given.
with_db() { echo "$1" | sed -E "s#/[^/?]+(\?|$)#/$2\1#"; }
ADMIN_DB="$(with_db "$ADMIN" postgres)"
DRILL_URL="$(with_db "$ADMIN" "$DRILL_DB")"

echo "restoring $LATEST into $DRILL_DB"
psql "$ADMIN_DB" -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS $DRILL_DB"
psql "$ADMIN_DB" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $DRILL_DB"

if ! gunzip -c "$LATEST" | pg_restore --no-owner --dbname="$DRILL_URL"; then
  echo "FAIL: pg_restore rejected the archive"
  exit 1
fi

SCHEMA="$(psql "$DRILL_URL" -tAc 'SELECT count(*) FROM schema_migrations' | tr -d ' ')"
TENANTS="$(psql "$DRILL_URL" -tAc 'SELECT count(*) FROM tenants' | tr -d ' ')"
psql "$ADMIN_DB" -v ON_ERROR_STOP=1 -qc "DROP DATABASE $DRILL_DB"

if [ "${SCHEMA:-0}" -lt 1 ]; then
  echo "FAIL: schema_migrations empty after restore"
  exit 1
fi
echo "PASS: restored migrations=$SCHEMA tenants=${TENANTS:-0}"
