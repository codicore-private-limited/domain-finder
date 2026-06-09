#!/usr/bin/env bash
#
# Domain Finder — best "diamonds" (highest USD value) from available .com names.
# Uses OUR OWN appraisal engine (no third-party API).
#
# Usage:  ./diamonds.sh            top 30 worth >= $2000
#         ./diamonds.sh 500 50     top 50 worth >= $500
#
# (Server must be running: ./run.sh)
#
set -euo pipefail
cd "$(dirname "$0")"

MIN="${1:-2000}"
LIMIT="${2:-30}"
PORT="${PORT:-8080}"

# Load PORT from .env if present.
if [[ -f .env ]]; then PORT="$(grep -E '^PORT=' .env | cut -d= -f2 || echo 8080)"; fi
PORT="${PORT:-8080}"

echo "💎 Appraising available .com names — showing value >= \$${MIN} (top ${LIMIT})…"
echo "────────────────────────────────────────────────────────────────────"
curl -s -m 60 "http://localhost:${PORT}/api/diamonds?min=${MIN}&limit=${LIMIT}" \
  | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  let j; try{j=JSON.parse(d)}catch(e){console.log("Server not running? Start with ./run.sh");process.exit(0)}
  if(!j.diamonds){console.log(JSON.stringify(j));return}
  console.log("Scanned "+j.totalAvailable.toLocaleString()+" available names | "+j.matched+" above $"+j.threshold.toLocaleString()+"\n");
  if(j.diamonds.length===0){console.log("  (none above this value — lower the min, e.g. ./diamonds.sh 500)");return}
  for(const x of j.diamonds){
    console.log("  $"+String(x.usd).padStart(7)+"  "+x.domain.padEnd(22)+" ["+x.tier+"]  "+x.range);
    console.log("           why: "+x.reasons.join(" · "));
  }
});
'
