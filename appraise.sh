#!/usr/bin/env bash
#
# Domain Finder — appraise a single name with OUR OWN engine (no third-party API).
#
# Usage:  ./appraise.sh paycloud
#         ./appraise.sh setuser.com
#
set -euo pipefail
cd "$(dirname "$0")"

NAME="${1:-}"
if [[ -z "$NAME" ]]; then
  echo "Usage: ./appraise.sh <name>   e.g. ./appraise.sh paycloud"
  exit 1
fi

PORT="8080"
if [[ -f .env ]]; then PORT="$(grep -E '^PORT=' .env | cut -d= -f2 || echo 8080)"; fi
PORT="${PORT:-8080}"

curl -s -m 30 "http://localhost:${PORT}/api/appraise?name=${NAME}" \
  | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  let j; try{j=JSON.parse(d)}catch(e){console.log("Server not running? Start with ./run.sh");process.exit(0)}
  if(j.error){console.log(j.error);return}
  console.log("");
  console.log("  Domain     : "+j.name+"."+j.tld);
  console.log("  Value      : $"+j.usd.toLocaleString()+"   (range $"+j.low.toLocaleString()+"–$"+j.high.toLocaleString()+")");
  console.log("  Tier       : "+j.tier+(j.isDiamond?"  💎 DIAMOND":""));
  console.log("  Confidence : "+j.confidence);
  if(j.comparable) console.log("  Comparable : "+j.comparable);
  console.log("  Factors    :");
  for(const f of (j.factors||[])) console.log("     - "+f.name.padEnd(18)+" x"+f.weight+"   ("+f.detail+")");
  console.log("");
});
'
