#!/usr/bin/env bash
# Starts the fixture site and three app servers, runs the browser test, stops everything.
set -u
cd "$(dirname "$0")/../.."
SHOTS=${SHOTS:-/tmp}
setsid bash -c "cd tests/e2e/site && exec python3 -m http.server 3200" >/dev/null 2>&1 & S0=$!
setsid env -u TYPESAFE_API_KEY JEV_MOCK=1 RUN_CONCURRENCY=8 npx next start -p 3100 >/dev/null 2>&1 & S1=$!
setsid env -u TYPESAFE_API_KEY JEV_MOCK=1 APP_AUTH=password APP_PASSWORD=secret-for-tests MCP_API_KEY=e2e:mcp-key-for-tests-0123 npx next start -p 3101 >/dev/null 2>&1 & S2=$!
setsid env -u TYPESAFE_API_KEY -u JEV_MOCK -u APP_PASSWORD npx next start -p 3102 >/dev/null 2>&1 & S3=$!
trap 'for p in $S0 $S1 $S2 $S3; do kill -- -$p 2>/dev/null; done' EXIT
for port in 3100 3101 3102 3200; do for i in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$port/" && break; sleep 0.5; done; done
python3 tests/e2e/e2e.py tests/e2e/fixture-profile.json "$SHOTS"; CODE=$?
exit $CODE
