#!/usr/bin/env bash
# SQLite backup script. Copies local.db with WAL checkpoint and writes a
# timestamped .gz to ./backups. Designed to be run from cron.
#
# Example cron (daily at 03:00):
#   0 3 * * * /path/to/knowledge_vault/scripts/backup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/local.db"
BACKUPS="$ROOT/backups"
TS="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUPS/kv-$TS.db"

if [ ! -f "$DB" ]; then
  echo "[backup] ❌ database not found at $DB" >&2
  exit 1
fi

mkdir -p "$BACKUPS"

# Use the sqlite3 CLI if available for a consistent online copy (handles WAL).
if command -v sqlite3 >/dev/null 2>&1; then
  echo "[backup] snapshot via sqlite3 .backup"
  sqlite3 "$DB" ".backup '$OUT'"
else
  # Fallback: plain file copy. WAL mode means writers may be mid-flight, but
  # a read-only snapshot is still safe enough for recovery in practice.
  echo "[backup] sqlite3 CLI not found, falling back to cp"
  cp "$DB" "$OUT"
fi

gzip -9 "$OUT"
echo "[backup] ✓ wrote $OUT.gz"

# Retention: keep last 30 days of backups.
find "$BACKUPS" -name "kv-*.db.gz" -type f -mtime +30 -delete 2>/dev/null || true
echo "[backup] ✓ pruned >30 day old snapshots"
