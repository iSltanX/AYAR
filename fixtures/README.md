# fixtures: مشاريع الاختبار ذات العيوب المزروعة

مبدأ اختبار عِيَار (الخطة 19 و20): لا يكفي أن تنجح الاختبارات، بل يثبت كل فحص قدرته على كشف عيب معروف في نسخة معيبة ولا يخترع عيبًا في نسخة سليمة. هذا المجلد يحمل **المشاريع التسعة** في الخطة 20، و**مشاريع المحولات** (G-06)، وإكمالات G-07، وملف توقع لكل نسخة بمخطط `fixture-expect/1`. بنتها DEV-1، وتستعملها تجارب DEV-2 ثم المحولات (DEV-6) والمسبار (DEV-7) واختبار القبول AT-16.

> **ملف المقياس:** [SANITY.md](SANITY.md) يثبت بالأمر الحرفي والخرج الفعلي أن كل نسخة سليمة تمر بأداتها الأصلية وأن كل عيب مزروع يظهر كما يقول ملف توقعه.

## 1. الفهرس

| المشروع | الوصف | النسخ | يخدم |
|---|---|---|---|
| [FX-EXT](FX-EXT/project.json) | إضافة Chromium (MV3) لعدّ الكلمات: Vite وTypeScript وVitest وPlaywright وESLint، نافذة منبثقة عربية RTL، سياسة صلاحيات | 22: السليمة، واختبار فاشل، وسر، و`<all_urls>`، وأيقونة مفقودة، و`__MSG_` غير معرّف، و`'unsafe-eval'` (`manifest-csp`)، وتباين منخفض، و`dir` مفقود، وتبعية ثغرة، وتذبذب Vitest وPlaywright، وخطأ وحدة تحكم، وسبب غير محسوم، وسر في سجل اختبار، وتسرب بيئة، وعائلة النزاهة (6) | AT-14 AT-15 AT-16 AT-23 AT-24 AT-25 AT-31 AT-37 AT-48 |
| [FX-PY](FX-PY/project.json) | مكتبة Python بـ pytest وHypothesis وRuff وmypy وuv، في المسار العربي `مشاريع تجريبية/مكتبة «النصوص»` | 7: السليمة، واختبار فاشل، وبلا اختبارات (رمز 5)، وخطأ استخدام (رمز 4)، ومخالفة Ruff، وتبعية ثغرة، ومسار NFD | AT-04 AT-14 AT-16 AT-31 |
| [FX-NOTEST](FX-NOTEST/project.json) | مكتبة JS من 14 وحدة منطق بلا اختبارات ولا مرجع تصميم، مع README وصفحة HTML | 5: السليمة، ورابط Markdown مكسور، وصورة HTML مفقودة، ومرسى مكسور، ودالة تتجاوز عتبة التعقيد | AT-03 AT-16 AT-37 AT-44 |
| [FX-WEB-DESIGN](FX-WEB-DESIGN/project.json) | تطبيق ويب برموز DTCG وثيمين ولغتين وحالات تحميل/خطأ/فراغ بمحاكاة شبكة وحالة «حساسة»، وخط Cairo محلي، بلا صور مرجعية | 9: السليمة، ولون حرفي، ومسافة خارج السلم، و`var()` غير معرّف، ورسالة خطأ مفقودة، وتغيير بصري مقصود، وخط بديل صامت، وتباين منخفض، وخط من مضيف خارجي | AT-16 AT-17 AT-31 |
| [FX-NOISY](FX-NOISY/project.json) | اختبار يكتب ملفات في المستودع ويعدّل ملفًا متتبعًا، وسكربت `test` مركب، و`.nvmrc` غير مثبت | 2: الأساس، و`pnpm-unpinned` (`packageManager` بنسخة pnpm غير مثبتة) | AT-31 والآثار الجانبية C-17 |
| [FX-PROC](FX-PROC/project.json) | سيناريوهات عمليات: حفيد يتجاهل SIGTERM، وsetsid، وتفرع مزدوج، وlaunchctl، ومسح البيئة، ومعلّق، وخرج ضخم وعدائي، وصامت خامل ومشغول، وفحص طويل | 12 | AT-11 AT-12 AT-13 AT-23 |
| [FX-MALICIOUS](FX-MALICIOUS/project.json) | مستودع Git مفخخ **يُولَّد** وقت الاختبار (`tools/malicious/generate.mjs`) ولا يُلتزم | 1 (مولَّد) | AT-01 AT-42 |
| [FX-REPORTS](FX-REPORTS/project.json) | تقارير حقيقية لأربع أدوات ونسخها التالفة والمتعارضة | 6: السليمة، وJUnit تالف، وSARIF ناقص، وJSON عميق، وأكبر من الحد (يُولَّد)، وخروج 0 مع إخفاقات | AT-14 |
| [FX-MONO](FX-MONO/project.json) | مساحة عمل pnpm بحزمتين | 2: السليمة، وإخفاق في الحزمة الأساسية | AT-16 والمكوّنات وعدم التكرار |
| [FX-ADAPTERS](FX-ADAPTERS/project.json) | **مشاريع المحولات** (G-06): مكوّن لكل محول بقفله، بالمتغيرات الستة (ومكوّن osv يُفحص بقاعدة OSV المصغرة من DEV-2) | 57: السليمة، و56 معيبة (`<أداة>--<نوع>`) | AT-14 |

المحولات الداخلة: vitest وjest وnode:test وplaywright وeslint وbiome وtsc وknip وpyright وpytest وruff وmypy وsemgrep وosv-scanner وgitleaks وlychee. **بلا نسخ:** Stryker وk6 (اختياريان وثقيلان)؛ محولاهما في DEV-6 مختبران على تقارير بشكلها.

### جدول AT-14 (الصف ← النسخة)

| صف AT-14 | النسخة |
|---|---|
| اختبار فاشل ← أخفق | `vitest--bad` `pytest--bad` `jest--bad` … |
| Vitest دون ملفات اختبار ← ناقص | `vitest--no-inputs` |
| ESLint برمز 2 ← تعذّر | `eslint--config-error` (وكذلك `eslint--no-inputs`) |
| Ruff برمز 2 ← تعذّر | `ruff--config-error` |
| tsc بـ TS6133 ← أخفق | `tsc--bad` |
| tsc بـ TS18003 ← تعذّر | `tsc--no-inputs` (والإعداد: `tsc--config-error` بـ TS5083) |
| mypy برمز 2 مع خطأ صياغة ← أخفق | `mypy--syntax-error` (وبلا تشخيص بموضع ملف: `mypy--config-error` ← تعذّر) |
| pytest برمز 2 مع خطأ جمع ← أخفق | `pytest--collection-error` |
| pytest برمز 4 ← تعذّر | `pytest--usage-error` (والمشروع الكامل: `FX-PY/usage-error`) |
| pytest برمز 5 ← ناقص | `pytest--no-tests` (والمشروع الكامل: `FX-PY/no-tests`) |
| Semgrep برمز 0 مع نتائج ← حسب السياسة | `semgrep--bad` |
| OSV برمز 128 مع تبعيات معلنة ← ناقص | `osv--no-lockfiles` |
| مهلة رابط في lychee | `lychee--timeout` |
| خروج 0 مع إخفاقات ← تعذّر | `pytest--conflict` `vitest--conflict` `FX-REPORTS/exit0-with-failures` |
| JUnit تالف / تقرير أكبر من الحد ← تعذّر | `FX-REPORTS/junit-corrupt` `FX-REPORTS/oversize` |

## 2. النموذج: أساس + نسخ

كل مشروع `FX-X/` فيه:

```text
project.json                 الهوية والوصف والنوع (overlay | generated) والأدوات المثبتة
base/                        المشروع السليم كاملًا (النسخة good)
variants/<النسخة>/
    variant.json             الاسم والوصف والعيوب (defects) والدور (role) والاشتقاق (derived_from) والحذف (delete)
    overlay/…                الملفات التي تحل محل ملفات الأساس أو تُضاف إليه
    expected.json            النتائج المتوقعة (fixture-expect/1)
sanity.mjs                   تشغيلات السلامة بالأدوات الأصلية
```

- **النسخ المعيبة تُولَّد من السليمة بتعديلات صغيرة موثقة**: `base/` + `overlay/` − `delete`. وتشتق النسخة من نسخة غير الأساس بـ `derived_from` (مثل عائلة النزاهة في FX-EXT: كلها مشتقة من `integrity-real-fix`).
- **`role`**: `defect` (الافتراضي: يلزمه عيب مزروع وتوقع غير «اجتاز»)، `fix` (حالة مصلحة)، `clean` (السليمة: كل توقعاتها اجتاز أو ناقص إعداد أو غير منطبق)، `neutral` (لا عيب مزروع لكنها تحمل سلوكًا يُرصد).
- **`install_path`**: مسار التركيب النسبي (FX-PY: `مشاريع تجريبية/مكتبة «النصوص»`، ونسخة NFD تغيّره).
- **`generate`**: مولّدات ما بعد التركيب لما لا يُلتزم (تقرير أكبر من الحد في FX-REPORTS).
- **FX-MALICIOUS** `kind: generated`: لا `base/`؛ المولّد `tools/malicious/generate.mjs` يبني المستودع كله.
- **FX-ADAPTERS**: كل مجلد في `base/` مكوّن مستقل (`vitest/` و`eslint/`…)، والنسخة `<أداة>--<نوع>` تعدّل مكوّنًا واحدًا، و`variant.json.component` يسمّيه، وكل أمر يُشغَّل داخل مجلد المكوّن.

### عزل الحالة بين الاختبارات (G-09)

**لا يُشغَّل شيء في `fixtures/` مباشرة.** كل اختبار يركّب نسختَه في مجلد مؤقت جديد:

```bash
node fixtures/tools/materialize.mjs FX-EXT failing-test "$TMPDIR/fx-ext-1"    # يطبع جذر المشروع الفعلي
```

ثم يعمل عليه، فاعتماد الصور المرجعية (AT-17) وتعديلات AT-24 وملفات `.cache/` لا تمس الأصل. و`pnpm install`/`uv sync` تجري في النسخة المؤقتة وتحترم الأقفال (`pnpm install --frozen-lockfile`، `uv sync --frozen`).

## 3. ملف التوقعات `fixture-expect/1`

المخطط: [schema/fixture-expect-1.schema.json](schema/fixture-expect-1.schema.json). لكل توقع في `expectations`:

| الحقل | المعنى |
|---|---|
| `check` | معرّف الفحص في كتالوج الخطة 10.3 (`beh.unit`…) |
| `component` | المكوّن (مساحة العمل أو مكوّن المحولات) |
| `result` | اجتاز / أخفق / تحذير / يحتاج مراجعة / متذبذب / ناقص / ناقص إعداد / تعذّر / غير منطبق / غير مضمّن / أُلغي / انتهت المهلة |
| `rule` | معرّف قاعدة عِيَار من `packages/catalog/data/rules.json` لكل اكتشاف متوقع (موضع ودرجة ثبوت)، و`null` حيث لا اكتشاف. أكملته DEV-6 (ORG-06)، و`rule_pending` لم يعد مقبولًا |
| `tool_rule` | معرّف القاعدة في الأداة الأصلية (`F401` و`TS6133` و`no-unused-vars`) |
| `location` | `{path, line, anchor}` أو `{path, history}` لملف حُذف وبقي في التاريخ. **المدقق يتحقق أن الملف والسطر والمرساة حقيقية** |
| `confidence` | مخالفة مثبتة / اشتباه / اقتراح تحسين / `null` |
| `origin` | المشروع أو الأداة (إلزامي لـ أخفق وتعذّر) |
| `exit_code` | رمز خروج الأداة الأصلية كما ثبت في SANITY.md |
| `requires` | مدخلات خارجية (`osv-mini-db`، أو `baseline:<نسخة>` لنسخ النزاهة) |

وللمشروع `pending` (ما ينتظر E-09 مثلًا) و`engine_expectations` (سلوك المحرك لا فحصًا بعينه: اكتشاف لا ينفذ شيئًا، ومحارف خرج مهربة…).

```bash
node fixtures/tools/validate.mjs            # كل المشاريع
node fixtures/tools/validate.mjs FX-EXT
```

## 4. الأدوات (`tools/`)

| الأداة | وظيفتها |
|---|---|
| `validate.mjs` | مدقق `fixture-expect/1` بلا تبعيات (مخطط ومواضع واتساق أدوار وملفات) |
| `materialize.mjs` | يركّب نسخة في مجلد مؤقت (يدعم الاشتقاق و`install_path` والمولّدات) |
| `sanity.mjs` | يشغّل الأدوات الأصلية على كل نسخة ويحفظ `sanity-results/*.json` ثم يبني `SANITY.md` |
| `sanity-helpers.mjs` | يشغّل اختبارات المساعدات أدناه |
| `bootstrap-toolchain.sh` | يبني صندوق الأدوات (semgrep وuv وosv-scanner وlychee وplaywright-core وaxe-core وeslint وChromium) بإصدارات مثبتة (`toolchain.json`) |
| `osv-mini-db/build.mjs` + `records/` | **قاعدة OSV المصغرة** (E-09، DEV-2): سجلان مصطنعان `AYAR-2026-0001` (npm) و`AYAR-2026-0002` (PyPI) للحزمة `ayar-vuln-fake@1.0.0`، يُبنيان وقت الاختبار إلى `<cache>/osv-scalibr/<Ecosystem>/all.zip` (التخطيط الذي يقرؤه osv-scanner 2.6.0 مع `OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY`) بكاتب ZIP حتمي بلا تبعيات؛ ملفات zip لا تُلتزم |
| `malicious/generate.mjs` + `test.mjs` | مولّد FX-MALICIOUS واختباره (**لا يشغّل `git` في المستودع المولَّد**، D-38) |
| `tool-server/server.mjs` + `test.mjs` | **AT-35**: خادم محلي يقدّم أداة بصمتها لا تطابق الكتالوج + مدخل كتالوج تاريخ تحققه أقدم من 180 يومًا (`--honest` ضابط سلبي) |
| `at26-state.ts` | **AT-26** (DEV-5): مولّد حالة بيانات عِيَار بمخطط القاعدة وخدمات المحرك نفسها: مشروع بـ 21 تشغيلًا (الأول «محفوظ دائمًا»، وجولة قائمة على الثالث)، ولكل تشغيل لقطة حالة بمحتواها ودليل ببصمته، ومراجعتان وبطاقتان وصورتان مرجعيتان. `node fixtures/tools/at26-state.ts <مجلد-البيانات> <جذر-المشروع> [--runs 21]`، ويطبع المعرّفات سطر JSON. يستعمل مفتاح HMAC الاختباري المعلن (G-47) |
| `synth-repo/generate.mjs` + `test.mjs` | **AT-36**: مستودعات اصطناعية حتمية بـ 1000 و10000 و50000 ملف (`--preset small/medium/large`) |
| `axe-check.mjs` `chrome-load.mjs` `ext-policy-check.mjs` `web-design-check.mjs` `reports-check.mjs` | فاحصات مستقلة تثبت أن العيب المزروع حقيقي (ليست جزءًا من عِيَار) |

### الأدوات والإصدارات

Node 24.16.0 مع pnpm 12.8.1 (`packageManager` في كل مشروع pnpm)، وuv 0.13.0 (Python 3.12.13)، وVitest 5.0.3، وTypeScript 6.0.3، وVite 8.3.4، وESLint 10.12.0، وPlaywright 1.64.0 مع Chromium 156.0.8078.4، وpytest 9.1.1، وRuff 0.16.10، وmypy 2.4.0، وSemgrep 1.180.0، وOSV-Scanner 2.6.0، وlychee 0.24.2، وGitleaks 8.30.1، وخط Cairo من `@fontsource-variable/cairo` 5.3.0 (OFL-1.1). التفاصيل في كل `project.json` وفي `SANITY.md`.

## 5. تحذيرات

- **FX-PROC** تترك عمليات يتيمة عن قصد، وتسجل أرقامها في `FX_PROC_PIDS`؛ ينظّفها الاختبار الذي يشغلها. وسيناريو `launchctl-submit` يسجل وظيفة launchd في نطاق المستخدم (`ayar.fx.proc.*`) تُزال فقط بـ `sh procs/launchctl-cleanup.sh <ملف-الاسم>`. يُشغَّل في الاختبار وحده.
- **FX-MALICIOUS** لا يُلتزم ولا يُشغَّل `git` داخله أبدًا إلا في تجربة E-24 بالبيئة المعزولة. وتشغيل أدوات ثالثة على مستودعه (مثل Semgrep) يجب أن يتم من **مجلد عمل محايد وبهدف مطلق**: وجدت DEV-1 أن Semgrep 1.180.0 يستدعي `git ls-remote --get-url` من مجلد العمل الحالي ولو مع `--no-git-ignore` و`--metrics=off` و`--disable-version-check` (انظر SANITY.md، FX-MALICIOUS).
- **الأسرار كلها مصطنعة** بصيغة مفتاح API عامة (`ayr_live_…`، `ayr_hist_…`، `ayr_env_…`)، ولا سر حقيقي. وسيفحص عِيَار مستودعه نفسه لاحقًا (الاستخدام الذاتي): يجب استثناء `fixtures/` في إعداد فحص الأسرار الجذري.
- ما فيه `node_modules/` أو `dist/` أو `.venv/` لا يُلتزم (`.gitignore` الجذري)، ومساحة pnpm للجذر (DEV-3) يجب ألا تضم `fixtures/**`، ولا ESLint/Prettier/Knip الجذرية.

## 6. مطالب مسجلة لمراحل لاحقة

| المطلب | المرحلة | التفصيل |
|---|---|---|
| **AT-26** مولّد حالة بيانات عِيَار: مشروع بـ 21 تشغيلًا أحدها «محفوظ دائمًا» ومراجعات وبطاقات وصور مرجعية | **أُنجز في DEV-5** | `tools/at26-state.ts` بمخطط القاعدة (ترحيلات المحرك) وخدماته، لا بنسخة منهما؛ ويستعمله `tools/cli/test/at26.test.ts` |
| قاعدة OSV المصغرة (حزمة وثغرة مزيفتان) و`sec.deps` لنسخ `vuln-dep` (FX-EXT وFX-PY) و`osv--bad` | **أُنجز في DEV-2** (E-09) | `tools/osv-mini-db/`؛ وثبت أن osv-scanner يقرأ تبعية `file:` من `pnpm-lock.yaml` (بإصدار نصي `file:vendor/ayar-vuln-fake`) وتبعية `directory` من `uv.lock` (بإصدارها 1.0.0) ويطابقهما؛ فلا حاجة لمدخل قفل بسجل وهمي |
| معرّفات القواعد (`rule`) في كل ملفات التوقع | **أُنجز في DEV-6** | من التشغيل الفعلي عبر المحرك (AT-14 وAT-16)، وقواعد الفحوص اللاحقة (العرض الحي والنزاهة) من كتاب القواعد؛ و`validate.mjs` يفرضها |
| محولا Stryker وk6 | **المحولان أُنجزا في DEV-6** باختبارات الحزمة على تقارير بشكلها | نسختاهما في FX-ADAPTERS اختياريتان ولم تُبنيا |
