#!/bin/sh
# AT-31 in a monitored network: the test inside the sandbox (at31-network.sb) while every process is sampled from
# outside it (pid, parent, group, command), then — outside the sandbox, where the kernel's log can be read — every
# refused connection named by its process (at31-refusals.mjs). Exit 0 only if the test passed and nothing of AYAR's
# was refused. Run from the repository's root; AYAR_KEEP_TMP=1 keeps the test's and the reader's folders.
set -u
DIR=$(cd "$(dirname "$0")" && pwd)
CHECK=$(mktemp -d -t ayar-DEV-7-at31-check)
STOP="$CHECK/stop"
( while [ ! -f "$STOP" ]; do /bin/ps -ax -o pid=,ppid=,pgid=,command= >> "$CHECK/ps.txt"; echo "----" >> "$CHECK/ps.txt"; /bin/sleep 0.1; done ) &
/usr/bin/sandbox-exec -f "$DIR/at31-network.sb" /usr/bin/env AYAR_AT31=1 AYAR_AT31_DIR="$CHECK" ${AYAR_KEEP_TMP:+AYAR_KEEP_TMP=1} PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$HOME" TMPDIR="$TMPDIR" ./node_modules/.bin/vitest run --project engine test/at31.test.ts --reporter=verbose
STATUS=$?
touch "$STOP"
wait
/opt/homebrew/bin/node "$DIR/at31-refusals.mjs" "$CHECK"
REFUSED=$?
if [ -n "${AYAR_KEEP_TMP:-}" ]; then echo "$CHECK"; else rm -r "$CHECK"; fi
[ $STATUS -eq 0 ] && [ $REFUSED -eq 0 ]
