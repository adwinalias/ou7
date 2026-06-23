#!/usr/bin/env bash
# OU7 Definition-of-Done gate (Stop hook).
# Exit 2 = BLOCK: forces the agent to keep working and feeds the failure back into context.
# Exit 0 = the agent may finish.
set -uo pipefail

# Resolve repo root from this script's location (.claude/hooks/gate.sh -> repo root).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || { echo "GATE: cannot cd to repo root"; exit 2; }

fail() { echo "GATE FAILED at: $1"; exit 2; }

echo "==> [1/4] typecheck"; npm run typecheck || fail "typecheck"
echo "==> [2/4] lint";      npm run lint      || fail "lint"
echo "==> [3/4] unit tests";npm test          || fail "unit tests"
echo "==> [4/4] build";     npm run build     || fail "build"

echo "GATE PASSED (typecheck + lint + unit tests + build)."
exit 0
