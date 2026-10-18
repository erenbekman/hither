#!/bin/zsh
set -u
cd "$(dirname "$0")/.."
fail=0

check() {
  if [[ "$2" == "$3" ]]; then
    print "ok    $1"
  else
    print "FAIL  $1 (got '$2', want '$3')"
    fail=1
  fi
}

url=http://127.0.0.1:47811/hook
body='{"session_id":"security-check","hook_event_name":"Notification"}'
status() { curl -s -o /dev/null -w '%{http_code}' -m 2 "$@" "$url" }
if curl -s -o /dev/null -m 2 "$url"; then
  check "hook listener serves nothing but POST /hook" "$(status)" 404
  check "hook listener refuses a request without the token" "$(status -X POST --data "$body")" 401
  check "hook listener refuses a wrong token" "$(status -X POST -H 'Authorization: Bearer 00' --data "$body")" 401
  check "hook listener refuses a web page's request" "$(status -X POST -H 'Origin: https://evil.example' -H 'Content-Type: text/plain' --data "$body")" 401
  check "hook listener allows no other origin" "$(curl -s -D - -o /dev/null -m 2 -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST' "$url" | grep -ci access-control-allow)" 0
  check "hook listener listens on loopback only" "$(lsof -nP -iTCP:47811 -sTCP:LISTEN | awk 'NR>1 {print $9}' | sort -u)" 127.0.0.1:47811
else
  print "skip  hook listener (Hither is not running)"
fi

csp=$(python3 -I - <<'EOF'
import json
csp = json.load(open("src-tauri/tauri.conf.json"))["app"]["security"]["csp"]
values = " ".join(csp.values()) if isinstance(csp, dict) else ""
print("ok" if csp and csp.get("script-src") == "'self'" and csp.get("default-src") == "'self'" and "unsafe-eval" not in values else "missing or loose")
EOF
)
check "windows run with a strict content security policy" "$csp" ok

tools=$(sed -n 's/^const PRINT_TOOLS: &str = "\(.*\)";$/\1/p' src-tauri/src/launch.rs)
check "claude -p skips MCP servers" "$(grep -c '"--strict-mcp-config"' src-tauri/src/launch.rs)" 1
if command -v claude > /dev/null; then
  started=$(cd "${TMPDIR:-/tmp}" && print 'Reply with the single word OK.' | claude -p --output-format stream-json --verbose --tools "$tools" --strict-mcp-config 2> /dev/null | python3 -I -c '
import json, sys
for line in sys.stdin:
    try:
        event = json.loads(line)
    except ValueError:
        continue
    if event.get("subtype") == "init":
        print(",".join(sorted(event["tools"])), "mcp", len(event.get("mcp_servers", [])))
        break
')
  check "claude -p summaries start with file-reading tools only" "$started" "Glob,Grep,Read mcp 0"
else
  print "skip  claude -p tools (Claude Code is not installed)"
fi

exit $fail
