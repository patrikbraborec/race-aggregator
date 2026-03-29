#!/bin/bash
# Push all actors to Apify, bundling shared code into each actor
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_DIR="$SCRIPT_DIR/shared"

ACTORS=(
  actor-behej
  actor-behejbrno
  actor-bezeckyzavod
  actor-ceskybeh
  actor-runczech
  actor-svetbehu
  actor-finishers
  actor-dedup
  actor-enricher
  actor-orchestrator
)

for actor in "${ACTORS[@]}"; do
  ACTOR_DIR="$SCRIPT_DIR/$actor"
  echo ""
  echo "========== Pushing $actor =========="

  # Copy shared into actor dir (skip for orchestrator which doesn't use it)
  if grep -q '@race-aggregator/shared' "$ACTOR_DIR/package.json" 2>/dev/null; then
    rm -rf "$ACTOR_DIR/shared"
    cp -r "$SHARED_DIR" "$ACTOR_DIR/shared"
  fi

  # Push
  (cd "$ACTOR_DIR" && apify push 2>&1) || echo "WARN: $actor push failed"

  # Cleanup shared copy
  rm -rf "$ACTOR_DIR/shared"
done

echo ""
echo "========== All done =========="
