#!/usr/bin/env bash
set -euo pipefail

# Undoes the most recent scripts/deploy.sh run — checks out
# .last-stable-commit (the commit deploy.sh recorded right before its own
# last successful run), rebuilds, and restarts pm2. Run ON THE PRODUCTION
# SERVER, from the app root:
#   ./scripts/rollback.sh
#
# A --migrate deploy's schema change is NOT auto-reverted here — if the
# migration itself is what broke things, restore the desk.db backup that
# deploy took (see /root/pb-v5-backups/) by hand, a deliberate step, not
# something to automate blindly against real data. Triggered from the app
# via POST /api/manager-system-rollback (owner-only, behind a 30-second
# confirm in the UI — see components/manager/tabs/settings/
# updates-section.tsx) or run directly over SSH. See PB-V5 chat 2026-08-01.

cd "$(dirname "$0")/.."
STATUS_FILE="$(pwd)/deploy-status.json"
STABLE_FILE="$(pwd)/.last-stable-commit"

if [ ! -f "$STABLE_FILE" ]; then
  echo "No recorded previous version to roll back to (.last-stable-commit missing) — nothing has been deployed with scripts/deploy.sh yet." >&2
  exit 1
fi
TARGET_COMMIT="$(cat "$STABLE_FILE")"

write_status() {
  printf '{"status":"%s","version":"%s","updatedAt":"%s"}\n' "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" > "$STATUS_FILE"
}

CURRENT_VERSION="$(git rev-parse --short HEAD)"
trap 'write_status "idle" "$CURRENT_VERSION"' ERR
write_status "deploying" "$CURRENT_VERSION"

git reset --hard "$TARGET_COMMIT"
npm install
npx prisma generate
npm run build

pm2 restart pb-v5 --update-env
sleep 2

trap - ERR
NEW_VERSION="$(git rev-parse --short HEAD)"
write_status "idle" "$NEW_VERSION"

echo "Rolled back to: $NEW_VERSION"
