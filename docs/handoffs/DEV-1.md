---
id: DEV-1
status: delivered
branch: phase/DEV-1
base: 1931934
head: e24bb31
delivered: 2026-10-10
model: Claude Sonnet 5.5 · جهد high
approval: —
---

# تسليم DEV-1 — مشاريع الاختبار ذات العيوب المزروعة

## ما أُنجز

كل ما في `fixtures/` (3.2 ميغابايت، نحو 600 ملف ملتزم). دليله [fixtures/README.md](../../fixtures/README.md)، وإثبات سلامته [fixtures/SANITY.md](../../fixtures/SANITY.md).

- **المهمة 1:** مخطط `fixture-expect/1` (JSON Schema)، ومدقق `fixtures/tools/validate.mjs` بلا تبعيات يتحقق من المخطط ومن أن كل موضع (ملف وسطر ومرساة) حقيقي في النسخة المركّبة ومن اتساق الأدوار. ومركّب نسخ `materialize.mjs` (أساس + overlay + اشتقاق + `install_path` + مولّدات)، ومشغّل سلامة `sanity.mjs` يقتل مجموعة العمليات كاملة عند المهلة.
- **المهام 2–6 (المشاريع التسعة):** FX-EXT (22 نسخة)، وFX-PY (7)، وFX-NOTEST (5)، وFX-WEB-DESIGN (9)، وFX-NOISY (2)، وFX-MONO (2)، وFX-REPORTS (6)، وFX-PROC (12 سيناريو)، وFX-MALICIOUS (مولَّد). المجموع **123 ملف توقع** في 10 مشاريع (مع FX-ADAPTERS).
- **المهمة 7:** مولّد FX-MALICIOUS `fixtures/tools/malicious/generate.mjs` يكتب كائنات Git مباشرة (SHA-1 وzlib) **بلا استيراد `child_process` ولا استدعاء `git`**، واختباره `test.mjs` (33 فحصًا).
- **المهمة 8:** FX-ADAPTERS: 16 مكوّنًا (vitest وjest وnode:test وplaywright وeslint وbiome وtsc وknip وpyright وpytest وruff وmypy وsemgrep وosv-scanner وgitleaks وlychee) بـ 56 نسخة معيبة (معيب، وخطأ إعداد، وبلا مدخلات، ومهلة، وتعارض)، تغطي كل صفوف جدول AT-14 (انظر الجدول في README). ومشروع `packageManager` (AT-31) نسخة `FX-NOISY/pnpm-unpinned`، ودالة التعقيد (AT-37) نسخة `FX-NOTEST/complex-function`.
- **المهمة 9:** خادم الأداة المعدّلة `tools/tool-server` (AT-35)، ومولّد المستودعات الاصطناعية `tools/synth-repo` (AT-36: 1000 و10000 و50000 ملف حتميًّا، والأخير في 4 ثوانٍ). **AT-26 مسجل مطلبًا لـ DEV-5** (README، القسم 6).
- **المهمة 10:** `SANITY.md` مولَّد آليًّا: لكل نسخة الأمر الحرفي ورمز الخروج الفعلي والخرج، من تشغيل فعلي بالأداة الأصلية.

## الفحوص

| الفحص | الأمر | النتيجة | التاريخ |
|---|---|---|---|
| ملفات التوقع | `node fixtures/tools/validate.mjs` | نجح: 123 ملف توقع في 10 مشاريع | 2026-10-10 |
| سلامة كل نسخة بأداتها الأصلية | `node fixtures/tools/sanity.mjs run <FX-X>` لكل من المشاريع العشرة | نجح: 250 تشغيلًا فعليًّا بأدواتها الأصلية (لا ✗ في SANITY.md)، وست صفوف «⏸ لم يُشغَّل: ينتظر E-09» لـ `sec.deps` | 2026-10-10 |
| المساعدات | `node fixtures/tools/sanity-helpers.mjs` | نجح: validate، وtool-server، وsynth-repo (بما فيه 50000)، وmalicious | 2026-10-10 |
| مولّد FX-MALICIOUS | `node fixtures/tools/malicious/test.mjs` | نجح: 33 فحصًا (لا git في التوليد، ولا علامات، والفخاخ صحيحة، و`git fsck --full --strict` نظيف على نسخة بلا فخاخ، وgitleaks يكشف السر القديم) | 2026-10-10 |
| إعادة بناء صندوق الأدوات | `AYAR_FX_HOME=<مؤقت> sh fixtures/tools/bootstrap-toolchain.sh` | نجح (uv 0.13.0، وsemgrep 1.180.0، وosv-scanner 2.6.0 ببصمة SHA-256 مطابقة، وlychee 0.24.2 ببصمته) | 2026-10-10 |
| سلامة المستودع | `git status` و`find fixtures -name .git -o -name "*.marker"` و`gitleaks dir fixtures` | لا ملف علامة ولا `.git` متداخل؛ ثمانية مواضع فقط تطابق الفاحص وكلها أسرار مصطنعة مقصودة (خمسة في ملفات المشاريع وثلاثة في نتائج السلامة التي تعرضها) | 2026-10-10 |
| بصمات الخطة | `cd docs/plan && shasum -a 256 -c CHECKSUMS.sha256` | نجح (قبل البدء) | 2026-10-10 |

**لم يُشغَّل:** `sec.deps` لنسخ `vuln-dep` (FX-EXT وFX-PY) و`osv--bad` و`good:osv` ينتظر قاعدة OSV المصغرة (E-09، DEV-2). و«لم يُثبت بعد أن OSV-Scanner يقرأ تبعية `file:`/`directory` من `pnpm-lock.yaml` و`uv.lock`»؛ إن لم يقرأها يُستبدل بمدخل قفل بسجل وهمي في DEV-2 (مدون في `pending` لكل ملف توقع).

## اختبارات القبول

| الاختبار | الحالة الجديدة في traceability.md | الدليل |
|---|---|---|
| AT-01 | جزئي: DEV-1 (FX-MALICIOUS ومولّده ومساعد ثقته؛ وSemgrep يستدعي git من مجلد العمل: G-DEV1-01) | `fixtures/tools/malicious/test.mjs`، وSANITY.md (FX-MALICIOUS) |
| AT-03 | جزئي: DEV-1 (FX-NOTEST) | SANITY.md (FX-NOTEST) |
| AT-04 | جزئي: DEV-1 (FX-PY بالمسار العربي وNFD) | SANITY.md (FX-PY) |
| AT-11 | جزئي: DEV-1 (FX-PROC: الحفيد وsetsid والتفرع المزدوج وlaunchctl ومسح البيئة) | SANITY.md (FX-PROC) |
| AT-12 | جزئي: DEV-1 (FX-PROC: معلّق، وصامت خامل، وصامت مشغول) | SANITY.md (FX-PROC) |
| AT-13 | جزئي: DEV-1 (FX-PROC: `long-running`) | SANITY.md (FX-PROC) |
| AT-14 | جزئي: DEV-1 (FX-ADAPTERS وFX-REPORTS وFX-PY بكل صفوف الجدول) | SANITY.md (FX-ADAPTERS، FX-REPORTS) |
| AT-15 | جزئي: DEV-1 (FX-EXT: `flaky-vitest` و`flaky-playwright`) | SANITY.md (FX-EXT) |
| AT-16 | جزئي: DEV-1 (المشاريع وملفات التوقع؛ ينقص تشغيل عِيَار وقاعدة OSV) | `validate.mjs`، SANITY.md |
| AT-17 | جزئي: DEV-1 (FX-WEB-DESIGN بـ 32 لقطة متوقعة وحالة حساسة وبلا مراجع) | SANITY.md (FX-WEB-DESIGN) |
| AT-23 | جزئي: DEV-1 (FX-EXT: `secret-in-test-log` و`unresolved-cause`، وFX-PROC: `hostile-output`) | SANITY.md |
| AT-24 | جزئي: DEV-1 (FX-EXT: عائلة `integrity-*` الست) | SANITY.md (FX-EXT) |
| AT-25 | جزئي: DEV-1 (FX-EXT: متذبذب وفاشل وسليم يغطي حالاتها الثلاث) | SANITY.md (FX-EXT) |
| AT-26 | لم يُشغَّل: المطلب مسجل لـ DEV-5 (مولّد حالة بيانات عِيَار) | README، القسم 6 |
| AT-31 | جزئي: DEV-1 (`FX-NOISY/pnpm-unpinned`، و`FX-WEB-DESIGN/external-font-host`) | SANITY.md (FX-NOISY، FX-WEB-DESIGN) |
| AT-35 | جزئي: DEV-1 (الخادم المعدّل ومدخل الكتالوج القديم) | `tools/tool-server/test.mjs` |
| AT-36 | جزئي: DEV-1 (المولّد بالأحجام الثلاثة) | `tools/synth-repo/test.mjs` وSANITY.md |
| AT-37 | جزئي: DEV-1 (FX-NOTEST: `complex-function` بتعقيد 19) | SANITY.md (FX-NOTEST) |
| AT-42 | جزئي: DEV-1 (FX-MALICIOUS بسر قديم يكشفه `gitleaks git` على نسخة بلا فخاخ) | `malicious/test.mjs` |
| AT-44 | جزئي: DEV-1 (FX-NOTEST بـ 14 ملف منطق بلا اختبارات؛ G-08) | SANITY.md (FX-NOTEST) |
| AT-48 | جزئي: DEV-1 (FX-EXT: `env-leak`) | SANITY.md (FX-EXT) |

## القرارات

| المعرّف | القرار | السبب ودليله | ما يتغير في الخطة | التاريخ | من قرره |
|---|---|---|---|---|---|
| D-DEV1-01 | نسختا `missing-icon` و`msg-undefined` تتوقعان `beh.ext.host` «أخفق» مع `sec.ext.manifest` | Chromium 156 يرفض تحميل الإضافة في الحالات الثلاث لا في `manifest-csp` وحدها: «Could not load icon 'assets/icon128.png'» و«Variable __MSG_extTagline__ used but not defined» (SANITY.md، FX-EXT/ext-load) | الخطة 20 تعزل `manifest-csp` وحدها «لأنه يمنع التحميل»؛ والصحيح أن ثلاثتها تمنعه، ومنها اختبارات تتوقع غير ذلك فتخطئ | 2026-10-10 | المنفّذ |
| D-DEV1-02 | مسار FX-PY الأصلي `مشاريع تجريبية/مكتبة «النصوص»` كما في الخطة؛ ونسخة `nfd-path` تضيف ملحق «(إصدار أول)» | المسار في الخطة بلا حرف مركّب، فصيغتا NFC وNFD متطابقتان بايتًا (وصف الخطة يذكر «همزة»)؛ بالملحق (إ ← ا + U+0655) تختلفان فعلًا (`unicodedata.is_normalized`) | الخطة 20 | 2026-10-10 | المنفّذ |
| D-DEV1-03 | تصنيف الحالات التي لم يحددها AT-14: خطأ إعداد ← تعذّر (المنشأ الأداة)؛ بلا مدخلات ← ناقص حين تخرج الأداة بـ 0 أو بـ «لا ملفات» (Ruff وnode:test وpyright وVitest وJest وPlaywright)، وتعذّر حين تخرج بخطأ (ESLint رمز 2، وtsc TS18003، وmypy رمز 2)؛ مهلة رابط/اختبار ← «يحتاج مراجعة»/«انتهت المهلة»؛ تعارض الرمز والتقرير ← تعذّر | قياس على صفوف AT-14 والخطة 7.3 (القواعد 3 و4 و5)؛ والرموز الفعلية موثقة في SANITY.md (`exit_code` في كل ملف توقع) | لا تغيير؛ تُراجع في DEV-6 عند كتابة خرائط الخروج | 2026-10-10 | المنفّذ |
| D-DEV1-04 | `fixture-expect/1` يوسَّع بحقول اختيارية: `component` و`tool_rule` و`origin` و`exit_code` و`reason` و`requires` و`summary` و`pending` و`engine_expectations`، و`location.history`؛ وأدوار النسخ: `defect` و`fix` و`clean` و`neutral` | حاجة فعلية: مساحات العمل والمحولات، والعيوب التاريخية (FX-MALICIOUS)، وسلوك المحرك الذي ليس نتيجة فحص (FX-PROC) وانتظار E-09 | الخطة 20 تحدد الحقول الخمسة؛ والباقي إضافات لا تنقضها | 2026-10-10 | المنفّذ |
| D-DEV1-05 | نتيجة `code.complexity` «اجتاز» مع درجة ثبوت «اقتراح تحسين» (لا «تحذير») | الكتالوج 10.3: «لا يحكم. ينتج اقتراحات وبطاقات» والخطة 7.3: «قد يحمل ملاحظات اقتراح لا تمس الاحتساب» | لا تغيير | 2026-10-10 | المنفّذ |
| D-DEV1-06 | نتائج فحوص الأدوات تُجرى من نسخ مؤقتة خارج المستودع، وصندوق الأدوات خارجه (`~/.cache/ayar-fixtures-toolchain`) يبنيه `bootstrap-toolchain.sh` بإصدارات مثبتة | G-09 وORG-09؛ والمستودع لا يحمل ثنائيات | لا تغيير | 2026-10-10 | المنفّذ |

## التعارضات والنواقص الجديدة

| المعرّف | الموضوع | المصدر | الحسم | الحالة |
|---|---|---|---|---|
| G-DEV1-01 | **Semgrep 1.180.0 يستدعي `git` على مجلد العمل رغم `--no-git-ignore` و`--metrics=off` و`--disable-version-check`**: `git ls-remote --get-url` (من مجلد العمل الحالي) و`git remote get-url origin` (من مجلد حزمة Semgrep). والخطة تقول إن `--no-git-ignore` يمنع استدعاء git على المستودع، فيخالف AT-01 إن شُغّل من داخل المستودع المفخخ | الخطة 10.3 (صف Semgrep)، C-15، AT-01 | **مُثبت بتجربة** (SANITY.md، FX-MALICIOUS `semgrep-from-repo-cwd`) **والتخفيف مُثبت**: تشغيله من مجلد عمل محايد بهدف مطلق يُبقي الاستدعاءين خارج المستودع (`semgrep-from-neutral-cwd`)؛ ولا يفيد ضبط `GIT_DIR`. القرار النهائي (مجلد محايد أم `git` مزيف أول PATH) لـ E-10 في DEV-2 وDEV-6 | مفتوح (قرار تنفيذ في DEV-2/DEV-6) |
| G-DEV1-02 | pnpm 12 يتطلب في كل مشروع يعتمد حزمًا بنصوص بناء (jest مثلًا) `allowBuilds` صريحة في `pnpm-workspace.yaml` وإلا خرج `ERR_PNPM_IGNORED_BUILDS` برمز 1 رغم نجاح التثبيت؛ ويقيّد `minimumReleaseAge` الإصدارات الحديثة (كُتب استثناء `@types/chrome@0.3.5` في `pnpm-workspace.yaml`) | تجربة DEV-1 (الأقفال في FX-ADAPTERS وFX-EXT) | يُنقل إلى DEV-3 (مساحة العمل الجذرية) وإلى E-06/E-07 | مفتوح |
| G-DEV1-03 | OSV-Scanner يخرج بـ **128** أيضًا لملف قفل تالف («Error during extraction») لا لغياب ملفات القفل وحده | `FX-ADAPTERS/osv--config-error` | يُميَّز بالخرج لا بالرمز؛ يُدرج في خريطة محول OSV (DEV-6) | مفتوح |
| G-DEV1-04 | `.gitignore` الجذري يتجاهل مجلدًا اسمه `icons` على macOS (النمط `Icon?` وحساسية حالة الأحرف في APFS) | اكتُشف حين لم يظهر `public/icons` في `git status` | حُلّ في DEV-1 بتسمية المجلد `assets`؛ ويقترح أن يصير النمط `Icon\r` في `.gitignore` الجذري (الملف للجلسة الرئيسية) | مفتوح (اقتراح) |
| G-DEV1-05 | الخطة 20 لا تحدد عمق JSON الأقصى ولا حدّ تقرير أصغر لاختبار «أكبر من الحد» دون 51 ميغابايت | الخطة 10.3 (حماية القراءة) | الفاحص المرجعي يستعمل 64 مستوى و50 ميغابايت؛ والنسخة العميقة بعمق 5000 فترفضها أي قيمة؛ تُحسم القيم في DEV-6 | مفتوح (DEV-6) |

## حسم بنود قائمة

| البند | الحسم | الدليل |
|---|---|---|
| G-06 (مشاريع المحولات) | حُسم: FX-ADAPTERS بـ 16 مكوّنًا وستة متغيرات حيث تتيحها الأداة: التعارض لـ vitest وpytest وحدهما (غيرهما لا يتيح رمز خروج مخالفًا لتقريره بإعداد مشروع)، والمهلة لـ vitest وjest وnode:test وplaywright وeslint وpytest وlychee | `fixtures/FX-ADAPTERS`، SANITY.md |
| G-07 (إكمالات AT-15 وAT-23 وAT-24 وAT-26 وAT-31 وAT-35 وAT-36 وAT-37 وAT-48) | حُسم كلها عدا AT-26 المسجل لـ DEV-5 بنص المهمة | README، القسم 6 |
| G-08 (14 ملف منطق) | حُسم: FX-NOTEST بـ 14 وحدة بالضبط وحقائق `facts` في `project.json`؛ والسبب يُبنى من الجرد الفعلي | `fixtures/FX-NOTEST/project.json` |
| G-09 (عزل الحالة) | حُسم للمشاريع: كل اختبار على نسخة مؤقتة بـ `materialize.mjs`، وملف عدّاد التذبذب خارج المستودع؛ وتصفير مجلد بيانات عِيَار لـ DEV-6 | README، القسم 2 |
| ORG-06 | نُفّذ: كل `rule` بـ `null` و`rule_pending: true` | `validate.mjs` يفرضه |
| ORG-09 | طُبّق (قسم التنزيلات) | — |

## العوائق

لا شيء.

## قرارات المالك واعتماده

لا شيء. التنزيلات سُجلت وفق ORG-09.

## التبعيات المضافة

لا شيء في `package.json` الجذري (لم يُنشأ بعد). التبعيات داخل `fixtures/*/package.json` وfixtures/*/pyproject.toml فقط وهي أدوات اختبار المشاريع (بإصدارات مثبتة وأقفال) وليست تبعيات منتج، ولا تنتقل إلى `docs/dependencies.md`. وأهمها: vitest 5.0.3 (MIT)، وtypescript 6.0.3 (Apache-2.0)، وvite 8.3.4 (MIT)، وeslint 10.12.0 (MIT)، و@playwright/test 1.64.0 (Apache-2.0)، وjest 30.5.2 (MIT)، و@biomejs/biome 2.5.15 (MIT/Apache-2.0)، وknip 6.41.0 (ISC)، وpyright 1.1.414 (MIT)، وpytest 9.1.1 (MIT)، وruff 0.16.10 (MIT)، وmypy 2.4.0 (MIT)، وHypothesis 6.168.5 (MPL-2.0)، وخط Cairo (OFL-1.1، ملفان woff2 مضمنان في FX-WEB-DESIGN مع `fonts/OFL.txt`).

## التنزيلات

كلها بإصدارات مثبتة من مصادرها الرسمية، دون استئذان (ORG-09):

| الاسم والإصدار | المصدر | المكان | الحجم التقريبي |
|---|---|---|---|
| uv 0.13.0 وsemgrep 1.180.0 (وتبعياتهما) | PyPI عبر pip في بيئة معزولة | `~/.cache/ayar-fixtures-toolchain/py` | 321 ميغابايت |
| osv-scanner 2.6.0 (darwin_arm64، بصمة SHA-256 مطابقة للمنشورة) | GitHub Releases: google/osv-scanner | `~/.cache/ayar-fixtures-toolchain/bin` | 53 ميغابايت |
| lychee 0.24.2 (aarch64-apple-darwin، بصمة مطابقة) | GitHub Releases: lycheeverse/lychee | `~/.cache/ayar-fixtures-toolchain/bin` | 7 ميغابايت |
| playwright-core 1.64.0 وaxe-core 4.14.0 وeslint 10.12.0 | npm | `~/.cache/ayar-fixtures-toolchain/node` | 30 ميغابايت |
| Chromium 156.0.8078.4 (Chrome for Testing) وChrome Headless Shell وffmpeg | Playwright 1.64.0 (CDN الرسمي) | `~/Library/Caches/ms-playwright` | نحو 570 ميغابايت |
| حزم المشاريع (pnpm: vitest وvite وtypescript وeslint وjest وbiome وknip وpyright وغيرها؛ وuv: pytest وruff وmypy وHypothesis) | npm وPyPI | مخزن pnpm `~/Library/pnpm/store` (1.5 غيغابايت إجمالًا يشمل غير هذه المرحلة) وذاكرة uv `~/.cache/uv` (388 ميغابايت) | مئات الميغابايتات في المخزنين |
| @fontsource-variable/cairo 5.3.0 (ملفا woff2: العربي واللاتيني) | npm | مُلتزم في `fixtures/FX-WEB-DESIGN/base/fonts` | 65 كيلوبايت |

لم يُثبَّت شيء على مستوى النظام (لا brew ولا تغيير إعدادات). وأُنشئت وظيفة launchd مؤقتة واحدة (`ayar.fx.proc.*`) أثناء إثبات سيناريو `launchctl-submit` وأُزيلت فورًا (يُثبت SANITY.md `JOB_LISTED_AFTER=0`).

## قيد سجل التقدم

```text
## 2026-10-10 — DEV-1 — تسليم
- المنجز: مخطط fixture-expect/1 ومدققه، ومشاريع الاختبار التسعة (FX-EXT 22 نسخة، FX-PY 7، FX-NOTEST 5، FX-WEB-DESIGN 9، FX-NOISY 2، FX-MONO 2، FX-REPORTS 6، FX-PROC 12، FX-MALICIOUS مولَّد) ومشاريع المحولات (FX-ADAPTERS: 16 مكوّنًا و56 نسخة معيبة)، ومساعدا AT-35 وAT-36، و123 ملف توقع، وSANITY.md من تشغيل فعلي بالأدوات الأصلية.
- الفحوص: validate.mjs نجح (123 ملفًا)، وسلامة كل النسخ نجحت بأدواتها الأصلية عدا ما ينتظر E-09 (sec.deps)، ومولّد FX-MALICIOUS لا يشغّل git (33 فحصًا).
- الـcommits: 1961f3c إلى e24bb31
- التالي: DEV-2 (E-09 وقاعدة OSV المصغرة، وE-10 وG-DEV1-01 في Semgrep)؛ ثم DEV-3.
```

## ملاحظات للجلسة الرئيسية

- **لا ملفات خارج `fixtures/`** إلا هذا التسليم وملف المرحلة `docs/phases/dev/DEV-01-fixtures.md`.
- **اقتراحات على ملفات المالك:** (1) `.gitignore` الجذري: النمط `Icon?` يتجاهل مجلد `icons` على macOS (G-DEV1-04). (2) فحص الأسرار الذاتي (الاستخدام الذاتي) يجب أن يستثني `fixtures/`: فيه تسع مطابقات مقصودة لأسرار مصطنعة. (3) مساحة pnpm الجذرية (DEV-3) وESLint وPrettier وKnip الجذرية يجب أن تستثني `fixtures/**` (لكل مشروع قفله ومساحته).
- **`docs/tracking/decisions.md`:** القرارات D-DEV1-01 إلى 06 والتعارضات G-DEV1-01 إلى 05 أعلاه تنتقل بمعرّفاتها. وG-DEV1-01 يمس DEV-2 مباشرة (E-10) فينبغي إدراجه في أمر تلك المرحلة.
- **مراحل لاحقة:** DEV-2 تُكمل `sec.deps` (E-09) وتفحص هل يقرأ OSV تبعية `file:` من الأقفال. وDEV-5 تكتب مولّد AT-26. وDEV-6 تكمل `rule` وتحسم عمق JSON وحد الحجم. ونسخة `FX-PROC/launchctl-submit` لا تُشغَّل إلا في اختبار يعقبه `launchctl-cleanup.sh`.
- **حادثة وإصلاحها:** التقطت نسخة أولى من `SANITY.md` ونتائج التشغيل خرجَ سيناريو `env-leak` وفيه بيئة الجهاز كاملة (ومنها رمز جلسة)، وكانت قد دخلت commits محلية لم تُدفع. حُذفت `fixtures/sanity-results/` و`SANITY.md` من تاريخ فرع المرحلة كله (`git filter-branch` على فرع المرحلة وحده) وأُزيلت المرجعية الأصلية وسجل الفرع، فلا commit في الفرع يحمل الأثر. وصار السيناريو يعمل بـ `env -i` (يطبع القيمتين المصطنعتين فقط)، ويستبدل المشغّل مسار الصفحة الرئيسية بـ `~` ويُنقّي ما يشبه رمزًا. وبقيت نسخة من الكائن غير الواصل في ذاكرة Git المحلية (حزمة cruft غير مرجعية تنتهي بـ `git gc` الدوري ولا تُدفع)؛ لم أشغّل `git gc --prune` لأنه يمس المستودع المشترك.
- **آثار تشغيل SANITY:** يترك ملف `ayar-fx-ext-flaky-*.count` صغيرًا في المجلد المؤقت (عدّاد تذبذب Vitest) وملف `ayar-fx-py-dist` لخرج البناء؛ كلاهما خارج المستودع ويُحذف يدويًّا.
