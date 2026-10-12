# تقرير القبول: AT-01 إلى AT-48 على حزمة الإصدار (DEV-13)

**البناء:** `AYAR.app` من commit `731c3f4` (apps/desktop، `npm run package`)، موقّعة بالهوية «AYAR Local Code Signing»، cdhash `a4b2df9395d1d69eb18e9ed3e1d9a4b390aad846`. والجولة على الشاشات واختبارات الواجهة على الحزمة المشتقة منها (D-51، الفرق بايت الصمام وحده: [perf/derive-for-acceptance.json](perf/derive-for-acceptance.json)).

**كيف قُرئت النتيجة:** «ناجح» حين نُفّذ الاختبار على الحزمة النهائية (أو على المحرك نفسه الذي تشحنه، عبر `tools/cli`) وطابق متوقَّعه؛ و«ناجح (مشروط)» حين قُبل بتوقع البديل المحسوم (الخطة 25)؛ و«جزئي» حين بقي جزء بشري لم يتيسر. ولا سطر بلا دليل مسجل.

## 1. الاختبارات

| الاختبار | الموضوع | النتيجة | الدليل | التاريخ |
|---|---|---|---|---|
| AT-01 | الاكتشاف لا ينفذ شيئًا والسر لا يُحفظ | <R01> | `tools/cli/test/at01.test.ts` و`packages/engine/test/malicious.test.ts` على FX-MALICIOUS المولَّد (صفر عمليات فرعية في الاكتشاف، ولا `git`، ولا ملفات علامة، والسر غائب عن مجلد البيانات) | <D> |
| AT-02 | مشروعان مختلفان | <R02> | `tools/cli/test/at02.test.ts` (FX-EXT وFX-PY مقابل ملفي التوقع، والإلغاء) | <D> |
| AT-03 | مشروع بلا اختبارات | <R03> | المحرك: `tools/cli/test/at07.test.ts` وFX-NOTEST في `packages/engine/test/at16.test.ts`؛ والواجهة على الحزمة المشتقة: `journey.e2e.ts` (بطاقة النقاء) و`notest.e2e.ts` (J4) | <D> |
| AT-04 | المسار العربي | <R04> | الحزمة المشتقة: `journey.e2e.ts` (الإضافة بالنافذة وبالسحب بتهجئتي NFD/NFC، والمسار على القرص لا يُعاد كتابته، والعرض معزول) | <D> |
| AT-05 | الاعتماد والتغيير المؤثر والأوامر الخطرة | <R05> | `tools/cli/test/at05.test.ts`؛ والواجهة: `screens.e2e.ts` | <D> |
| AT-06 | الجاهزية والتجهيز الصريح | <R06> | `tools/cli/test/at06.test.ts`؛ والواجهة: `screens.e2e.ts` | <D> |
| AT-07 | تركيب الفحص الكامل دون تكرار | <R07> | `tools/cli/test/at07.test.ts` (FX-EXT وFX-MONO) | <D> |
| AT-08 | أنماط التشغيل والإعادة | <R08> | الحزمة المشتقة: `journey.e2e.ts` و`screens.e2e.ts` | <D> |
| AT-09 | المؤشرات الحية | <R09> | الحزمة المشتقة: `journey.e2e.ts` (عينة كل ثانية تطابق القاعدة) | <D> |
| AT-10 | التقدم الصادق | <R10> | الحزمة المشتقة: `design.e2e.ts`؛ والمحرك `packages/engine/test/probe.test.ts` | <D> |
| AT-11 | الإلغاء وإنهاء الشجرة | <R11> | `tools/cli/test/at11.test.ts` على FX-PROC (الحفيد وsetsid والتفرع المزدوج وlaunchctl ومسح البيئة، بالملاحظة حيث يحدها E-22) | <D> |
| AT-12 | المهلة | <R12> | `tools/cli/test/at12.test.ts` | <D> |
| AT-13 | الانقطاع والتعافي والنوم | <R13> | المحرك: `tools/cli/test/at13.test.ts`؛ والتطبيق: `supervisor.e2e.ts` على الحزمة المشتقة؛ والنوم على جهاز المالك: [owner-evidence/](owner-evidence/) | <D> |
| AT-14 | رموز الخروج ودلالات التقارير | <R14> | `packages/engine/test/at14.test.ts` (كل صف بالأدوات الحقيقية) | <D> |
| AT-15 | التذبذب | <R15> | `packages/engine/test/at15.test.ts` | <D> |
| AT-16 | كشف العيوب المزروعة | <R16> | `packages/engine/test/at16.test.ts`: كل توقعات مشاريع القسم 20 مطابقة، وصفر في السليمة | <D> |
| AT-17 | فحص التصميم بمرجع | <R17> | المحرك: `packages/engine/test/probe.test.ts`؛ والواجهة على المشتقة: `design.e2e.ts` | <D> |
| AT-18 | فحص التصميم دون مرجع | <R18> | المحرك: `probe.test.ts`؛ والواجهة: `notest.e2e.ts` | <D> |
| AT-19 | حالات الواجهة والخدمة المرافقة | <R19> | `packages/engine/test/probe.test.ts` و`tools/cli/test/services.test.ts` | <D> |
| AT-20 | الإضافة داخل المضيف | <R20> | `packages/engine/test/probe.test.ts` (الوضع الخفي E-11 مسجل) | <D> |
| AT-21 | حساب العيار | <R21> | `packages/engine/test/purity.test.ts`؛ والواجهة: `journey.e2e.ts` | <D> |
| AT-22 | قابلية مقارنة العيار | <R22> | `packages/engine/test/compare.test.ts` و`integrity.test.ts`؛ والواجهة: `screens.e2e.ts` | <D> |
| AT-23 | توجيه الإصلاح وأمانه | <R23> | `packages/engine/test/reports-cards.test.ts`؛ والواجهة: `journey.e2e.ts` (الحافظة) | <D> |
| AT-24 | دورة الإصلاح وحارس النزاهة | <R24> | `packages/engine/test/integrity.test.ts` (أ إلى ح، ومعها (ط) G-DEV12-05)؛ والواجهة: `screens.e2e.ts` | <D> |
| AT-25 | استكمال الجولة | <R25> | `packages/engine/test/integrity.test.ts` (AT-25 الخطوات الثلاث) | <D> |
| AT-26 | الحفظ والتعافي والاحتفاظ | <R26> | `tools/cli/test/at26.test.ts` و`packages/engine/test/storage.test.ts`؛ والحزمة: صلاحية مجلد البيانات 0700 في `security.e2e.ts` | <D> |
| AT-27 | التصدير دون أسرار | <R27> | `packages/engine/test/reports.test.ts`؛ والواجهة: `design.e2e.ts` | <D> |
| AT-28 | اللغتان والاتجاه والإعدادات | <R28> | `packages/i18n/test/*` (تغطية 100% وصيغ الجمع للأعداد الستة)؛ والحزمة المشتقة: `screens.e2e.ts` (التبديل وبقاؤه) | <D> |
| AT-29 | المحتوى غير الموثوق في العرض | <R29> | الحزمة المشتقة: `journey.e2e.ts`؛ و`apps/desktop/test/file-inside.test.ts` | <D> |
| AT-30 | إعداد Electron واستقلال المحرك | ناجح | حزمة الإصدار نفسها: `tools/packaging/checks.mjs` (الصمامات ومسارات التصحيح بضابط إيجابي: [perf/checks-release.json](perf/checks-release.json) و[perf/checks-control.json](perf/checks-control.json))؛ والحزمة المشتقة: `security.e2e.ts` (العزل وCSP والتنقل والنوافذ والأذونات والمرسِل) وصفر مخالفات CSP في كل ملفات E2E؛ وقاعدة منع `electron`: `packages/engine/test/no-electron-rule.test.ts` | <D> |
| AT-31 | لا شبكة افتراضيًا | ناجح | `sh packages/engine/test/support/at31.sh` (صندوق `sandbox-exec` يسجل كل اتصال) | <D> |
| AT-32 | سلسلة الأدوات عند الفتح من Finder | <R32> | المحرك على جهاز المالك: `AYAR_AT32=1 vitest run tools/cli/test/at32.owner.test.ts`؛ والفتح من Finder: [owner-evidence/](owner-evidence/) | <D> |
| AT-33 | أذونات الخصوصية | <R33> | جهاز المالك ويده (E-04 بالبديل D-53: الأذونات تبقى والمفتاح في ملف 0600): [owner-evidence/](owner-evidence/) | <D> |
| AT-34 | الآثار الجانبية والجاهزية | <R34> | `tools/cli/test/at34.test.ts` | <D> |
| AT-35 | سلامة تجهيز الأدوات وتقادم الكتالوج | <R35> | `tools/cli/test/at35.test.ts`؛ والواجهة: `screens.e2e.ts` | <D> |
| AT-36 | أهداف الأداء | ناجح | [perf/](perf/): خط الأساس ثم القبول على القيم المعايرة (E-14) | <D> |
| AT-37 | بطاقات المهام ودورتها | <R37> | `packages/engine/test/verify-cards.test.ts` و`tasks.test.ts`؛ والواجهة: `notest.e2e.ts` | <D> |
| AT-38 | صحة المستشار | <R38> | `packages/engine/test/advisor.test.ts` | <D> |
| AT-39 | متانة القراءة | <R39> | `packages/engine/test/at39.test.ts` بحد الاستجابة المعاير (E-14) | <D> |
| AT-40 | إتاحة واجهة عِيَار | <R40> | axe في كل ملفات E2E على الحزمة المشتقة بالوضعين؛ وقائمة VoiceOver الموقّعة: [owner-evidence/](owner-evidence/) | <D> |
| AT-41 | أزرار النافذة واتجاه اللغة | <R41> | جهاز المالك (E-23/D-54): اللقطات الأربع في [owner-evidence/](owner-evidence/)؛ و`apps/desktop/test/main-pure.test.ts` (الموضع من لغة النظام) | <D> |
| AT-42 | تاريخ Git دون تنفيذ إعدادات المستودع | <R42> | `packages/engine/test/malicious.test.ts` (المستودع الظلي E-24) | <D> |
| AT-43 | «لك» و«للنموذج» والزر الوحيد | <R43> | المحرك: `reports-cards.test.ts` (التطابق والعبارات الممنوعة)؛ والواجهة: `journey.e2e.ts`؛ والقارئ وJ10: [owner-evidence/](owner-evidence/) | <D> |
| AT-44 | فحوص النموذج والادعاءات والمطابقة | <R44> | `packages/engine/test/ai-results.test.ts`؛ والواجهة: `notest.e2e.ts` | <D> |
| AT-45 | الخطوة التالية بحسب النتيجة | <R45> | المحرك: `reports-cards.test.ts`؛ والواجهة: `journey.e2e.ts` | <D> |
| AT-46 | قسم النزاهة ووسوم التكلفة | <R46> | `packages/engine/test/integrity.test.ts`؛ والواجهة: `screens.e2e.ts` | <D> |
| AT-47 | المشاريع متعددة الحزم | <R47> | `packages/engine/test/at16.test.ts` (FX-MONO) و`tools/cli/test/at07.test.ts` | <D> |
| AT-48 | بيئة العمليات الفرعية والتقارير الخام | <R48> | `tools/cli/test/at48.test.ts` و`packages/engine/test/boot.test.ts` | <D> |

## 2. التشغيلات التي تثبت الجدول

| التشغيل | الأمر | النتيجة | التاريخ |
|---|---|---|---|
| الحزمة الكاملة على commit البناء | `npm run verify` | <VERIFY> | <D> |
| E2E على الحزمة المشتقة (7 ملفات، دون ملفَي المعرض) | `AYAR_E2E_APP=<derived> vitest run -c vitest.e2e.config.ts` | نجح: 81 من 81 في 351 ث | 2026-10-12 |
| AT-30 على حزمة الإصدار والضابطة | `tools/packaging/checks.mjs` | نجح: الصمامات التسعة مطابقة لـ 15.2، والمسارات السبعة مغلقة على حزمة الإصدار (الثلاثة البعيدة بخروج 78)، ومفتوحة الأربعة الممكنة على الضابطة ([perf/checks-release.json](perf/checks-release.json) و[perf/checks-control.json](perf/checks-control.json)) | 2026-10-12 |
| إعادة البناء من مستودع نظيف | `tools/packaging/reproduce.sh` | نجح: استنساخ `731c3f4` و`npm ci` و`npm run package` بالهوية نفسها (المستنسخ 1.1 غ.ب وأُزيل): 265 ملفًا متطابقًا، و`app.asar` بايتًا ببايت، وكل Mach-O متطابق بعد نزع توقيعه، وcdhash متساوٍ لثلاثة عشر ملفًا تنفيذيًّا طرفيًّا؛ وcdhash الحزمة والإطارين «مختوم فوق التوقيعات» (D-DEV13-08). والجولتان الأوليان أخفقتا في أداة المقارنة لا في البناء (G-DEV13-02 وD-DEV13-08) | 2026-10-12 |
| قوة الاختبارات (Q-05) | `npm run test:mutation` | نجح: 1612 طافرة في 25 دقيقة و52 ثانية، المجموع 79.47%؛ المصنّف 84.00% (210/250)، والنقاء 76.87% (266/346)، والإخفاء 75.38% (340/451)، والمخطِّط 82.30% (465/565)؛ وبوابة Q-05 «كل مكوّن 70% أو أكثر» مجتازة | 2026-10-12 |
| AT-31 في شبكة مراقبة | `sh packages/engine/test/support/at31.sh` | نجح (الجولة الثانية): لا اتصال من عِيَار ولا من أدواته، و`code.refs.external` «ناقص: الشبكة غير مسموح بها»، و55 سطر رفض في نافذة الاختبار كلها مفسَّرة (فحص Chromium لقابلية IPv6 من متصفح المسبار، وصفر مقبس آخر يغادر الجهاز). والجولة الأولى أخفقت قبل أن تبدأ لأن ذاكرة uv كانت قد أُزيلت من الجهاز (G-DEV13-03) | 2026-10-12 |
| AT-32 (المحرك) على جهاز المالك | `AYAR_AT32=1 vitest run tools/cli/test/at32.owner.test.ts` | <AT32> | <D> |
| AT-36 | `tools/perf/discovery.ts --judge` و`AYAR_PERF_JUDGE=1 … at36.perf.ts` | نجح على القيم المعايرة (E-14): الاكتشاف 106 مللي ثانية وأول تقدم 84 لعشرة آلاف ملف؛ والتطبيق: إقلاع 222، واستجابة p95 1.6، و3 تحديثات في أزحم ثانية، وذروة البصمة 511 م.ب، وخمول 0% ([perf/discovery.json](perf/discovery.json) و[perf/app.json](perf/app.json)) | 2026-10-12 |

## 3. تعريف الاكتمال (الخطة 25) بندًا بندًا

| البند | الحالة | الدليل |
|---|---|---|
| كل FR وNFR منفذ، وكل AT ناجح ومنها اختبارات جهاز المالك؛ والمشروط مقبول بتوقع البديل | <P1> | الجدول 1 و`docs/tracking/traceability.md` |
| مشاريع الاختبار تكشف 100% من العيوب المزروعة ولا شيء في السليمة | <P2> | AT-16 |
| E-01 إلى E-25 محسومة، ومنها المعايرة بقيمها النهائية | <P3> | `docs/tracking/env-decisions.md` (E-14، E-18، E-19) |
| التقريران متطابقان آليًا في كل المشاريع، وقارئ غير متخصص أكمل J10 | <P4> | AT-43 |
| لا ادعاء نموذج ولا ملف تعليمات يظهر «اجتاز» | <P5> | AT-44 |
| عِيَار يفحص مستودعه دون إخفاقات حاجبة مفتوحة، ونقص كل فحص مطلوب مفسَّر | <P6> | [self-check/](self-check/) |
| البناء والتوقيع قابلان للتكرار من مستودع نظيف بملف قفل | متحقق | التشغيل 2 (reproduce)، و[perf/reproduce.json](perf/reproduce.json) |
| دليل استخدام مختصر بالعربية والإنجليزية داخل التطبيق | <P8> | «حول» ← دليل الاستخدام (`guide.*`)، و`screens.e2e.ts` |
| تراخيص الخطوط والمكتبات المضمّنة مرفقة في التطبيق | <P9> | «حول» ← التراخيص (`licenses.generated.ts` و`licenses.test.ts`) |
