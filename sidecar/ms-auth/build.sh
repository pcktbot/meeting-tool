#!/usr/bin/env bash
set -euo pipefail

# Tauri resolves sidecars as binaries/ms-auth-<target-triple>. Derive the triple
# from the Rust host so it matches what `tauri build` expects.
TRIPLE="$(rustc -Vv | sed -n 's/^host: //p')"
OUT_DIR="../../src-tauri/binaries"
OUT="${OUT_DIR}/ms-auth-${TRIPLE}"

mkdir -p "$OUT_DIR"
bun build ./src/index.ts --compile --outfile "$OUT"
echo "Built $OUT"
