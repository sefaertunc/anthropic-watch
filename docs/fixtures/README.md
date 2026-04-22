# Reference Fixtures

These fixtures are reference samples of the v1.2.0 feed envelope, suitable for pinning consumer contract tests against. Regenerated each release. See `docs/FEED-SCHEMA.md` for the schema these conform to.

## all.sample.json

- Captured: 2026-04-22
- Pipeline version: 1.2.0
- Source: live fresh-state run via `runPipeline({stateDir, feedsDir})` against a temporary `$FIXTURE_DIR`
- Items: 10 trimmed from the captured 100; `itemCount` updated to 10 to match
- Notes: items are live; no hand-edits. Trimming preserves the newest items (date-desc sort order).

## run-report.sample.json

- Captured: 2026-04-22
- Pipeline version: 1.2.0
- Source: same run as `all.sample.json`
- Not trimmed — the run-report reflects all 17 sources as of capture time.
- Notes: no hand-edits; verbatim output of the sandboxed run.

## Regeneration

To regenerate:

```bash
FIXTURE_DIR=$(mktemp -d)
node --input-type=module -e "
  import('./src/index.js')
    .then(m => m.runPipeline({ stateDir: '$FIXTURE_DIR/state', feedsDir: '$FIXTURE_DIR/feeds' }))
    .catch(e => { console.error(e); process.exit(1); });
"
cp "$FIXTURE_DIR/feeds/run-report.json" docs/fixtures/run-report.sample.json
# Trim all.json to ~10 items and update itemCount, then write to docs/fixtures/all.sample.json.
```

Update this README with the new capture date and any notes.
