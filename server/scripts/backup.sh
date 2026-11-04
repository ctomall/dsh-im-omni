#!/bin/bash
# Nightly logical backup with retention.
#
#   DATABASE_URL=postgresql://... BACKUP_DIR=/var/backups/im-omni RETAIN_DAYS=7 \
#     ./scripts/backup.sh
#
# Uses the custom format so a single tenant or table can be restored selectively.
set -euo pipefail
DIR="${BACKUP_DIR:-./backups}"
RETENTION="${RETAIN_DAYS:-7}"
URL="${DATABASE_URL:-postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DIR"
FILE="$DIR/im-omni-$STAMP.dump"
pg_dump --no-owner --format=custom --file="$FILE" "$URL"
gzip -f "$FILE"
echo "backup written: $FILE.gz ($(du -h "$FILE.gz" | cut -f1))"
find "$DIR" -name 'im-omni-*.dump.gz' -mtime +"$RETENTION" -print -delete
