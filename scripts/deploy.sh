#!/usr/bin/env bash
set -euo pipefail

# Run ON THE PRODUCTION SERVER, from the app root:
#   ./scripts/deploy.sh [--migrate]
#
# Wraps git pull + build + pm2 restart in a status file
# (deploy-status.json, sibling to package.json — outside .next so a fresh
# build never wipes it) that DeploymentWatcher (see
# components/manager/deployment-watcher.tsx, polled via
# /api/manager-system-status) reads to show "идёт обновление" in every
# open manager tab for the WHOLE build (30-60s), not just the second or
# two pm2 actually spends swapping the process — that's the only moment
# the server is genuinely unreachable. See PB-V5 chat 2026-08-01.
#
# --migrate additionally backs up desk.db and runs `prisma db push
# --accept-data-loss` — only pass it for a schema-changing deploy, same
# "always back up before a schema push" rule this project already follows
# manually for every migration.

cd "$(dirname "$0")/.."
STATUS_FILE="$(pwd)/deploy-status.json"

MIGRATE=false
for arg in "$@"; do
  [ "$arg" = "--migrate" ] && MIGRATE=true
done

write_status() {
  printf '{"status":"%s","version":"%s","updatedAt":"%s"}\n' "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" > "$STATUS_FILE"
}

CURRENT_VERSION="$(git rev-parse --short HEAD)"
# If anything below fails, drop the flag back to "idle" at the OLD version
# immediately — the still-running old process is unaffected by a failed
# build, so open tabs must stop showing "идёт обновление" for a deploy
# that never actually happened.
trap 'write_status "idle" "$CURRENT_VERSION"' ERR
write_status "deploying" "$CURRENT_VERSION"

git pull origin main

if [ "$MIGRATE" = true ]; then
  mkdir -p /root/pb-v5-backups
  cp desk.db "/root/pb-v5-backups/desk-$(date -u +%Y%m%dT%H%M%S)-pre-deploy.db"
fi

npm install

if [ "$MIGRATE" = true ]; then
  npx prisma db push --accept-data-loss
else
  npx prisma generate
fi

npm run build

pm2 restart pb-v5 --update-env
sleep 2

trap - ERR
NEW_VERSION="$(git rev-parse --short HEAD)"
write_status "idle" "$NEW_VERSION"

echo "Deploy complete: $NEW_VERSION"
