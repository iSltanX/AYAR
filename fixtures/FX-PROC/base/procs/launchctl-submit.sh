#!/bin/sh
# يسجل وظيفة launchd في نطاق المستخدم تنام 10 دقائق، خارج شجرة العمليات كليًّا.
# تحذير: يُشغَّل في اختبار الأدوات فقط، ويجب تنظيف الوظيفة بعده: sh procs/launchctl-cleanup.sh <ملف-الاسم>
# الاستخدام: sh procs/launchctl-submit.sh <ملف-يُكتب-فيه-اسم-الوظيفة>
label="ayar.fx.proc.$$.$(date +%s)"
echo "$label" > "$1"
launchctl submit -l "$label" -- /bin/sleep 600
