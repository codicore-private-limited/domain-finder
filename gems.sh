#!/usr/bin/env bash
#
# Domain Finder — abhi tak mile available .com naam dikhata hai.
# Usage:  ./gems.sh         (latest 50)
#         ./gems.sh 200     (latest 200)
#
set -euo pipefail
cd "$(dirname "$0")"

LIMIT="${1:-50}"

echo "💎 Latest ${LIMIT} AVAILABLE .com found:"
docker exec domainfinder-pg psql -U domain -d domainfinder -t -c \
  "SELECT fqdn FROM dns_cache WHERE signal='available' ORDER BY checked_at DESC LIMIT ${LIMIT};" \
  2>/dev/null | tr -d ' ' | grep -E '.' | tr '\n' ' '
echo

echo
echo "📊 Totals:"
docker exec domainfinder-pg psql -U domain -d domainfinder -t -c \
  "SELECT '  available: ' || count(*) FILTER (WHERE signal='available') || '  |  checked: ' || count(*) FROM dns_cache;" \
  2>/dev/null
