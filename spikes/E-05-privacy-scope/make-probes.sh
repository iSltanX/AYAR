#!/bin/zsh
# Create (or remove with --remove) the small probe projects used by E-04 and E-05.
emulate -L zsh
locations=(
  "$HOME/Documents/ayar-e05-probe"
  "$HOME/Desktop/ayar-e05-probe"
  "$HOME/Downloads/ayar-e05-probe"
  "$HOME/Library/Mobile Documents/com~apple~CloudDocs/ayar-e05-probe"
  "/Volumes/iSltanXx/ayar-e05-probe"
  "$HOME/Documents/ayar-e04-probe"
)
for d in $locations; do
  if [[ ${1:-} == --remove ]]; then rm -rf "$d"; print -r -- "removed $d"; continue; fi
  mkdir -p "$d/src" "$d/test"
  print -r -- '{ "name": "ayar-privacy-probe", "private": true, "scripts": { "test": "sh test/run.sh" } }' > "$d/package.json"
  print -r -- 'export const answer = 42;' > "$d/src/index.js"
  print -r -- 'export const name = "probe";' > "$d/src/name.js"
  # The "test" reads every source file and writes an output file, like a real test run would.
  print -r -- 'cat src/*.js > /dev/null && date > .ayar-probe-test-output && echo PROBE_TEST_OK' > "$d/test/run.sh"
  print -r -- "created $d"
done
