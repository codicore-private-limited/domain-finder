#!/usr/bin/env bash
#
# Domain Finder — best AI/local-confirmed diamonds from available .com names.
#
# Usage:  ./diamonds.sh            top 30 with diamond score >= 80
#         ./diamonds.sh 65 50      top 50 with diamond score >= 65
#
# (Server must be running: ./run.sh)
#
set -euo pipefail
cd "$(dirname "$0")"

MIN="${1:-80}"
LIMIT="${2:-30}"
PORT="${PORT:-8080}"

# Load PORT from .env if present.
if [[ -f .env ]]; then PORT="$(grep -E '^PORT=' .env | cut -d= -f2 || echo 8080)"; fi
PORT="${PORT:-8080}"

echo "💎 Showing available .com diamonds — score >= ${MIN}/100 (top ${LIMIT})…"
echo "────────────────────────────────────────────────────────────────────"
curl -s -m 60 "http://localhost:${PORT}/api/diamonds?min=${MIN}&limit=${LIMIT}" \
  | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  let j; try{j=JSON.parse(d)}catch(e){console.log("Server not running? Start with ./run.sh");process.exit(0)}
  if(!j.diamonds){console.log(JSON.stringify(j));return}
  console.log("Scanned "+j.totalAvailable.toLocaleString()+" available names | "+j.matched+" above "+j.threshold+"/100\n");
  if(j.diamonds.length===0){console.log("  (none above this gate — lower the min, e.g. ./diamonds.sh 65)");return}
  for(const x of j.diamonds){
    console.log("  "+String(x.score).padStart(3)+"/100  "+x.domain.padEnd(24)+" ["+x.source+"]");
    console.log("           why: "+x.reason);
  }
});
'
