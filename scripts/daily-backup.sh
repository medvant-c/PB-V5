#!/usr/bin/env bash
set -euo pipefail

# Scheduled daily backup — the ONLY existing backup before this was a
# side effect of scripts/deploy.sh --migrate (schema-changing deploys
# only), so a run of several days between migrations left desk.db with no
# backup coverage at all. Installed via cron on the production server:
#   30 3 * * * /var/www/PB-V5/scripts/daily-backup.sh >> /var/log/pb-v5-backup.log 2>&1
#
# Backs up desk.db (real client/quote data) with `sqlite3 .backup`, not a
# raw file copy — a plain cp can grab a half-written page while the app is
# live-writing, `.backup` uses SQLite's own online-backup API and is
# always consistent. Also archives desk-uploads/ (client/quote photos —
# see UPLOAD_ROOT in lib/storage.ts), same as the existing ad-hoc
# pre-migration backups already do. Both land in
# /root/pb-v5-backups/daily/, kept for RETENTION_DAYS then pruned so this
# doesn't grow unbounded. Local-only (same disk as the live server) — see
# PB-V5 chat 2026-08-03 for why an offsite copy is a separate, deliberate
# follow-up, not bundled into this script.

cd "$(dirname "$0")/.."

BACKUP_DIR="/root/pb-v5-backups/daily"
RETENTION_DAYS=30
STAMP="$(date -u +%Y%m%dT%H%M%S)"

mkdir -p "$BACKUP_DIR"

sqlite3 desk.db ".backup '$BACKUP_DIR/desk-$STAMP.db'"

if [ -d desk-uploads ]; then
  tar -czf "$BACKUP_DIR/desk-uploads-$STAMP.tar.gz" desk-uploads
fi

find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete

echo "[$STAMP] Backup complete: $(ls -la "$BACKUP_DIR/desk-$STAMP.db" | awk '{print $5}') bytes"
