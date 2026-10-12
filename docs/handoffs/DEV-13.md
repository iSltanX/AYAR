---
id: DEV-13
status: delivered
branch: phase/DEV-13
base: 36c1b57
head: <HEAD>
delivered: <DATE>
model: Claude Fable 5.1 بجهد xhigh (الجلسة الرئيسية، تنفيذ متتابع ORG-16، بلا جولة الفحص الداخلية ORG-18، وجولة فحص خارجية في Copilot قبل الدمج ORG-19)
approval: —
---

# تسليم DEV-13 — التغليف والتوقيع والمعايرة والقبول النهائي

## ما أُنجز

- **التغليف والتوقيع (المهمة 1):** `npm run package` في `apps/desktop` يبني الأهداف الأربعة والأيقونة ويغلّف بـ Forge 8.0.1 ويوقّع عبر `osxSign` بالهوية الذاتية الثابتة «AYAR Local Code Signing» (E-04، D-50، D-53) بالمعرّف `com.bysltan.ayar` (Q-04) وصمامات 15.2. وأيقونة التطبيق المعتمدة (D-48) من Figma `30:1445` بدقة 1024 في `apps/desktop/icon/`، تُحوَّل إلى `.icns` في البناء (`tools/packaging/make-icns.mjs`). وأدوات `tools/packaging/`: اشتقاق حزمة الاختبار بقلب صمام المفتش وحده وإثبات الفرق بايتًا واحدًا (`derive.mjs`، D-51)، وفحوص AT-30 على الحزمة مباشرة بضابط إيجابي على حزمة ضابطة (`checks.mjs`، D-51، D-52)، ومقارنة حزمتين (`compare-packages.mjs`) وإعادة البناء من مستودع نظيف (`reproduce.sh`، الخطة 25). والتشخيصات التي تقرؤها اختبارات E2E تُكشف على الحزمة حين يكون مفتش Node نشطًا وحده (الحزمة المشتقة). واختبارات E2E تعمل على الحزمة المشتقة بـ `AYAR_E2E_APP` (بيانات كل اختبار تحت HOME مؤقت)، وتستثني ملفَي المعرض لأنهما لبناء التطوير.
- **التراخيص والدليل (المهمة 2):** مجموعة «حول» في الإعدادات تفتح دليل الاستخدام (تسع خطوات باللغتين، النطاق `guide`) وتراخيص الخطين (OFL) والمكتبات السبع عشرة المشحونة (`tools/packaging/licenses.ts` يولّد `licenses.generated.ts` من الحزم المثبتة بقائمة `docs/dependencies.md` §1، واختبار يثبت أنه محدَّث). التفصيل في [docs/acceptance/release.md](../acceptance/release.md).
- **المعايرة (المهمة 3):** AT-36 مرورًا أول (خط أساس) على المستودعات الاصطناعية الثلاثة وعلى الحزمة المشتقة (`tools/perf/discovery.ts` و`apps/desktop/test/perf/at36.perf.ts`)، وتجارب التوازي E-18 (`tools/perf/parallel.ts`) وأحجام الأدلة E-19 (`tools/perf/storage.ts`)، ثم قرارات E-14 وE-18 وE-19 بقيمها النهائية في `docs/tracking/env-decisions.md`، ثم AT-36 قبولًا على القيم المعايرة، وحد AT-39 (100 مللي ثانية). القياسات بظروف الجهاز في [docs/acceptance/perf/](../acceptance/perf/).
- **اختبارات جهاز المالك واليد البشرية (المهمة 4):** AT-13 (النوم) وAT-32 وAT-33 وAT-40 (قائمة VoiceOver الموقّعة) وAT-41 وAT-43 (القارئ وJ10) بخطواتها في [docs/acceptance/owner-tests.md](../acceptance/owner-tests.md) وما أعاده المالك في [docs/acceptance/owner-evidence/](../acceptance/owner-evidence/). <OWNER_SUMMARY>
- **القبول الشامل (المهمة 5):** AT-01 إلى AT-48 على الحزمة النهائية (حزمة الإصدار نفسها لـ AT-30، والحزمة المشتقة للواجهة، والمحرك المشحون عبر `tools/cli` لاختبارات المحرك) في [docs/acceptance/AT-report.md](../acceptance/AT-report.md)، وبنود الخطة 25 واحدًا واحدًا.
- **الاستخدام الذاتي (المهمة 6):** `tools/acceptance/self-check.ts`: عِيَار يفحص مستودعه من جذره بالملف المقترح معتمدًا كما اقتُرح؛ النتيجة في [docs/acceptance/self-check/](../acceptance/self-check/). <SELF_SUMMARY>
- **G-DEV12-05:** حارس النزاهة يحمل الأثر غير المراجَع إلى الجولات التالية (أساسه آخر جولة، وهي تحمل التغيير)، من دليل آخر تنفيذ له، ما دام الأثر قائمًا ولم تستقر مراجعة قبول على فحصه؛ واختبار (ط) في `integrity.test.ts`.

## الفحوص

| الفحص | الأمر | النتيجة | التاريخ |
|---|---|---|---|
| حزمة الإصدار: التوقيع والمعرّف والصمامات | `codesign --verify --deep --strict --verbose=2 AYAR.app`، و`codesign -d -r-`، و`electron-fuses read --app`، و`PlistBuddy` | <PKG> | <D> |
| حزمة الاختبار المشتقة (D-51) | `node tools/packaging/derive.mjs --app … --out … --json docs/acceptance/perf/derive-for-acceptance.json` | <DERIVE> | <D> |
| AT-30 على حزمة الإصدار والحزمة الضابطة | `node tools/packaging/checks.mjs --app … --label release` و`… --label control --expect open` | <CHECKS> | <D> |
| E2E على الحزمة المشتقة (9 ملفات) | `AYAR_E2E_APP=… node ../../node_modules/vitest/vitest.mjs run -c vitest.e2e.config.ts` (في `apps/desktop`) | <E2E> | <D> |
| الحزمة الكاملة | `npm run verify` | <VERIFY> | <D> |
| قوة الاختبارات (Q-05، بوابة الإصدار) | `npm run test:mutation` | <MUT> | <D> |
| AT-31 في شبكة مراقبة | `sh packages/engine/test/support/at31.sh` | <AT31> | <D> |
| AT-32 (المحرك) على جهاز المالك | `AYAR_AT32=1 vitest run tools/cli/test/at32.owner.test.ts` | <AT32> | <D> |
| AT-36 خط الأساس ثم القبول | `node tools/perf/discovery.ts` و`vitest run -c vitest.perf.config.ts` (مع `AYAR_PERF_JUDGE=1` في القبول) | <AT36> | <D> |
| E-18 وE-19 | `node tools/perf/parallel.ts` و`node tools/perf/storage.ts` | <E18E19> | <D> |
| إعادة البناء من مستودع نظيف | `sh tools/packaging/reproduce.sh <repo> <head> <AYAR.app> docs/acceptance/perf/reproduce.json` | <REPRO> | <D> |
| الاستخدام الذاتي | `node tools/acceptance/self-check.ts --repo <worktree>` | <SELF> | <D> |
| حارس النزاهة (G-DEV12-05) | `vitest run packages/engine/test/integrity.test.ts packages/engine/test/guard.test.ts` | نجح: 22 من 22 | 2026-10-12 |
| التراخيص محدَّثة | `node tools/packaging/licenses.ts --check` و`vitest run apps/desktop/test/licenses.test.ts` | نجح | 2026-10-12 |
| جولة الفحص الخارجية (ORG-19) | برومبت Copilot ← تقرير المالك ← التحقق والإصلاح | <COPILOT> | <D> |

## اختبارات القبول

كل الاختبارات في [docs/acceptance/AT-report.md](../acceptance/AT-report.md). والحالة الجديدة لكل اختبار في `traceability.md`: «مقبول على الحزمة: DEV-13» لما نجح على الحزمة النهائية، وما عداه كما في الجدول:

| الاختبار | الحالة الجديدة في traceability.md | الدليل |
|---|---|---|
| AT-01 إلى AT-48 | <TRACE_SUMMARY> | `docs/acceptance/AT-report.md` |

## القرارات

| المعرّف | القرار | السبب ودليله | ما يتغير في الخطة | التاريخ | من قرره |
|---|---|---|---|---|---|
| D-DEV13-01 | **تشخيصات العملية الرئيسية (`ayarDiagnostics`) تُكشف على الحزمة المغلفة حين يكون مفتش Node نشطًا وحده**، إضافةً إلى بناء التطوير | اختبارات E2E تقرأ منها مخالفات CSP والمرسِلين المرفوضين؛ والمفتش لا ينشط على الحزمة إلا بقلب صمام `EnableNodeCliInspectArguments`، أي على الحزمة المشتقة للاختبار (D-51)، فحزمة الإصدار لا تكشف شيئًا (`checks.mjs`: `--inspect` لا يفتح مفتشًا) | يطبّق D-51 على الجولة بالواجهة | 2026-10-12 | المنفّذ |
| D-DEV13-02 | **صفان في مجموعة «حول» المعتمدة (D-DEV12-02): «دليل الاستخدام» و«التراخيص»، كل منهما بزر ثانوي يفتح ورقة** (المكوّن المعتمد Sheet بعرض 720) تعرض الدليل أقسامًا، أو قائمة الخطوط والمكتبات مع نص الترخيص | الخطة 25 تشترط دليلًا باللغتين وتراخيص الخطوط والمكتبات داخل التطبيق، وتصميم DES-5 لم يرسم لهما شاشة؛ فأُضيفا بنمط صف المجموعة نفسه وأيقونتَي `file-text` و`scale` من المجموعة المعتمدة. انحراف ضروري عن التصميم يُعرض على المالك (AGENTS.md 7) | لا يغيّر نص الخطة | 2026-10-12 | المنفّذ؛ يُعرض على المالك |
| D-DEV13-03 | **أيقونة الحزمة `AppIcon-light` المعتمدة**، والنسخة الداكنة محفوظة في `apps/desktop/icon/` دون استعمال | macOS يأخذ `.icns` واحدًا من الحزمة؛ ودعم النسخة الداكنة يحتاج حزمة Icon Composer وهي خارج نطاق الإصدار الأول | لا شيء | 2026-10-12 | المنفّذ |
| D-DEV13-04 | **AT-39: حد الاستجابة 100 مللي ثانية** لأطول جواب من المحرك أثناء قراءة التقارير التالفة | هدف NFR-01 لاستجابة الواجهة كما عُويرت في E-14؛ والقياس الوظيفي في DEV-6 كان 16 مللي ثانية | يحدد الحد الذي أرجأته AT-39 إلى E-14 | 2026-10-12 | المنفّذ بمعيار الخطة |
<DECISIONS_MORE>

## التعارضات والنواقص الجديدة

| المعرّف | الموضوع | المصدر | الحسم | الحالة |
|---|---|---|---|---|
<CONFLICTS>

## حسم بنود قائمة

| البند | الحسم | الدليل |
|---|---|---|
| G-DEV12-05 | يحمل الحارس آثاره غير المراجَعة من دليل آخر تنفيذ له إلى الجولة التالية ما دامت قائمة ولم تستقر مراجعة قبول على فحصها، ويعدّها في `carried` | `packages/engine/src/integrity/service.ts` واختبار (ط) في `integrity.test.ts` |
| G-13 | نُفّذ الأوسع: القارئ يكمل J10 كاملة ومهمة الاكتشافات الثلاثة في مهمة واحدة | `docs/acceptance/reader-task.md` ونموذجها <G13_RESULT> |
| E-14 | <E14_SUMMARY> | `docs/tracking/env-decisions.md` و`docs/acceptance/perf/` |
| E-18 | <E18_SUMMARY> | `docs/tracking/env-decisions.md` و`docs/acceptance/perf/e18-parallel.json` |
| E-19 | <E19_SUMMARY> | `docs/tracking/env-decisions.md` و`docs/acceptance/perf/e19-storage.json` |
| Q-07 | <Q07_SUMMARY> | `docs/acceptance/owner-evidence/` |

## العوائق

<BLOCKERS>

## قرارات المالك واعتماده

<OWNER_DECISIONS>

## التبعيات المضافة

لا شيء (لا تبعية جديدة في `package.json`).

## التنزيلات

- لا تنزيل أدوات جديدة. وأُعيد تجهيز ذاكرة بيانات pnpm (`~/Library/Caches/pnpm`) بتثبيت تبعيات مشاريع الاختبار من سجل npm مرة واحدة، لأن الاختبارات تثبّتها دون اتصال من هذه الذاكرة وكانت قد أُزيلت (نحو <PNPM_MB> ميغابايت).

## التنظيف

| ما أُنشئ أو نُزّل | المسار | الحجم التقريبي | المصير | السبب |
|---|---|---|---|---|
| حزمة الإصدار وحزم الاختبار المشتقة والضابطة وتقارير القياس المؤقتة | `apps/desktop/out/` (مستثنى من Git)، و`scratchpad/derived/` و`scratchpad/control/` | نحو 1 غيغابايت | يُحذف بعد الإغلاق (حزمة الإصدار في `out/` تبقى حتى الدمج لتكون هي المختبَرة والمعادة بناءً؛ والمشتقة والضابطة أُزيلتا بعد تشغيلها) | AGENTS.md 10 وD-51 |
| المجلدات المؤقتة للقياسات والاختبارات (`ayar-DEV-13-*`، `ayar-e2e-*`) | `$TMPDIR` | — | أُزيل (تحذفها السكربتات والاختبارات نفسها) | انتهى غرضها |
| ذاكرة بيانات pnpm | `~/Library/Caches/pnpm` | <PNPM_MB> م.ب | أُبقي | تحتاجها اختبارات المحرك والقبول دون اتصال (كانت موجودة قبل DEV-12 وأُزيلت) |
| مشاريع اختبارات المالك | `~/AYAR-acceptance/` (FX-EXT بتبعياته وFX-PROC واللقطات) و`~/Documents/AYAR-acceptance/FX-PY` | نحو <OWNER_MB> م.ب | ينتظر المالك | أدلة اختباراته؛ تُحذف بعد الإغلاق إن لم يرِد إبقاءها |
| نسخة التطبيق للمالك | `~/Applications/AYAR.app` | 337 م.ب | ينتظر المالك | تُبقى إن أراد استعمال عِيَار، أو تُحذف |
| `node_modules` في مجلد العمل | `AYAR-wt/DEV-13/node_modules` | نحو 650 م.ب | يُحذف بعد الإغلاق | يزول مع مجلد العمل |
| `~/.cache/ayar-fixtures-toolchain` | — | 496 م.ب | أُبقي | تحتاجه اختبارات المحرك بعد الإغلاق (إعادة فحص) |

ولا عملية ولا وظيفة launchd باقية من العمل.

## قيد سجل التقدم

```text
## <DATE> — DEV-13 — تسليم
- المنجز: حزمة الإصدار الموقّعة بأيقونتها وأدوات اشتقاق حزمة الاختبار وفحوص AT-30 وإعادة البناء؛ ودليل الاستخدام والتراخيص داخل التطبيق؛ ومعايرة E-14 وE-18 وE-19 بقيمها النهائية وقبول AT-36 عليها؛ واختبارات جهاز المالك؛ وتقرير القبول AT-01 إلى AT-48 على الحزمة النهائية؛ والاستخدام الذاتي؛ وحارس النزاهة يحمل الأثر غير المراجَع (G-DEV12-05).
- الفحوص: <PROGRESS_CHECKS>
- الـcommits: 994a4f2 إلى <HEAD>
- التالي: جولة الفحص الخارجية (ORG-19) ثم الدمج ووسم الإصدار.
```

## ملاحظات للجلسة الرئيسية

- **ملفات خارج النطاق:** لا شيء. (`docs/tracking/env-decisions.md`: صفوف E-14 وE-18 وE-19 وتفاصيلها تكتبها DEV-13 وحدها بموجب docs/waves/README.md القسم 6.)
- **وسم الإصدار:** عند الدمج يُوسم الإصدار مع `DEV-13-closed` (الخطة 25، جدول الموجات)؛ المقترح `v0.1.0` بالإصدار في `package.json`.
- **تحديث `traceability.md`:** الحالات في `docs/acceptance/AT-report.md`.
- **المالك:** D-DEV13-02 (صفّا الدليل والتراخيص في «حول») يُعرض عليه مع اعتماد الفروق كما في DEV-11 وDEV-12. <OWNER_NOTES>
- **التنظيف بعد الإغلاق:** `apps/desktop/out/` ومجلد العمل وفرعه؛ و`~/Applications/AYAR.app` و`~/AYAR-acceptance/` و`~/Documents/AYAR-acceptance/` بقرار المالك.
