#!/usr/bin/env bash
# Download and build Potree (develop branch) into frontend/public/potree/
# so the Vite dev server can serve it at /potree/.
#
# Run once before `npm run dev` in the frontend/ directory.
# Safe to re-run: skipped if Potree is already present.

set -euo pipefail
cd "$(dirname "$0")/.."

DEST="frontend/public/potree"

if [ -d "$DEST/build/potree" ]; then
    echo "Potree already set up at $DEST — skipping."
    exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Cloning Potree develop branch (shallow)..."
git clone --depth 1 -b develop https://github.com/potree/potree.git "$TMP/potree"

cd "$TMP/potree"

if [ ! -f "build/potree/potree.js" ]; then
    echo "Pre-built files not found — building Potree (this takes a minute)..."
    npm install
    npm run build
fi

echo "Copying files to $DEST..."
REPO_ROOT="$(git -C "$OLDPWD" rev-parse --show-toplevel)"
mkdir -p "$REPO_ROOT/$DEST/build"
cp -r build/potree "$REPO_ROOT/$DEST/build/potree"
cp -r libs         "$REPO_ROOT/$DEST/libs"

echo "Done. Potree is ready at $DEST/"
