#!/bin/bash
# Validates every generated scenario in tests/output/:
#  1. every .json file must parse (a malformed Contents.json makes actool silently
#     produce no Assets.car at all - worse than a missing file)
#  2. the whole catalogue must compile with actool, the same tool Xcode uses.
set -euo pipefail
cd "$(dirname "$0")/output"

shopt -s nullglob
scenarios=(*/)
if [ "${#scenarios[@]}" -eq 0 ]; then
  echo "FAIL: no scenarios found in tests/output - run 'npm run test:generate' first"
  exit 1
fi

actool_available=1
if ! command -v xcrun > /dev/null 2>&1; then
  actool_available=0
  echo "WARNING: xcrun not found - catalogs are JSON-linted only, actool compile is SKIPPED"
fi

status=0
for scenario in "${scenarios[@]}"; do
  scenario="${scenario%/}"
  ok=1

  while IFS= read -r -d '' json; do
    if ! python3 -m json.tool "$json" > /dev/null 2>&1; then
      echo "FAIL $scenario: invalid JSON in $json"
      ok=0
    fi
  done < <(find "$scenario" -name "*.json" -print0)

  if [ "$actool_available" -eq 1 ] && [ "$ok" -eq 1 ]; then
    compile_dir="$(mktemp -d)"
    if ! xcrun actool --compile "$compile_dir" "$scenario/Assets.xcassets" \
        --platform iphoneos --minimum-deployment-target 16.0 \
        --output-format human-readable-text --warnings --errors > "$compile_dir/actool.log" 2>&1; then
      echo "FAIL $scenario: actool compile failed"
      cat "$compile_dir/actool.log"
      ok=0
    elif grep -E "warning:|error:" "$compile_dir/actool.log" > /dev/null; then
      echo "FAIL $scenario: actool reported issues"
      grep -E "warning:|error:" "$compile_dir/actool.log"
      ok=0
    elif [ ! -f "$compile_dir/Assets.car" ]; then
      echo "FAIL $scenario: actool produced no Assets.car"
      ok=0
    fi
    rm -rf "$compile_dir"
  fi

  if [ "$ok" -eq 1 ]; then
    if [ "$actool_available" -eq 1 ]; then
      echo "PASS $scenario"
    else
      echo "PASS $scenario (JSON lint only)"
    fi
  else
    status=1
  fi
done

exit $status
