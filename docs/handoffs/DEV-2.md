---
id: DEV-2
status: delivered
branch: phase/DEV-2
base: 403f19c
head: e8ad6b3
delivered: 2026-10-10
model: Claude Fable 5.1 · جهد xhigh
approval: —
---

# تسليم DEV-2 — التحقق السابق للبناء: الأدوات والعمليات والمستودعات

## ما أُنجز

القرارات الثلاثة عشر المعلقة على البيئة (E-07 وE-08 وE-09 وE-10 وE-11 وE-12 وE-15 وE-16 وE-17 وE-20 وE-21 وE-22 وE-24) **محسومة كلها بالدليل**، وقيودها في [docs/tracking/env-decisions.md](../tracking/env-decisions.md) (الجدول والقسم 3)، ولكل تجربة مجلد `spikes/E-xx-*/` فيه README بالمعيار والإعادة والنتائج والقرار، وسكربتاتها ونتائجها الخام. ومكتبة مشتركة `spikes/_lib-dev2/lib.mjs` (مسار الأدوات، ومشغّل يقتل مجموعة العمليات، ولقطة الحالة، والتركيب المؤقت، وgit مزيف).

- **المهمة 1 — التنزيلات:** [spikes/DEV-2-downloads.md](../../spikes/DEV-2-downloads.md) بالإصدارات المثبتة والبصمات والمواضع خارج المستودع.
- **المهمة 2 — E-07:** جرد جهاز المالك، وshims (corepack وpnpm عبر corepack وnvm وmise) ومنع التثبيت التلقائي، وأعلام `uv run`/`poetry run`، و**جدول رموز الخروج الفعلية** بأعلام C-15 لستة عشر محولًا على 72 نسخة ([spikes/E-07-toolchains/results/exit-codes.md](../../spikes/E-07-toolchains/results/exit-codes.md))، وG-35.
- **المهمة 3 — E-09:** قاعدتا OSV منزَّلتان ومقاستان، و**القاعدة المصغرة** `fixtures/tools/osv-mini-db/` (سجلان مصطنعان وكاتب ZIP بلا تبعيات)، وإكمال `sec.deps` في FX-ADAPTERS وFX-EXT وFX-PY وإعادة توليد `fixtures/SANITY.md` (لا صف ينتظر E-09) و`validate.mjs` ناجح.
- **المهمة 4 — E-08:** Betterleaks 1.9.0 مقابل Gitleaks 8.30.1 بتوقيعات متحقق منها ومدونة عربية مولَّدة؛ المختار Betterleaks.
- **المهمة 5 — E-10:** Semgrep مُدار ببصمات، واستدعاء من مجلد محايد بقوائم مقسمة وgit بديل؛ يحسم G-DEV1-01.
- **المهمة 6 — E-12:** الأعلام الثلاثة تعطي صفر كتابة؛ `CI` لا يكفي لـ Playwright.
- **المهمة 7 — E-11:** playwright-core داخل `utilityProcess` يعمل خفيًّا وظاهرًا مع FX-EXT، وaxe، ولقطات ثابتة؛ الخفي معتمد.
- **المهمة 8 — E-21:** قياس المسبار معتمد بتقييد المعالج 4× ووسيط خمسة تكرارات (FCP وLCP وload والمهام ضمن ±10%؛ بلا تقييد لا يتكرر على صفحة محلية خفيفة)، وLighthouse 13.5.0 محول اختياري مُدار (ثابت، 10 ث/تشغيل، 177 م.ب).
- **المهمة 9 — E-22:** المسح بالعلامة عبر `KERN_PROCARGS2` وحدوده، وقاعدة رصد مصفاة، والتنظيف نظيف (لا بقايا ولا launchd).
- **المهمة 10 — E-24:** المستودع الظلي يعطي النتائج نفسها بصفر علامات؛ `sec.secrets.history` يبقى في الإصدار الأول وAT-42 كما هو.
- **المهمة 11 — E-16:** قارئ Git من الملفات يطابق git في 11 حالة ويقرأ مستودعات المالك دون git.
- **المهمة 12 — E-20:** الأدوات المُدارة العشر تعمل دون تعديل ولا حجر؛ التوقيعات موثقة.
- **المهمة 13 — E-15:** اكتشاف Rasd وTars وWasl للقراءة فقط (0 ملف تغيّر) و11 فرقًا موثقًا لـ DEV-4.
- **المهمة 14 — E-17:** على جهاز المالك Xcode وحده؛ القوالب الأربعة بمراجعها، وجُرّب `xed --line` و`open` فعليًّا وVS Code 1.141.0 منزَّلًا خارج المستودع (`--goto` يعمل)؛ و`open` لملف `.ts` يفتح QuickTime فالافتراضي `open -t` للنص (G-DEV2-02، D-DEV2-05).

## الفحوص

كل فحص شُغّل فعلًا بأمره الحرفي (الأوامر بـ `N=~/.nvm/versions/node/v24.16.0/bin/node` من جذر المستودع).

| الفحص | الأمر | النتيجة | التاريخ |
|---|---|---|---|
| بصمات الخطة | `cd docs/plan && shasum -a 256 -c CHECKSUMS.sha256` | نجح (الملفات الخمسة OK) | 2026-10-10 |
| E-07 الجرد وshims وPython والمحولات وnode:test وحجب البيئة | `$N spikes/E-07-toolchains/{inventory,shims,python-runners,adapters,node-test-reporters,env-mask}.mjs` | نجح: 72 صفًّا في `exit-codes.md`، وكل النتائج في `results/` | 2026-10-10 |
| E-09 تنزيل القاعدة والفحص دون اتصال | `$N spikes/E-09-osv-offline/download-db.mjs` | نجح: 254 م.ب في 26.5 ث، وفحص 6 ث بلا اتصال (وكيل وهمي) | 2026-10-10 |
| E-09 القاعدة المصغرة على النسخ الست | `$N spikes/E-09-osv-offline/mini-db.mjs` | نجح: المعيبة الثلاث رمز 1 بمعرّف الثغرة، والسليمة الثلاث 0 | 2026-10-10 |
| سلامة مشاريع الاختبار بعد إكمال `sec.deps` | `$N fixtures/tools/sanity.mjs run FX-ADAPTERS good:osv osv--bad osv--no-lockfiles osv--config-error` و`run FX-EXT good vuln-dep` و`run FX-PY good vuln-dep` ثم `report` | نجح: كل الصفوف ✓، ولا «ينتظر E-09» في SANITY.md | 2026-10-10 |
| ملفات التوقع | `$N fixtures/tools/validate.mjs` | نجح: 123 ملف توقع في 10 مشاريع | 2026-10-10 |
| E-08 التنزيلات والتوقيعات | `sh spikes/E-08-secret-scanner/download.sh` | نجح: البصمات الثلاث OK، وsigstore «Verified OK» لـ Betterleaks مع ضابط سلبي فاشل كما يجب | 2026-10-10 |
| E-08 المقارنة | `$N spikes/E-08-secret-scanner/run.mjs` | نجح: كشف متطابق للمزروع، 0/1 إنذار على المدونة، 3.6/1.5 ث على 50 ألف ملف | 2026-10-10 |
| E-10 التجهيز والأهداف وتتبع git على FX-MALICIOUS | `$N spikes/E-10-semgrep/run.mjs` | نجح: صفر استدعاء git داخل المستودع من مجلد محايد، وصفر علامات | 2026-10-10 |
| E-12 اللقطات | `$N spikes/E-12-snapshot-guard/run.mjs` | نجح: صفر كتابة بالأعلام الثلاثة، وكتابة فعلية دونها | 2026-10-10 |
| E-11 المسبار في utilityProcess | `$N spikes/E-11-probe-host/run.mjs` | نجح: الوضعان بلا أخطاء، وaxe 0، ولقطات متطابقة (3×2)، وخفي/ظاهر 0.74% فرق | 2026-10-10 |
| E-21 قياس الأداء | `$N spikes/E-21-web-perf/run.mjs` | نجح: المسبار بتقييد 4× ضمن ±10% للمقاييس المعتمدة (FCP/LCP 8.2%، load 3.5%، TaskDuration 6.3%)، وLighthouse 5 تشغيلات (الدرجة 99.2 ± 0.4، FCP 3.9%) | 2026-10-10 |
| E-22 العمليات والتنظيف | `$N spikes/E-22-process-escape/run.mjs` | نجح: الخمسة مرصودة/منهاة كما في README، والفحص النهائي `leftovers=0 labels=0` | 2026-10-10 |
| بعد E-22: لا بقايا | `launchctl list` ثم `ps -axo pid,comm` مع تصفية الأسماء ayar وsleeper وdouble_fork وignore-sigterm (داخل السكربت وبعده يدويًّا) | نجح: لا وظيفة launchd ولا عملية باقية | 2026-10-10 |
| E-24 الظلي مقابل النظيف والضابط الإيجابي | `$N spikes/E-24-git-history-shadow/run.mjs` | نجح: `sameFindings=true` للفاحصين، وصفر علامات على المحمي، والضابط كتب `textconv.marker` | 2026-10-10 |
| تتبع العمليات على FX-MALICIOUS أثناء E-10 وE-24 | ضمن السكربتين (git مزيف/مغلّف أول PATH + عدّ العلامات + لقطة حالة المستودع) | نجح: 0 استدعاء git على المستودع، 0 ملفات علامة، 0 كتابة | 2026-10-10 |
| E-16 القارئ | `$N spikes/E-16-git-from-files/run.mjs` | نجح: 11 مطابقة مع git، ومستودعات المالك بصفر تغيير في `.git` | 2026-10-10 |
| E-20 الحجر والتوقيع | `$N spikes/E-20-gatekeeper/run.mjs` | نجح: الأدوات العشر تعمل، ولا حجر | 2026-10-10 |
| E-15 الاكتشاف للقراءة فقط | `$N spikes/E-15-owner-projects/discover.mjs` | نجح: 0 ملف تغيّر من 109,377 في المشاريع الثلاثة، ولا `.ayar/` | 2026-10-10 |
| E-17 المحرر | `$N spikes/E-17-editor/run.mjs` | نجح: الكشف والافتراضيات، و`xed -l` خرج 0 وأطلق Xcode، و`open -g` خرج 0، وVS Code `--goto` خرج 0 ثم أُغلقت النسخة المؤقتة (0 عملية باقية) | 2026-10-10 |

**لم يُشغَّل:** لا شيء من فحوص المرحلة. (التحقق البصري لتحديد السطر في Xcode يحتاج الشاشة؛ انظر «قرارات المالك واعتماده».)

## اختبارات القبول

| الاختبار | الحالة الجديدة في traceability.md | الدليل |
|---|---|---|
| AT-01 | جزئي: DEV-2 (Semgrep وفاحص الأسرار لا يستدعيان git على FX-MALICIOUS بالاستدعاء المعتمد؛ G-DEV1-01 محسوم) | `spikes/E-10-semgrep/results/run.json`، `spikes/E-08-secret-scanner/results/compare.json` |
| AT-11 | جزئي: DEV-2 (الخمسة في FX-PROC: ما يُنهى وما يُرصد بالملاحظة؛ التصعيد) | `spikes/E-22-process-escape/results/run.json` |
| AT-14 | جزئي: DEV-2 (رموز الخروج الفعلية بأعلام C-15 لكل صف) | `spikes/E-07-toolchains/results/exit-codes.md` |
| AT-16 | جزئي: DEV-2 (`sec.deps` بقاعدة OSV المصغرة في FX-EXT وFX-PY وFX-ADAPTERS) | `fixtures/SANITY.md` |
| AT-20 | جزئي: DEV-2 (التحميل والوضع الخفي وعامل الخدمة وaxe على FX-EXT السليمة؛ الوضع مسجل) | `spikes/E-11-probe-host/results/run.json` |
| AT-31 | جزئي: DEV-2 (`COREPACK_ENABLE_NETWORK=0` ومتغيرات mise؛ OSV وSemgrep دون اتصال مثبتان بوكيل وهمي) | `spikes/E-07-toolchains/results/shims.json`، `spikes/E-09-osv-offline/results/` |
| AT-35 | جزئي: DEV-2 (البصمات وsigstore وDeveloper ID لكل أداة مُدارة) | `spikes/E-08-secret-scanner/results/download.txt`، `spikes/E-20-gatekeeper/results/run.json` |
| AT-42 | جزئي: DEV-2 (المستودع الظلي: الاكتشاف نفسه وصفر علامات وكل git يشير إلى الظلي) | `spikes/E-24-git-history-shadow/results/run.json` |

## القرارات

لا قرار يغيّر نص الخطة: كل الثلاثة عشر حُسمت بالفرع الأول من معيارها أو بمعيارها نفسه. والقرارات التنفيذية بتفاصيلها في `env-decisions.md`. ويُسجَّل ما يلي لأنه يحدد تنفيذًا تركته الخطة مفتوحًا:

| المعرّف | القرار | السبب ودليله | ما يتغير في الخطة | التاريخ | من قرره |
|---|---|---|---|---|---|
| D-DEV2-01 | **استدعاء Semgrep:** من مجلد عمل محايد (مجلد المثيل المؤقت) بقوائم ملفات مطلقة من جرد عِيَار مقسمة ≤ 512 كيلوبايت من الوسائط مع دمج تقارير الدفعات، و`git` بديل أول PATH يفشل فورًا، و`HOME`/`SEMGREP_SETTINGS_FILE` إلى المجلد المؤقت | E-10: Semgrep 1.180.0 يستدعي `git ls-remote --get-url` من مجلد العمل مهما كانت الأعلام ويكمل إن فشل؛ القائمة الصريحة تتجاوز ARG_MAX عند نحو 9 آلاف مسار | يكمل صف Semgrep في C-15 («طريقة تمريرها تُحسم في E-10»)؛ يحسم G-DEV1-01 | 2026-10-10 | المنفّذ بمعيار الخطة |
| D-DEV2-02 | **المسبار بالوضع الخفي**، والوضع جزء من مفتاح الصورة المرجعية (مع المنصة وإصدار المتصفح والكثافة) | E-11: الخفي يختلف عن الظاهر بـ 0.74% من البكسلات (تنعيم النص) فوق عتبة 0.1% مع تطابق بنيوي | يكمل C-14 (مفتاح المقارنة) وAT-20 (الوضع المسجل) | 2026-10-10 | المنفّذ بمعيار الخطة |
| D-DEV2-03 | **قاعدة رصد الإفلات:** عملية جديدة للمستخدم أبوها launchd ظهرت أثناء الفحص وملفها التنفيذي خارج `/System/` و`/usr/libexec/` و`/Library/Apple/` و`/Library/Application Support/`، أو وظيفة launchd جديدة في نطاق المستخدم ليست `com.apple.*` → ملاحظة «تعذّر التحقق من إنهاء كل العمليات» وعرض الإنهاء بتأكيد | E-22: السيناريوهات الخمسة تُرصد بها، والعمليات النظامية العابرة الست لا تُرصد، وضجيج الخمول صفر | يحدد «ما يحدده E-22» في C-12 البند 8 و17 | 2026-10-10 | المنفّذ بمعيار الخطة |
| D-DEV2-04 | **التحقق من الأدوات المُدارة:** البصمة المثبتة لكل ملف، ثم sigstore (Betterleaks) أو Developer ID بمعرّف الفريق المثبت في الكتالوج (mise وuv) حيث يتاح؛ لا يُزال الحجر إلا عن ملف نزّله عِيَار وتحقق منه؛ `spctl` ليس معيارًا | E-20: التنزيل البرمجي لا يضع حجرًا؛ `spctl` يرفض كل ثنائي سطر أوامر غير موزع؛ uv 0.13.0 موقّع بفريق «OpenAI OpCo, LLC» | يكمل C-11 («التحقق من التوقيع حيث يتاح») | 2026-10-10 | المنفّذ بمعيار الخطة |
| D-DEV2-05 | **«افتح في المحرر»:** القوالب الأربعة (`xed --line <N> <file>`، و`code --goto <file>:<line>:<col>`، و`cursor --goto …`، و`zed <file>:<line>:<col>`) تُعرض لما يُكتشف بمعرّف الحزمة أو أمر سطر الأوامر ويختار المستخدم؛ والافتراضي **`open -t`** للملفات النصية (بلا سطر) و`open` لغيرها | E-17 | يكمل مدخل E-17 | 2026-10-10 | المنفّذ بمعيار الخطة |

## التعارضات والنواقص الجديدة

| المعرّف | الموضوع | المصدر | الحسم | الحالة |
|---|---|---|---|---|
| G-DEV2-01 | `pnpm` المثبت في nvm هو shim من corepack (`corepack/dist/pnpm.js`)، فداخل مشروع يعلن `packageManager` مختلفًا ينزّل النسخة المعلنة صامتًا ما لم يُضبط `COREPACK_ENABLE_NETWORK=0`؛ و`manage-package-manager-versions` لا أثر له | E-07 (`shims.json`) | C-07 يكشف pnpm عبر corepack بالرابط الحقيقي ويضبط المتغير في كل فحص إصدار؛ `packageManager` المختلف «يحتاج تجهيزًا» | قرار تنفيذ لـ DEV-4 |
| G-DEV2-02 | `open <file.ts>` يفتح QuickTime Player (امتداد `.ts` يعني MPEG-TS في LaunchServices على جهاز المالك)، فالقالب الافتراضي `open` لا يصلح لكل الامتدادات | E-17 | الافتراضي `open -t` للملفات النصية (D-DEV2-05) | قرار تنفيذ لـ DEV-11 |
| G-DEV2-03 | حجب المتغيرات بأنماط C-18 (`AUTH`) يخفي `SSH_AUTH_SOCK` فيكسر ssh-agent داخل الفحوص (G-35 مثبت) | E-07 (`env-mask.json`) | استثناء صريح لـ `SSH_AUTH_SOCK` مع عرضه في الاعتماد، والأنماط على حدود الكلمات | قرار تنفيذ لـ DEV-4 (C-18) |
| G-DEV2-04 | الحفيد العنيد في `FX-PROC/sigterm-grandchild` يتجاهل SIGTERM فقط؛ SIGINT (أول التصعيد) ينهيه، فلا يُختبر التصعيد حتى SIGKILL | E-22 | يُقترح أن يتجاهل SIGINT أيضًا (تعديل صغير في `fixtures/FX-PROC/base/procs/ignore-sigterm.mjs`) عند الحاجة في DEV-5/AT-11 | اقتراح |
| G-DEV2-05 | إصدار الحزمة في تقرير OSV قد يكون نصًّا غير دلالي (`file:vendor/ayar-vuln-fake`) لتبعيات `file:` من pnpm | E-09 | مرساة بصمة اكتشاف التبعية تحتمل أي نص إصدار | ملاحظة لـ DEV-6 |

## حسم بنود قائمة

| البند | الحسم | الدليل |
|---|---|---|
| E-07 إلى E-12 وE-15 وE-16 وE-17 وE-20 إلى E-22 وE-24 | محسومة كلها (الجدول والقسم 3 في `env-decisions.md`) | `spikes/E-xx-*/README.md` |
| G-DEV1-01 (Semgrep يستدعي git من مجلد العمل) | حُسم: مجلد محايد + أهداف مطلقة + git بديل أول PATH (D-DEV2-01) | `spikes/E-10-semgrep/results/run.json` |
| G-DEV1-03 (OSV يعطي 128 لملف قفل تالف) | مؤكد، ويُضاف 127 لغياب القاعدة؛ التمييز بالنص | `spikes/E-07-toolchains/results/exit-codes.md` |
| G-35 (أنماط المتغيرات الحساسة تحجب SSH_AUTH_SOCK) | مثبت بالتجربة؛ الحل في G-DEV2-03 | `spikes/E-07-toolchains/results/env-mask.json` |
| G-46 (AT-01: Semgrep لا يستدعي git على FX-MALICIOUS) | مثبت بالاستدعاء المعتمد (0 استدعاء داخل المستودع) | `spikes/E-10-semgrep/results/run.json` |
| A-05 (الإضافات في الوضع الخفي) | مؤيَّد بالتجربة | `spikes/E-11-probe-host/` |
| A-07 (Betterleaks مرشح أول) | مؤيَّد بالتجربة | `spikes/E-08-secret-scanner/` |
| A-08 (قاعدة OSV دون اتصال بإجراء تجهيز صريح) | مؤيَّد | `spikes/E-09-osv-offline/` |
| `pending: E-09` في ملفات التوقع الستة | أُزيلت، و`sec.deps` تشغيل فعلي في SANITY.md | `fixtures/` |

## العوائق

لا شيء.

## قرارات المالك واعتماده

- **معطيات سلفًا:** E-15 (المشاريع الثلاثة للقراءة فقط) وE-17 (الافتراضي `open` والقوالب الأربعة) محسومان بتفويض المالك في `403f19c`، ونُفّذا كما نصّا.
- **ما يحتاج يد المالك (اختياري، لا يوقف الإغلاق):** تحقق بصري من تحديد السطر في «افتح في المحرر» (E-17): 3 خطوات في نحو دقيقتين بالتحكم بالشاشة أو بنظرة المالك نفسه (Xcode مفتوح الآن على `sample.ts` في مجلد مؤقت: هل السطر 3 محدد؟ وهل فُتح `sample.md` في Katib؟ وVS Code المؤقت أُغلق فتُعاد تجربته إن أُريد). الخروج 0 وإطلاق التطبيقات مثبتان دون الشاشة، فالقرار لا يتوقف على هذا التحقق. ولا يُفترض أن «Enable computer use» مفعّل.

## التبعيات المضافة

لا شيء في `package.json` الجذري. (ما أُضيف: pngjs 7.0.0 وpixelmatch 8.0.0 إلى صندوق DEV-1 خارج المستودع `~/.cache/ayar-fixtures-toolchain/node` لمقارنة لقطات E-11؛ و`spikes/E-01-electron-forge/forge.config.js` سطر واحد لتسجيل وضع e11.)

## التنزيلات

كلها بإصدارات مثبتة من مصادرها الرسمية دون استئذان (ORG-09)، خارج المستودع، والتفصيل في [spikes/DEV-2-downloads.md](../../spikes/DEV-2-downloads.md):

| الاسم والإصدار | المصدر | المكان | الحجم التقريبي |
|---|---|---|---|
| Betterleaks 1.9.0 (SHA-256 `83dd7eaa…` + sigstore متحقق) | GitHub Releases betterleaks/betterleaks | `~/.cache/ayar-dev2/betterleaks` | 31 م.ب |
| cosign 3.1.3 (SHA-256 `5cf948c2…`) | GitHub Releases sigstore/cosign | `~/.cache/ayar-dev2/cosign` | 266 م.ب |
| Gitleaks 8.30.1 نسخة مُدارة (SHA-256 `b40ab0ae…`) | GitHub Releases gitleaks/gitleaks | `~/.cache/ayar-dev2/gitleaks` | 28 م.ب |
| قاعدتا OSV npm (SHA-256 `802734dd…`) وPyPI (`ef5b682c…`) | osv-vulnerabilities.storage.googleapis.com عبر osv-scanner | `~/.cache/ayar-dev2/osv-db` | 242 م.ب |
| mise v2026.10.7 (SHA-256 `5841e5ab…` من SHASUMS256.txt) | GitHub Releases jdx/mise | `~/.cache/ayar-dev2/mise` | 164 م.ب |
| Poetry 2.5.1 (pip في بيئة معزولة) | PyPI | `~/.cache/ayar-dev2/poetry-venv` | 61 م.ب |
| Semgrep 1.180.0 بيئة قياس (uv، 915 بصمة) | PyPI | `~/.cache/ayar-dev2/semgrep-venv` (+ ذاكرة uv 109 م.ب) | 252 م.ب |
| Lighthouse 13.5.0 وتبعياتها | npm | `~/.cache/ayar-dev2/lighthouse` | 173 م.ب |
| pngjs 7.0.0 وpixelmatch 8.0.0 | npm | `~/.cache/ayar-fixtures-toolchain/node` | أقل من 1 م.ب |
| Electron 44.7.0 وForge 8.0.1 (npm ci للتطبيق المشترك؛ الثنائي من ذاكرة Electron ببصمته) | npm وذاكرة `~/Library/Caches/electron` | `spikes/E-01-electron-forge/node_modules` (مستثنى من Git) | 373 م.ب |
| VS Code 1.141.0 (`VSCode-darwin-arm64.zip`) (SHA-256 `9b4ae386…45f42d`، 328,788,027 بايت، Developer ID Microsoft) | update.code.visualstudio.com | `~/.cache/ayar-dev2/editors` (لا /Applications ولا افتراضي) | 1.2 غ.ب (الأرشيف والتطبيق المفكوك) |

لم يُثبَّت شيء على مستوى النظام. ووظائف launchd المؤقتة من E-22 (`ayar.fx.proc.*`) أُزيلت وثبت ذلك في الفحص النهائي. وXcode فُتح في الخلفية بـ `xed` أثناء E-17 ولم يُغلق (قد يكون المالك يستخدمه)، والنسخة المؤقتة من VS Code أُغلقت.

## قيد سجل التقدم

```text
## 2026-10-10 — DEV-2 — تسليم
- المنجز: القرارات الثلاثة عشر محسومة بالدليل في spikes/E-xx-*/ وenv-decisions.md: E-07 (shims وأعلام Python وجدول رموز الخروج لـ 16 محولًا)، وE-08 (Betterleaks 1.9.0)، وE-09 (قاعدة OSV دون اتصال والقاعدة المصغرة وإكمال sec.deps في SANITY.md)، وE-10 (Semgrep مُدار واستدعاء من مجلد محايد؛ يحسم G-DEV1-01)، وE-11 (utilityProcess يستضيف المسبار؛ الخفي)، وE-12 (الأعلام الثلاثة)، وE-15 (مشاريع المالك الثلاثة للقراءة فقط؛ 11 فرقًا)، وE-16 (قارئ Git من الملفات)، وE-17 (القوالب)، وE-20 (الأدوات المُدارة تعمل بلا حجر)، وE-21 (المسبار بتقييد 4× وLighthouse اختياري)، وE-22 (العلامة وقاعدة الرصد)، وE-24 (المستودع الظلي؛ AT-42 يبقى).
- الفحوص: كلها نجحت (جدول التسليم)؛ validate.mjs 123 ملفًا؛ لا بقايا عمليات ولا launchd؛ 0 ملف تغيّر في مستودعات المالك.
- الـcommits: c4143de إلى e8ad6b3
- التالي: DEV-4 (C-06/C-07 بفروق E-15 وG-DEV2-01/03)، وDEV-5 (C-11/C-12 بـ D-DEV2-03/04)، وDEV-6 (C-15 بجدول رموز الخروج وD-DEV2-01)، وDEV-7 (C-14 بـ D-DEV2-02).
```

## ملاحظات للجلسة الرئيسية

- **ملفات خارج النطاق المعلن (`spikes/` و`fixtures/`):** `docs/tracking/env-decisions.md` (صفوف DEV-2 وتفاصيلها؛ مسموح لـ DEV-2 في القسم 6 من docs/waves/README.md)، وملف المرحلة، وهذا التسليم. ولا شيء غيرها.
- **`decisions.md`:** القرارات D-DEV2-01 إلى 05 والتعارضات G-DEV2-01 إلى 05 أعلاه تنتقل بمعرّفاتها، وتُحدَّث حالات G-DEV1-01 وG-DEV1-03 وG-35 وG-46 وA-05 وA-07 وA-08 كما في «حسم بنود قائمة».
- **لا تعديل في الخطة ولا في AT-42:** E-24 حُسم بالفرع الأول.
- **التنزيلات كبيرة** (نحو 1.5 غيغابايت تحت `~/.cache/ayar-dev2` و`spikes/E-01-electron-forge/node_modules`)؛ يمكن حذف `~/.cache/ayar-dev2/{semgrep-venv,cosign/dl,osv-db,editors}` بعد الإغلاق دون أثر على الإعادة إلا بإعادة التنزيل.
- **فتح التطبيقات على الشاشة أثناء المرحلة:** Chromium (E-11) وXcode بالخلفية وVS Code المؤقت (E-17)؛ لا شيء منها بقي إلا Xcode.
- **اقتراح على fixtures (ليس تعديلًا الآن):** G-DEV2-04 (الحفيد العنيد يتجاهل SIGINT أيضًا).
