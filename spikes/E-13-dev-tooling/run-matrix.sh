#!/bin/zsh
# E-13 matrix: run every tool on a clean case (expect exit 0) and a deliberately broken case
# (expect non-zero), under one TypeScript configuration. Usage: ./run-matrix.sh <label> [tsc-path]
# TSGO=1 adds svelte-check --tsgo (TypeScript 7 diagnostics) to the matrix.
# Output: results/<label>/summary.tsv and one .txt per check (first 40 lines of output).
emulate -L zsh
setopt no_unset pipe_fail
zmodload zsh/datetime
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
cd "${0:A:h}"
label=$1
tsc=${2:-node_modules/.bin/tsc}
out=results/$label
rm -rf "$out"; mkdir -p "$out"
print -r -- $'check\texpect\texit\tverdict\tseconds' > "$out/summary.tsv"

check() { # name expect(0|fail) cmd...
  local name=$1 expect=$2; shift 2
  local start=$EPOCHREALTIME code verdict
  "$@" > "$out/$name.full" 2>&1
  code=$?
  head -40 "$out/$name.full" | sed "s#${PWD}/##g; s#${HOME}#~#g" > "$out/$name.txt"
  rm -f "$out/$name.full"
  if [[ $expect == 0 && $code == 0 ]] || [[ $expect == fail && $code != 0 ]]; then verdict=ok; else verdict=UNEXPECTED; fi
  printf '%s\t%s\t%s\t%s\t%.2f\n' $name $expect $code $verdict $(( EPOCHREALTIME - start )) >> "$out/summary.tsv"
}

{
  print -r -- "typescript (top-level): $(node -p 'require("typescript/package.json").version' 2>&1)"
  print -r -- "tsc used: $tsc -> $($tsc --version 2>&1)"
  print -r -- "svelte-check resolves: $(cd node_modules/svelte-check && node -p 'require.resolve("typescript")' 2>&1 | sed "s#${PWD:h:h}/##")"
} > "$out/versions.txt"

check tsc-engine            0    $tsc -p packages/engine
check tsc-engine-negative   fail $tsc -p packages/engine/tsconfig.negative.json
check svelte-check          0    node_modules/.bin/svelte-check --workspace apps/desktop --tsconfig ./tsconfig.json --fail-on-warnings
check svelte-check-negative fail node_modules/.bin/svelte-check --workspace negative-svelte --tsconfig ./tsconfig.json
if [[ -n ${TSGO:-} ]]; then
  check svelte-check-tsgo          0    node_modules/.bin/svelte-check --workspace apps/desktop --tsconfig ./tsconfig.json --fail-on-warnings --tsgo
  check svelte-check-tsgo-negative fail node_modules/.bin/svelte-check --workspace negative-svelte --tsconfig ./tsconfig.json --tsgo
fi
check eslint                0    node_modules/.bin/eslint .
check eslint-negative       fail sh -c 'cd negative-lint && ../node_modules/.bin/eslint .'
check vitest                0    node_modules/.bin/vitest run
check vitest-negative       fail node_modules/.bin/vitest run -c vitest.negative.config.ts
check node-test             0    node --test 'packages/engine/test/*.node.test.ts'
check node-test-negative    fail node --test packages/engine/negative/failing.node.test.ts
cat "$out/summary.tsv"
