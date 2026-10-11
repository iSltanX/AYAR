#!/bin/sh
# Plan 25: the build and its signature are repeatable from a clean repository with the lock file. Clones the given
# commit into a temporary folder, installs from package-lock.json (npm ci), packages with the same identity, and
# compares the result with a reference package: the file list, the asar's hash (what AYAR ships), the engine, preload
# and renderer bundles inside it, and the code directory hash (cdhash) of every Mach-O the build produces. The CMS
# signature blob carries its signing time, so the signature bytes differ by design; the cdhash is what the system
# verifies, and it must not.
#
#   sh tools/packaging/reproduce.sh <repo> <commit> <reference .app> <report.json> [identity]
#
# Needs network for npm ci (the Electron binary comes from npm's cache when present). The clone is removed at the
# end; its size is printed for the cleanup record (AGENTS.md 10).
set -eu
REPO="$1"; COMMIT="$2"; REF_APP="$3"; REPORT="$4"; IDENTITY="${5:-AYAR Local Code Signing}"
NODE=/opt/homebrew/bin/node
NPM=/opt/homebrew/bin/npm
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
CLONE="$(mktemp -d "${TMPDIR:-/tmp}/ayar-DEV-13-reproduce-XXXXXX")"
trap 'rm -rf "$CLONE"' EXIT
git clone --quiet --no-local "$REPO" "$CLONE/repo"
git -C "$CLONE/repo" checkout --quiet "$COMMIT"
( cd "$CLONE/repo" && "$NPM" ci --no-audit --no-fund >"$CLONE/npm-ci.log" 2>&1 )
( cd "$CLONE/repo/apps/desktop" && AYAR_SIGN_IDENTITY="$IDENTITY" "$NPM" run package >"$CLONE/package.log" 2>&1 )
NEW_APP="$CLONE/repo/apps/desktop/out/AYAR-darwin-arm64/AYAR.app"
SIZE="$(du -sh "$CLONE" | cut -f1)"
"$NODE" "$(dirname "$0")/compare-packages.mjs" --a "$REF_APP" --b "$NEW_APP" --json "$REPORT" --note "clone of $COMMIT, npm ci, npm run package; clone size $SIZE, removed"
