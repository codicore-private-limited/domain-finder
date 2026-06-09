#!/usr/bin/env bash
#
# Domain Finder — one-command runner.
# Usage:  ./run.sh
#
# - Postgres (docker domainfinder-pg) ko start karta hai
# - .env se saari keys load karta hai
# - API server + hunter chalu karta hai (Verb+Noun pool sweep + Telegram alerts)
#
# Server band karne ke liye: Ctrl + C
#
set -euo pipefail
cd "$(dirname "$0")"

echo "▶ Starting Postgres (domainfinder-pg)…"
docker start domainfinder-pg >/dev/null 2>&1 || {
  echo "⚠ Postgres container 'domainfinder-pg' nahi mila. Pehle DB setup karo."
  exit 1
}

# Wait until Postgres accepts queries.
for i in $(seq 1 15); do
  if docker exec domainfinder-pg psql -U domain -d domainfinder -t -c "SELECT 1;" >/dev/null 2>&1; then
    echo "✔ Postgres ready."
    break
  fi
  sleep 1
done

# Load .env (DATABASE_URL, PORT, GITHUB_MODELS_TOKEN, TELEGRAM_*, etc.)
set -a
# shellcheck disable=SC1091
. ./.env
set +a

# Build only if the bundle is missing (fast restarts skip the build).
if [[ ! -f artifacts/api-server/dist/index.mjs ]]; then
  echo "▶ Building API server…"
  pnpm --filter @workspace/api-server run build
fi

echo "▶ Server starting on http://localhost:${PORT:-8080}  (Ctrl+C to stop)"
echo "   Hunter auto-starts and sweeps the Verb+Noun pool for available .com."
echo "   Available names dekhne ke liye doosre terminal mein:"
echo "     docker exec domainfinder-pg psql -U domain -d domainfinder -t -c \\"
echo "       \"SELECT fqdn FROM dns_cache WHERE signal='available' ORDER BY checked_at DESC LIMIT 50;\""
echo "────────────────────────────────────────────────────────────────────"
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
