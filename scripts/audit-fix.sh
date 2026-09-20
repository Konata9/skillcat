#!/usr/bin/env bash
#
# Dependency security scan for CI.
#
# Runs `pnpm audit` and, when high/critical advisories are found, attempts to
# fix them: first by updating the vulnerable packages in the lockfile, then by
# adding pnpm overrides if anything remains. A Markdown summary is written to
# `audit-report.md` so the workflow can use it as the pull-request body.
#
# Always exits 0 (unless the script itself is broken) so the workflow can still
# run the test suite and open a PR with whatever fixes were applied.
set -uo pipefail

REPORT="${AUDIT_REPORT:-audit-report.md}"
LEVEL="${AUDIT_LEVEL:-high}"
GITHUB_OUTPUT="${GITHUB_OUTPUT:-/dev/null}"

log() { printf '%s\n' "$*"; }

: > "$REPORT"
{
  echo "## Dependency audit"
  echo
} >> "$REPORT"

log "Running pnpm audit (audit level: $LEVEL)…"
audit_out="$(pnpm audit --audit-level="$LEVEL" --ignore-registry-errors 2>&1)"
audit_status=$?

if [ "$audit_status" -eq 0 ]; then
  log "No high/critical advisories found."
  echo "No high/critical advisories were found. ✅" >> "$REPORT"
  echo "vulnerable=false" >> "$GITHUB_OUTPUT"
  echo "remaining=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

log "High/critical advisories found."
{
  echo "pnpm audit reported high/critical advisories:"
  echo
  echo '```'
  echo "$audit_out"
  echo '```'
  echo
} >> "$REPORT"
echo "vulnerable=true" >> "$GITHUB_OUTPUT"

log "Attempting fix with 'pnpm audit --fix update'…"
pnpm audit --fix update >/dev/null 2>&1 || true
pnpm install --no-frozen-lockfile >/dev/null 2>&1 || true

if ! pnpm audit --audit-level="$LEVEL" --ignore-registry-errors >/dev/null 2>&1; then
  log "Still vulnerable after the lockfile update; attempting 'pnpm audit --fix override'…"
  pnpm audit --fix override >/dev/null 2>&1 || true
  pnpm install --no-frozen-lockfile >/dev/null 2>&1 || true
fi

remaining_out="$(pnpm audit --audit-level="$LEVEL" --ignore-registry-errors 2>&1)"
if [ $? -eq 0 ]; then
  log "All high/critical advisories resolved."
  echo "All high/critical advisories were resolved by the automated fix. ✅" >> "$REPORT"
  echo "remaining=false" >> "$GITHUB_OUTPUT"
else
  log "Some high/critical advisories remain."
  {
    echo "Some high/critical advisories remain after the automated fix and need a manual look:"
    echo
    echo '```'
    echo "$remaining_out"
    echo '```'
  } >> "$REPORT"
  echo "remaining=true" >> "$GITHUB_OUTPUT"
fi

exit 0
