#!/bin/bash
# v1.4.1 Task 4.1 Scenario H verifier — happy path, no remote conflict.
#
# Replays the scrape.yml "Commit state changes" step body against a local
# bare remote at parity with local. Exit 0 on PASS.
#
# Usage: bash scripts/verify-rebase-retry-happy.sh

set -uo pipefail

TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

BARE="$TMPROOT/bare.git"
LOCAL="$TMPROOT/local"

# Setup: seed a repo with state/last-seen.json, mirror to bare, clone local.
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

# Scraper writes a new state file.
echo '{"foo":"updated"}' >state/last-seen.json

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
  if git push -q origin main; then
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

if [ "$SUCCESS_ITERATION" != "1" ]; then
  echo "FAIL: expected success on iteration 1, got '$SUCCESS_ITERATION'"
  exit 1
fi

# Assert: remote HEAD is now the updated-state commit, content matches.
cd "$BARE"
REMOTE_HEAD=$(git show -s --format=%s HEAD)
REMOTE_CONTENT=$(git show HEAD:state/last-seen.json)

if [ "$REMOTE_HEAD" != "chore: update last-seen state" ]; then
  echo "FAIL: remote HEAD subject is '$REMOTE_HEAD', expected 'chore: update last-seen state'"
  exit 1
fi
if [ "$REMOTE_CONTENT" != '{"foo":"updated"}' ]; then
  echo "FAIL: remote state content is '$REMOTE_CONTENT', expected '{\"foo\":\"updated\"}'"
  exit 1
fi

REMOTE_COMMIT_COUNT=$(git rev-list --count HEAD)
if [ "$REMOTE_COMMIT_COUNT" != "2" ]; then
  echo "FAIL: remote has $REMOTE_COMMIT_COUNT commits, expected 2 (seed + state update)"
  exit 1
fi

echo "PASS: Scenario H (happy path) — push succeeded on iteration 1, no spurious commits"
