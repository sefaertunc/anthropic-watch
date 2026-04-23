#!/bin/bash
# v1.4.1 Task 4.1 Scenario C verifier — conflict path.
#
# Simulates scrape.yml's "Commit state changes" step when the remote has
# advanced with an independent state commit between local's scrape and local's
# commit. Without the fix, v1.4.0's retry loop got stuck on unresolved rebase
# state. With v1.4.1's stash-and-resync fix, iteration 2 should recover.
#
# Usage: bash scripts/verify-rebase-retry-conflict.sh

set -uo pipefail

TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

BARE="$TMPROOT/bare.git"
LOCAL="$TMPROOT/local"
OTHER="$TMPROOT/other"

# Setup: seed with state, mirror to bare, clone TWO local copies.
git init -q -b main "$LOCAL"
cd "$LOCAL"
git config user.email "test@example.com"
git config user.name "test"
mkdir -p state
echo '{"foo":"initial"}' >state/last-seen.json
git add state/last-seen.json
git commit -q -m "seed"
git clone -q --bare . "$BARE"
git remote add origin "$BARE"
git push -q origin main

git clone -q "$BARE" "$OTHER"
cd "$OTHER"
git config user.email "other@example.com"
git config user.name "other"

# "Other" (simulating a concurrent run) writes different state and pushes.
echo '{"foo":"other-ran-first"}' >state/last-seen.json
git add state/last-seen.json
git commit -q -m "chore: update last-seen state"
git push -q origin main

# Now "local" produces its own state update; its push will fail.
cd "$LOCAL"
echo '{"foo":"local-updated"}' >state/last-seen.json

# --- Replay the scrape.yml Commit-state-changes step body -------------------
if git diff --quiet -- state/last-seen.json; then
  echo "FAIL: expected a staged change"
  exit 1
fi
STATE_CONTENT=$(cat state/last-seen.json)
git add state/last-seen.json
git commit -q -m "chore: update last-seen state"
SUCCESS_ITERATION=""
for i in 1 2 3; do
  if git push -q origin main 2>/dev/null; then
    SUCCESS_ITERATION="$i"
    break
  fi
  git rebase --abort 2>/dev/null || true
  git fetch -q origin main
  git reset --hard -q origin/main
  printf '%s' "$STATE_CONTENT" >state/last-seen.json
  if git diff --quiet -- state/last-seen.json; then
    echo "already-synced on iteration $i"
    SUCCESS_ITERATION="$i"
    break
  fi
  git add state/last-seen.json
  git commit -q -m "chore: update last-seen state"
  sleep 1
done
# ----------------------------------------------------------------------------

if [ -z "$SUCCESS_ITERATION" ]; then
  echo "FAIL: retry loop exhausted without success (the v1.4.0 bug)"
  exit 1
fi

if [ "$SUCCESS_ITERATION" = "1" ]; then
  echo "FAIL: iteration 1 should have conflicted, not succeeded — scenario setup wrong"
  exit 1
fi

# Assert: remote contains all three commits (seed + other + local).
cd "$BARE"
REMOTE_COMMIT_COUNT=$(git rev-list --count HEAD)
if [ "$REMOTE_COMMIT_COUNT" != "3" ]; then
  echo "FAIL: remote has $REMOTE_COMMIT_COUNT commits, expected 3 (seed + other + local)"
  exit 1
fi

# Assert: final state on remote is local's version (scraper-latest-wins).
REMOTE_CONTENT=$(git show HEAD:state/last-seen.json)
if [ "$REMOTE_CONTENT" != '{"foo":"local-updated"}' ]; then
  echo "FAIL: remote state is '$REMOTE_CONTENT', expected '{\"foo\":\"local-updated\"}'"
  exit 1
fi

echo "PASS: Scenario C (conflict path) — recovered on iteration $SUCCESS_ITERATION, remote has $REMOTE_COMMIT_COUNT commits, local-latest wins"
