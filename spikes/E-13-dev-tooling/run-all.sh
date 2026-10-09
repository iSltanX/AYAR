#!/bin/zsh
# E-13: install each TypeScript configuration in turn and run the matrix on it.
# Leaves the side-by-side configuration (the recommended one) installed at the end.
emulate -L zsh
setopt err_exit
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
cd "${0:A:h}"
npm=/opt/homebrew/bin/npm

# 1) TypeScript 6 only
$npm uninstall --save-dev @typescript/native > /dev/null 2>&1 || true
$npm install --save-exact --save-dev typescript@6.0.3 > results/install-ts6.txt 2>&1
./run-matrix.sh ts6

# 2) TypeScript 7 only (npm warns ERESOLVE: svelte-check and typescript-eslint peers)
$npm install --save-exact --save-dev typescript@7.0.2 > results/install-ts7.txt 2>&1
./run-matrix.sh ts7

# 3) Side by side: `typescript` = 6 for tool APIs, `@typescript/native` = 7 for tsc and --tsgo
$npm install --save-exact --save-dev typescript@6.0.3 "@typescript/native@npm:typescript@7.0.2" > results/install-hybrid.txt 2>&1
TSGO=1 ./run-matrix.sh hybrid node_modules/@typescript/native/bin/tsc
rm -rf apps/desktop/.svelte-check negative-svelte/.svelte-check
sed -i '' "s#${HOME}#~#g" results/install-*.txt
