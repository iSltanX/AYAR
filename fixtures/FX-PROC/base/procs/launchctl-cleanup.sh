#!/bin/sh
# يزيل وظيفة launchd التي سجلها launchctl-submit.sh. الاستخدام: sh procs/launchctl-cleanup.sh <ملف-الاسم>
[ -f "$1" ] || exit 0
label=$(cat "$1")
launchctl remove "$label" 2>/dev/null
rm -f "$1"
echo "removed $label"
