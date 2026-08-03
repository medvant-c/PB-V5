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
# doesn't grow unbounded.
#
# Also mirrors both files to Yandex.Disk over WebDAV — local-only backups
# share a disk with the live server, so a dead/compromised VPS would take
# both the original AND every backup with it. Credentials live in
# /root/.pb-v5-yandex-backup.env (root-only, 600, NOT in this repo — a
# Yandex "app password" for WebDAV, not the account's real password, so
# it's independently revocable). If that file is missing, the offsite
# step is skipped — local backups still happen either way. See PB-V5 chat
# 2026-08-03.

cd "$(dirname "$0")/.."

BACKUP_DIR="/root/pb-v5-backups/daily"
RETENTION_DAYS=30
STAMP="$(date -u +%Y%m%dT%H%M%S)"
YANDEX_ENV_FILE="/root/.pb-v5-yandex-backup.env"
WEBDAV_URL="https://webdav.yandex.ru/pb-v5-backups"

mkdir -p "$BACKUP_DIR"

sqlite3 desk.db ".backup '$BACKUP_DIR/desk-$STAMP.db'"

if [ -d desk-uploads ]; then
  tar -czf "$BACKUP_DIR/desk-uploads-$STAMP.tar.gz" desk-uploads
fi

find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete

echo "[$STAMP] Local backup complete: $(ls -la "$BACKUP_DIR/desk-$STAMP.db" | awk '{print $5}') bytes"

if [ -f "$YANDEX_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$YANDEX_ENV_FILE"
  AUTH="$YANDEX_WEBDAV_LOGIN:$YANDEX_WEBDAV_PASSWORD"

  curl -sf -u "$AUTH" -X MKCOL "$WEBDAV_URL" -o /dev/null || true

  for f in "$BACKUP_DIR/desk-$STAMP.db" "$BACKUP_DIR/desk-uploads-$STAMP.tar.gz"; do
    [ -f "$f" ] && curl -sf -u "$AUTH" -T "$f" "$WEBDAV_URL/$(basename "$f")"
  done

  # Same RETENTION_DAYS as local — parses the timestamp already embedded in
  # each filename (this script's own naming, not WebDAV's getlastmodified)
  # rather than pulling in a full XML parser just for PROPFIND.
  cutoff_epoch=$(( $(date -u +%s) - RETENTION_DAYS * 86400 ))
  curl -sf -u "$AUTH" -X PROPFIND -H "Depth: 1" "$WEBDAV_URL" \
    | grep -o '<d:href>[^<]*</d:href>' \
    | sed -E 's#<d:href>/pb-v5-backups/([^<]*)</d:href>#\1#' \
    | grep -E '^(desk|desk-uploads)-[0-9]{8}T[0-9]{6}' \
    | while read -r name; do
        file_stamp=$(echo "$name" | grep -oE '[0-9]{8}T[0-9]{6}')
        file_epoch=$(date -u -d "${file_stamp:0:8} ${file_stamp:9:2}:${file_stamp:11:2}:${file_stamp:13:2}" +%s 2>/dev/null || echo 0)
        if [ "$file_epoch" -gt 0 ] && [ "$file_epoch" -lt "$cutoff_epoch" ]; then
          curl -sf -u "$AUTH" -X DELETE "$WEBDAV_URL/$name" -o /dev/null || true
        fi
      done

  echo "[$STAMP] Yandex.Disk sync complete."
else
  echo "[$STAMP] $YANDEX_ENV_FILE not found — skipping offsite sync."
fi
