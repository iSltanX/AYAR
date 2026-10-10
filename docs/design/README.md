# التصميم: ملف Figma وحالته واعتماداته

هذا الملف المرجع الوحيد لحالة التصميم: أين الملف، وما فيه فعلًا، وما اعتمده المالك، وكيف يُسلَّم إلى التطوير. وقواعد العلاقة بين التصميم والواجهة في [AGENTS.md](../../AGENTS.md) القسم 7.

## 1. الملف

| البند | القيمة |
|---|---|
| الرابط | https://www.figma.com/design/UXkPakdqRuHDVTs78DO4uC/AYAR |
| مفتاح الملف | `UXkPakdqRuHDVTs78DO4uC` |
| المواصفة | [docs/plan/AYAR-figma-prompt.md](../plan/AYAR-figma-prompt.md)، مع القرارين D-48 وD-49 |
| المنفّذ | Claude عبر Figma MCP (انظر [CLAUDE.md](../../CLAUDE.md))، أو مصمم بشري يتسلم ملف المرحلة والبرومبت |

## 2. الحالة الفعلية للملف (تحديث DES-4، 2026-10-10)

**التدقيق الأولي (DES-1 المهمة 1، 2026-10-10، قراءة فقط):** طابق الملف ما سجله تدقيق 2026-10-09 حرفيًا: صفحتان فقط (`0:1` و`13:2`)، ولا متغيرات ولا أنماط. وعدد عقد الأرشيف 5336 (7 عقد عليا)، وعقد الهوية 420. وهذان الرقمان خط الأساس لفحص «لم يتغير».

| # | الصفحة | المعرّف | المحتوى | الحالة |
|---|---|---|---|---|
| 1 | `Cover` | `49:1052` | الإطار `58:2`: الاسم والرمز الملون (مادة تعريفية، D-49)، والإصدار والتاريخ، وفهرس الصفحات بحالاتها. وفي DES-4 صُحّحت حالات Cover وIdentity وFoundations إلى «معتمدة» (كانت «بانتظار الاعتماد» منذ DES-1)، والإصدار «0.4 · DES-4»، وحالات صفحات الشاشات | معتمدة (DES-1، 2026-10-10)؛ وتحديثات DES-4 بانتظار الاعتماد |
| 2 | `Identity` (كانت `AYAR — Final Identity`) | `13:2` | الأصل دون تغيير: قسم `30:1052` (الغلاف `30:1053` وإطار الهوية `30:1066`) وقسم المكونات `29:1052` (`AYAR / Symbol` `29:1077`). والإضافة: قسم `57:66` بإطار `57:67` «الاستخدام والنبرة»: الاستخدام الصحيح والخاطئ، ونطاق لون العُرف (D-49)، والنبرة، وإحالة D-48 | الأصل **معتمد (D-48)**، والإضافة معتمدة (DES-1، 2026-10-10) |
| 3 | `Foundations` | `49:1053` | `51:2` المقدمة، و`51:10` Primitives، و`52:2` Semantic، و`52:177` Status، و`53:2` جدول التباين، و`54:2` توفيق G-03، و`55:2` الطباعة، و`56:2` التخطيط والحركة | معتمدة (DES-1، 2026-10-10) |
| 4 | `Status System` | `49:1054` | تسعة إطارات `S-00`…`S-08` من `74:668` إلى `84:4530`: العائلات الخمس، والنتائج الاثنتا عشرة، ودورة التنفيذ، والجاهزية، ووسوم الاكتشاف، وفحوص النموذج والحالات الأخرى، والحكم وبطاقة النقاء، ودائرة التدريج، وأدلة التمييز والتباين. وقسم المكتبة `84:7055` بتسع مجموعات مكوّنات (الجدول أدناه) | معتمدة (DES-2، 2026-10-10) |
| 5 | `Icons` | `49:1055` | ستة إطارات `I-00`…`I-05` (`81:4` و`81:138` و`81:775` و`82:277` و`82:417` و`82:1200`): رموز الحالات، ومراجعة حجم 12، والبناء، وقواعد Lucide وأيقونات الوسوم، والانعكاس. وقسم المكتبة `84:7054`: مجموعة `Status symbol` `67:394` (51 متغيرًا)، وأيقونات الوسوم `68:4` (34)، ورموز الأحكام `68:182` (3)، وأمثلة Lucide العامة `68:196` (16) | معتمدة (DES-2، 2026-10-10) |
| 6 | `Components` | `49:1056` | `C-00` نظرة عامة وفهرس واتفاقية التسمية، ثم إطارات `C-0B` و`C-01` إلى `C-29` (المكوّنات الرئيسية ولوحة «داكن» تحت كل إطار)، و`C-icons` أيقونات Lucide المضافة. المكتبة في الجدول أدناه. وفي DES-4 أُضيف الإطار `C-30` (`139:10340`) بأربعة مكوّنات جديدة (الجدول أدناه) دون تعديل أي مكوّن معتمد | معتمدة (DES-3، 2026-10-10)؛ وإضافات `C-30` بانتظار الاعتماد (DES-4) |
| 7 | `Screens — AR Light` | `49:1057` | الشاشات 1–8 بالعربية فاتحًا: 37 إطارًا بمتغيراتها (الجدول في §7)، وتحت كل صف شاشة عنوان بما فيه. وربط أولي بالنموذج التفاعلي (نقطتا بدء: «J1 · أول مشروع» و«مشروع معروف») | DES-4 بانتظار اعتماد المالك؛ والشاشات 9–22 في DES-5 |
| 8 | `Screens — AR Dark` | `49:1058` | الشاشات 4 و6 و7 داكنًا: نسخ من إطارات الفاتح مضبوطة على وضع Dark في Primitives وSemantic وStatus | DES-4 بانتظار اعتماد المالك؛ و10 و16 في DES-5 |
| 9 | `Screens — EN Light` | `49:1059` | الشاشات 1 و6 و7 و8 بالإنجليزية (منعكسة، والتقرير بالقالب 12.4) | DES-4 بانتظار اعتماد المالك |
| 10 | `Flows` | `49:1060` | فارغة | DES-5 |
| 11 | `Guidelines` | `49:1061` | `G-00` (`118:16695`): مسودة اتفاقية تسمية المكونات من DES-3، وتكمل DES-5 الصفحة | DES-5 |
| 12 | `ARCHIVE — Explorations` | `0:1` | ثلاثة اتجاهات أولية (REFERENCE وEVIDENCE وVERIFICATION) لكل منها 10 إطارات من المفهوم إلى التطبيقات، ثم التقييم والمقارنة والاختيار، ثم أرشيف جلسات استكشاف النقّار. نُقلت الصفحة من أول القائمة إلى آخرها، ومحتواها لم يتغير (5336 عقدة) | **أرشيف لا يُمس** |

**ما في الهوية المعتمدة** (من التدقيق، للإحالة):

- الرمز: نقّار خشب مبني من دوائر هندسية؛ الفتحة على شكل «ع» والنقطة عين. والعُرف أحمر.
- الشعار الكتابي العربي بـ Almarai Bold، والإنجليزي «AYAR» بـ Sora SemiBold، وبديل مقارن بـ Cairo Bold. وSora خط المواد التعريفية في صفحة الهوية وحدها، لا خط واجهة.
- الشعار النصي التعريفي في الغلاف: «القياس يكشف الخلل، والدليل يثبت الحقيقة».
- ألوان الهوية: الفحمي `#141B20` (أساسي)، وأحمر العُرف `#A33D2F` (مميز، 5%)، والعاجي `#F7F4EC` (فاتح)، والرمادي المحايد `#59676C` (داعم).
- الحد الأدنى: الرمز الأساسي من 24 بكسل، ونسخة «بكسل» لحجم 16.

**الأسس في الملف (DES-1):**

| البند | المحتوى |
|---|---|
| المتغيرات | `Primitives` (46: `neutral/0`…`neutral/1000` و`<اللون>/100`…`700` للأخضر والأحمر والأزرق والكهرماني والبنفسجي) بوضعي Light وDark، و`Semantic` (13 بأسماء البرومبت) بوضعين، و`Status` (76: `result/<الحالة>`، و`cycle/…`، و`verdict/…`، و`tag/model-claim`، ولكل منها `fg` و`bg` و`border` و`icon`) بوضعين، و`Dimensions` (12) بقيمة واحدة. ولكل متغير نطاق (scopes) محدد وصيغة WEB `var(--…)` |
| قاعدة الأوضاع | الإطار يُضبط على وضع واحد في `Primitives` و`Semantic` و`Status` معًا، لأن مرادفات الأخيرتين تُقرأ من درجات `Primitives` في الوضع نفسه |
| الأنماط | 11 نمط نص بأسماء البرومبت، وظل واحد `shadow/overlay`، وشبكة `grid/4` |
| مصدر القيم | [DES-1/tokens.mjs](DES-1/tokens.mjs) يشتق القيم ويفحص التباين وقرب لون العُرف، ويكتب [tokens.json](DES-1/tokens.json) و[contrast.md](DES-1/contrast.md) |
| اللقطات المعتمدة | [approved/DES-1/](approved/DES-1/) (اعتمدها المالك 2026-10-10) |

**مكتبة DES-2 في الملف** (مكوّنات مربوطة بمتغيرات DES-1، و`Direction=RTL|LTR` كاتفاقية DES-3):

| المجموعة | المعرّف | الخصائص | المتغيرات |
|---|---|---|---|
| `Status symbol` (صفحة Icons) | `67:394` | `Symbol` (15 رمزًا وصيغتان ثابتتان) × `Size` (12، 16، 20) | 51 |
| `Result badge` | `70:276` | `Result` (12 نتيجة، و`missing-configuration`، و`passed-reviewed`، و`failed-reviewed`) × `Size` (sm، md) × `Direction` | 60 |
| `Readiness badge` | `70:317` | `Readiness` (5) × `Size` × `Direction` | 20 |
| `Cycle indicator` | `70:426` | `Cycle` (3) × `Motion` (animated، static) × `Size` × `Direction` | 24 |
| `Verdict badge` | `70:465` | `Verdict` (pure، incomplete، blocked) × `Direction` | 6 |
| `Tag` | `71:194` | `Kind` (neutral، neutral-icon، model-claim، provisional) × `Direction`؛ النص بتجاوز، والأيقونة بتبديل المكوّن المتداخل | 8 |
| `Severity` | `71:275` | `Severity` (5) × `Direction` | 10 |
| `Karat dial` | `71:536` | `Value` (0، 12، 19، 24، none) × `Size` (lg 120، sm 28) × `Tone` (default، muted) | 20 |
| `Section karat` | `71:627` | `Direction` | 2 |
| `Purity card` | `72:1070` | `Variant` (pure، incomplete، blocked، stale، integrity-hold، no-scope، narrow-scope) × `Direction` | 14 |

مصدر الفحوص: [DES-2/status-check.mjs](DES-2/status-check.mjs) يحسب ثنائيات DES-2 من `DES-1/tokens.json` ويطابقها مع قيم Figma ([figma-values.json](DES-2/figma-values.json))، ويكتب [checks.md](DES-2/checks.md). وفحص Figma الآلي في [figma-audit.json](DES-2/figma-audit.json)، وصور المراجعة ومحاكاة عمى الألوان في [DES-2/review/](DES-2/review/) و[DES-2/cvd/](DES-2/cvd/).

**مكتبة DES-3 في الملف** (صفحة Components، 62 مجموعة مكوّنات و471 متغيرًا، كلها مربوطة بمتغيرات DES-1 وأنماطها، وتستخدم مكتبة DES-2 نسخًا متداخلة):

| المكوّن (§9) | المجموعة | المعرّف | الخصائص | المتغيرات |
|---|---|---|---|---|
| أساس | `Button` | `98:310` | `Kind` (primary، secondary، quiet، destructive) × `State` × `Direction`؛ `Icon`، `Icon glyph` | 40 |
| أساس | `Icon button` | `98:343` | `State`؛ `Icon glyph` (بلا Direction: تُبدَّل الأيقونة الاتجاهية عند الاستخدام) | 5 |
| 1 | `Title bar` | `102:1666` | `Direction` × `Controls` (left، right) | 4 |
| 1 | `Window frame` | `102:2570` | `Direction` × `Controls`؛ `Run bar`، `Inspector` | 4 |
| 2 | `Sidebar` | `101:1355` | `Direction` | 2 |
| 2 | `Nav item` | `101:885` | `State` (default، hover، pressed، focus، selected، disabled) × `Direction`؛ `Badge`، `Icon glyph` | 12 |
| 2 | `Nav badge` | `101:783` | `Kind` (failures، missing) | 2 |
| 2 | `Nav group header` | `101:893` | `Direction` | 2 |
| 2 | `Project switcher` | `101:987` | `State` (default، hover، pressed، focus) × `Direction` | 8 |
| 3 | `Run bar` | `102:1452` | `Status` (running، cancelling) × `Direction` | 4 |
| 4، 5، 8 | مكتبة DES-2 | انظر جدولها أعلاه | — | — |
| 6 | `Check row` | `104:4196` | `Status` (queued، running، final، running-expanded) × `State` (default، hover، selected، focus) × `Direction`؛ `Silence note` | 26 |
| 7 | `Finding row` | `103:4015` | `State` × `Direction`؛ `Provisional` | 8 |
| 9 | `Section card` | `106:3951` | `Variant` (default، integrity، model-checks) × `Direction` | 6 |
| 10 | `Progress` | `106:4127` | `Kind` (count، percent، indeterminate) × `Direction`؛ `Estimate` | 6 |
| 11 | `Path pill` | `108:5579` | `Content` (latin، arabic-folders) × `State` (default، hover، focus) × `Direction` | 12 |
| 12 | `Command block` | `108:5868` | `State` × `Direction`؛ `Runs code`، `Writes`، `Network` | 6 |
| 13 | `Log viewer` | `108:6245` | `Follow` (on، off) × `Direction` | 4 |
| 14 | `Image diff viewer` | `109:6265` | `Mode` (side-by-side، overlay، slider) × `Direction` | 6 |
| 15 | `Capture tile` | `109:6740` | `Variant` (default، sensitive) × `State` × `Direction` | 12 |
| 16 | `Inspector` | `111:7922` | `Content` (check، check-reviewed، finding، finding-needs-model، log) × `Direction` | 10 |
| 17 | `Table` · `Table header cell` · `Table group row` | `112:8213` · `112:7887` · `112:7977` | `Kind` × `Direction` · `State` (default، hover، sorted-asc، sorted-desc، focus) × `Direction` · `Expanded` × `State` × `Direction` | 2 · 10 · 12 |
| 18 | `Search field` · `Text field` | `99:234` · `99:268` | `State` (default، hover، focus، filled، disabled) × `Direction` | 10 · 10 |
| 18 | `Select` | `99:342` | `State` × `Direction` | 10 |
| 18 | `Switch` | `99:428` | `On` × `State` (default، hover، focus، disabled) × `Direction`؛ `Label` | 16 |
| 18 | `Checkbox` | `100:399` | `Checked` (false، true، mixed) × `State` × `Direction`؛ `Label` | 30 |
| 18 | `Segment` · `Segmented control` | `100:453` · `100:483` | `Selected` × `State` × `Direction` · `Options` (2، 3) × `Direction` | 16 · 4 |
| 18 | `Tab` · `Tabs` | `100:549` · `100:607` | `Selected` × `State` × `Direction` · `Kind` (inspector، results) × `Direction` | 12 · 4 |
| 18 | `Argument editor` | `100:889` | `State` (default، focus) × `Direction` | 4 |
| 19 | `Sheet/Setup preview` · `Sheet/Approval diff` · `Sheet/Export report` · `Sheet/Re-run` | `114:8794` · `114:8898` · `114:9070` · `114:9290` | `Direction`؛ والتصدير `Variant` (default، evidence-bundle)، والإعادة `Variant` (failed، incomplete) | 2 · 2 · 4 · 4 |
| 19 | `Sheet/Save group` · `Sheet/Permission explanation` · `Sheet/Setup panel` · `Sheet/Scoring details` | `115:8941` · `115:8989` · `115:9207` · `115:9403` | `Direction` | 2 لكل منها |
| 19 | `Sheet/Baseline approval` · `Sheet/Human review` · `Sheet/Cancel confirmation` | `116:9091` · `116:9241` · `116:9269` | `Direction`؛ والمراجعة `Variant` (check، model-claim) | 2 · 4 · 2 |
| 19 | `Native alert/Destructive confirmation` | `116:9399` | `Kind` (remove-project، delete-runs، remove-tool، purge-data) × `Direction`: نصوص النافذة الأصلية (D-DEV3-15) | 8 |
| 19 | `Radio` | `114:8652` | `Selected` × `State` (default، hover، focus، disabled) × `Direction` | 16 |
| 20 | `Banner` · `Toast` | `117:9737` · `117:9781` | `Kind` × `Direction` | 4 · 6 |
| 21 | `Empty state` | `113:8501` | `Kind` (projects، no-runs، no-cards، no-model-needs، no-matching-findings) × `Direction` | 10 |
| 21 | `Term` · `Term tooltip` | `113:8529` · `113:8539` | `State` × `Direction` · `Direction` | 6 · 2 |
| 21 | `Context menu` · `Menu item` · `Menu separator` | `113:8383` · `113:8290` · `113:8293` | `Kind` (check-row، finding-row) × `Direction` · `State` (default، highlighted، disabled) × `Direction`؛ `Shortcut` · مكوّن مفرد | 4 · 6 · 1 |
| 22 | `Selection bar` | `112:8451` | `Kind` (checks، findings) × `Direction` | 4 |
| 23 | `Run menu` | `113:8766` | `Direction` | 2 |
| 24 | `Copy for model button` · `Copy for model bar` | `110:6568` · `110:6710` | `State` × `Direction` · `Context` (results، inspector، card-preview، instructions-preview) × `Direction`؛ `Tabs` | 10 · 8 |
| 25 | `Next step card` | `110:6954` | `Kind` (handle-directly، needs-model، needs-model-inspector، needs-review، nothing-required) × `Direction` | 10 |
| 26 | `Cost tag` | `103:2611` | `Cost` (local، network، model) × `Direction` | 6 |
| 27 | `Model check need card` | `117:9922` | `Variant` (ready، missing-input) × `Direction` | 4 |
| 28 | `Instructions preview` | `117:10063` | `Direction` | 2 |
| 29 | `Model claim row` | `117:10396` | `Variant` (with-local-check، no-local-check، decided-card، decided-not-issue) × `State` (default، hover، focus) × `Direction` | 16 |
| أيقونات | `Lucide/16/…` (49) و`Lucide/20/…` (4) | الإطار `97:4` | lucide-static 1.48.0، خط 1.5، بلون text/primary (currentColor) | 53 |

**اتفاقية التسمية** (مسودة في `C-00` و`G-00`، وDEV-10 يولّد الشيفرة منها): اسم المجموعة بالإنجليزية بحرف أول كبير كما في DES-2، والعائلات بـ «/» (`Sheet/Setup preview`)، وفي الشيفرة PascalCase (`SheetSetupPreview`). `Direction=RTL|LTR` في كل مكوّن له نص أو اتجاه، ويأتي في الشيفرة من سمة `dir` لا من خاصية. `State=default|hover|pressed|focus|disabled` ومعها selected وfilled وhighlighted وsorted-asc وsorted-desc حيث تنطبق؛ وhover وpressed وfocus حالات CSS، وselected وdisabled خصائص. والخصائص الأخرى بأسماء PascalCase وقيم kebab صغيرة. والمنطقية بكلمات (`Icon`، `Label`، `Run bar`…)، والتبديل `Icon glyph`. وأسماء الطبقات kebab-case تقرؤها الشيفرة (`label`، `icon`، `status`، `copy-for-model`، `focus-ring`، `selected-bar`…)، والنص يُتجاوز باسم الطبقة بلا خصائص نص (D-DES2-10).

مصدر الفحوص: [DES-3/component-check.mjs](DES-3/component-check.mjs) يحسب تباين الثنائيات المصدَّرة من Figma ([figma-pairs.json](DES-3/figma-pairs.json)) في الوضعين ويكتب [checks.md](DES-3/checks.md)، والتدقيق الآلي في [figma-audit.json](DES-3/figma-audit.json).

**إضافات DES-4 في صفحة Components** (الإطار `C-30` `139:10340`، بانتظار اعتماد المالك مع DES-4؛ مربوطة بمتغيرات DES-1 وتستخدم مكوّنات DES-2 وDES-3 نسخًا متداخلة):

| الشاشة | المجموعة | المعرّف | الخصائص | المتغيرات |
|---|---|---|---|---|
| 1 | `Drop zone` | `139:10348` | `State` (default، active) × `Direction` | 4 |
| 3 | `Risk notice` | `139:10350` | `Direction` | 2 |
| 6 | `Resource meter` | `139:10352` | `Direction` | 2 |
| 8 | `Report data block` | `139:10354` | `Direction` (لغة الوسم وحدها؛ المقطع يُقرأ من اليسار)؛ `Redaction line` | 2 |

**شاشات DES-4:**

- **التركيب (D-DES4-01، D-DES4-02):** كل شاشة نسخة من `Window frame` فُصلت (detach) لتملأ فتحتي المحتوى والمفتش، فبقي الشريط العلوي والشريط الجانبي وشريط التشغيل نسخًا مرتبطة. وما خارج النسخ إطارات تخطيط ونصوص فقط، وتعبئاتها وحدودها من متغيرات DES-1 (`bg/surface` و`bg/sunken` و`border/subtle` و`overlay`) ونصوصها بأنماط DES-1. والتدقيق في [DES-4/checks.md](DES-4/checks.md).
- **بيانات المثال (D-DES4-04):** «رصد» `~/projects/rasd`، والتشغيل `RUN-20261009-003` والجولة `ROUND-007`: 18 فحصًا شُغّل (اجتاز 13، وأخفق 2، وينقص 3) و4 غير منطبقة؛ والنطاق 13 معيارًا و15 فحصًا مطلوبًا (اجتاز 12، وأخفق 2، وينقص 1)، فالعيار 18 والحكم «محجوب» بإخفاق `beh.unit` الحاجب. والمتابعة على تشغيل لاحق جارٍ `RUN-20261009-004`.
- **الإطارات «كامل الطول»** صفحات قابلة للتمرير مصوّرة بطولها، والبقية بحجم النافذة الافتراضي 1360×860.

## 3. المراحل والاعتمادات

| المرحلة | ما تنتجه | تفتح للتطوير | الحالة | تاريخ الاعتماد | ملاحظات المالك |
|---|---|---|---|---|---|
| (قبل التنظيم) | الهوية: الرمز، والأيقونة، والتراكيب | — | معتمدة (D-48) | 2026-10-09 | «معتمد نقار الخشب» |
| [DES-1](../phases/design/DES-1-foundations.md) | تنظيم الملف، وإكمال الهوية، والأسس | DEV-10 (مع DES-2 وDES-3) | معتمدة | 2026-10-10 | «معتمد، بجواب المالك للجلسة الرئيسية». دون تعديلات، بعد عرض اللقطات العشر النهائية ورابط Figma. وقرارات G-03 وmono والتباين حسمتها الجلسة الرئيسية بتفويض المالك (ORG-13) |
| [DES-2](../phases/design/DES-2-status-icons.md) | نظام الحالات والرموز ودائرة العيار | DEV-10 (مع DES-1 وDES-3) | معتمدة | 2026-10-10 | «معتمد»: المالك صراحةً، عبر الجلسة الرئيسية، دون تعديلات، على الحالة عند `13e017b`، بعد عرض النقاط الأربع (زوج ناقص وغير منطبق بحجم 12، وخطوط «مبدئي»، وبطاقة «قديم»، وتعبئة «غير منطبق» في الفاتح) واللقطات S-01 وI-01 وI-02 وS-04 وS-06 وS-07. وقرارات D-DES2-02 و05 و06 أكدتها الجلسة الرئيسية بتفويض المالك (ORG-13) |
| [DES-3](../phases/design/DES-3-components.md) | المكونات التسعة والعشرون | DEV-10 (مع DES-1 وDES-2) | معتمدة | 2026-10-10 | «معتمد»: المالك صراحةً، عبر الجلسة الرئيسية، بلا ملاحظات، على الحالة عند `0459679`، شاملًا النقاط الخمس: ألوان التمرير والضغط (D-DES3-01)، وإطار النافذة بموضعي أزرار النظام، والتأكيد الأصلي للأوامر المدمرة الأربعة (D-DES3-06)، ورمز الحاسوب في «محلي» (D-DES3-11)، وعزل المقاطع العربية في المسار مع مكوّن Radio (D-DES3-04، D-DES3-08). بعد عرض اللقطات C-00 وC-0B وC-01 وC-06 وC-16 وC-24 وC-19/12 وC-26 ورابط صفحة Components |
| [DES-4](../phases/design/DES-4-core-screens.md) | الشاشات 1–8 | DEV-11 | بانتظار اعتماد المالك | — | — |
| [DES-5](../phases/design/DES-5-remaining-screens-flows.md) | الشاشات 9–22، والرحلات، والإرشادات | DEV-12 | لم تبدأ | — | — |

**الاعتماد** يكون بموافقة صريحة من المالك في المحادثة بعد عرض لقطات المرحلة. والجلسة الرئيسية تعرض اللقطات على المالك وتنقل جوابه إلى وكيل المرحلة، فيسجّل في هذا الجدول التاريخ وملاحظات المالك، ثم يسلّم المرحلة، وتغلقها الجلسة الرئيسية عند الدمج. ولا يُعد صمت المالك أو مضي الوقت اعتمادًا.

## 4. ما يُبنى قبل التصميم وما ينتظره

| يُبنى دون انتظار التصميم | ينتظر تصميمًا معتمدًا |
|---|---|
| مراحل التطوير DEV-0 إلى DEV-9 كلها: المحرك، والبروتوكول، و`tools/cli`، والغلاف الآمن، والجسر، ونقطة تركيب الواجهة **فارغة**، وآلية التعريب ومفاتيح المسرد | DEV-10: رموز التصميم والخطوط والحالات والمكونات (DES-1 وDES-2 وDES-3) |
| مسبار الويب (DEV-7)، لأنه يفحص واجهات مشاريع المستخدم لا واجهة عِيَار | DEV-11: الشاشات 1–8 (DES-4) |
| | DEV-12: الشاشات 9–22 (DES-5) |

## 5. قواعد العمل في الملف

1. **لا حذف ولا إعادة رسم** لما هو موجود دون موافقة المالك. والإضافة وإعادة تسمية الصفحات غير الهدامة مسموحتان.
2. **المتغيرات والأنماط والمكونات بأسماء البرومبت حرفيًا**، لأن DEV-10 يولّد الشيفرة منها.
3. **لون العُرف** خارج متغيرات الواجهة (D-49).
4. **تعديل ما اعتُمد** يعيد فتح مرحلته بقرار مسجل في [decisions.md](../tracking/decisions.md)، ويحدد المراحل البرمجية المتأثرة.

## 6. التسليم إلى التطوير

- عند إغلاق كل مرحلة تصميم: لقطات PNG للإطارات المعتمدة في `docs/design/approved/DES-N/` بأسماء الإطارات، وجدول معرّفات العقد في القسم 7 أدناه.
- في التطوير: القيم من Figma مباشرة (`get_variable_defs` و`get_design_context`)، واللقطات المعتمدة مرجع المطابقة البصرية.
- كل انحراف ضروري في الشيفرة عن التصميم يُسجَّل ويُعرض على المالك (AGENTS.md 7).

## 7. معرّفات العقد المعتمدة

تُملأ عند إغلاق كل مرحلة تصميم.

| المرحلة | الصفحة | الإطار أو المكوّن | المعرّف | اللقطة |
|---|---|---|---|---|
| — | `Identity` | الهوية النهائية | `30:1052` | — |
| — | `Identity` | `AYAR / Symbol` | `29:1077` | — |
| DES-1 | `Cover` | الغلاف والفهرس | `58:2` | `approved/DES-1/Cover.png` |
| DES-1 | `Identity` | الاستخدام والنبرة | `57:67` | `approved/DES-1/Identity-usage-and-voice.png` |
| DES-1 | `Foundations` | المقدمة | `51:2` | `approved/DES-1/F-00-foundations.png` |
| DES-1 | `Foundations` | Primitives | `51:10` | `approved/DES-1/F-01-primitives.png` |
| DES-1 | `Foundations` | Semantic | `52:2` | `approved/DES-1/F-02-semantic.png` |
| DES-1 | `Foundations` | Status | `52:177` | `approved/DES-1/F-03-status.png` |
| DES-1 | `Foundations` | جدول التباين | `53:2` | `approved/DES-1/F-04-contrast.png` |
| DES-1 | `Foundations` | توفيق G-03 | `54:2` | `approved/DES-1/F-05-g03-reconciliation.png` |
| DES-1 | `Foundations` | الطباعة | `55:2` | `approved/DES-1/F-06-typography.png` |
| DES-1 | `Foundations` | التخطيط والحركة | `56:2` | `approved/DES-1/F-07-layout-motion.png` |
| DES-2 | `Status System` | العائلات الخمس والقواعد | `74:668` | `approved/DES-2/S-00-status-system.png` |
| DES-2 | `Status System` | النتائج الاثنتا عشرة | `75:821` | `approved/DES-2/S-01-results.png` |
| DES-2 | `Status System` | دورة التنفيذ | `76:1317` | `approved/DES-2/S-02-run-cycle.png` |
| DES-2 | `Status System` | الجاهزية | `76:1696` | `approved/DES-2/S-03-readiness.png` |
| DES-2 | `Status System` | وسوم الاكتشاف | `77:1541` | `approved/DES-2/S-04-finding-tags.png` |
| DES-2 | `Status System` | فحوص النموذج والحالات الأخرى | `77:2266` | `approved/DES-2/S-05-model-checks-other-states.png` |
| DES-2 | `Status System` | الحكم وبطاقة النقاء | `78:2593` | `approved/DES-2/S-06-verdict-purity-card.png` |
| DES-2 | `Status System` | دائرة التدريج | `78:4097` | `approved/DES-2/S-07-karat-dial.png` |
| DES-2 | `Status System` | أدلة التمييز والتباين | `84:4530` | `approved/DES-2/S-08-distinction-contrast.png` |
| DES-2 | `Status System` | قسم المكتبة (9 مجموعات، الجدول في §2) | `84:7055` | `approved/DES-2/L-status-library.png` |
| DES-2 | `Icons` | نظرة عامة | `81:4` | `approved/DES-2/I-00-icons.png` |
| DES-2 | `Icons` | رموز الحالات | `81:138` | `approved/DES-2/I-01-status-symbols.png` |
| DES-2 | `Icons` | مراجعة حجم 12 | `81:775` | `approved/DES-2/I-02-12px-review.png` |
| DES-2 | `Icons` | البناء | `82:277` | `approved/DES-2/I-03-construction.png` |
| DES-2 | `Icons` | Lucide وأيقونات الوسوم | `82:417` | `approved/DES-2/I-04-lucide.png` |
| DES-2 | `Icons` | الانعكاس | `82:1200` | `approved/DES-2/I-05-mirroring.png` |
| DES-2 | `Icons` | قسم المكتبة: `Status symbol` `67:394`، وأيقونات الوسوم `68:4`، ورموز الأحكام `68:182`، وأمثلة Lucide `68:196` | `84:7054` | `approved/DES-2/L-icons-library.png` |
| DES-3 | `Components` | C-00 · نظرة عامة وفهرس واتفاقية التسمية | `118:10133` | `approved/DES-3/C-00-overview.png` |
| DES-3 | `Components` | C-0B · عناصر التحكم الأساسية (الأزرار وزر الأيقونة) | `98:4` | `approved/DES-3/C-0B-base-controls.png` |
| DES-3 | `Components` | C-01 · إطار النافذة والشريط العلوي | `102:1510` | `approved/DES-3/C-01-window-frame.png` |
| DES-3 | `Components` | C-02 · الشريط الجانبي | `101:767` | `approved/DES-3/C-02-sidebar.png` |
| DES-3 | `Components` | C-03 · شريط التشغيل | `102:1316` | `approved/DES-3/C-03-run-bar.png` |
| DES-3 | `Components` | C-04 · C-05 · C-08 · مكوّنات الحالات من DES-2 كما تُستخدم | `107:3937` | `approved/DES-3/C-04-05-08-status-components.png` |
| DES-3 | `Components` | C-06 · صف الفحص | `103:2672` | `approved/DES-3/C-06-check-row.png` |
| DES-3 | `Components` | C-07 · صف الاكتشاف | `103:3805` | `approved/DES-3/C-07-finding-row.png` |
| DES-3 | `Components` | C-09 · بطاقة القسم | `106:3659` | `approved/DES-3/C-09-section-card.png` |
| DES-3 | `Components` | C-10 · التقدم | `106:4063` | `approved/DES-3/C-10-progress.png` |
| DES-3 | `Components` | C-11 · حبة المسار | `108:5471` | `approved/DES-3/C-11-path-pill.png` |
| DES-3 | `Components` | C-12 · كتلة الأمر | `108:5630` | `approved/DES-3/C-12-command-block.png` |
| DES-3 | `Components` | C-13 · عارض السجل | `108:6031` | `approved/DES-3/C-13-log-viewer.png` |
| DES-3 | `Components` | C-14 · عارض فروق الصور | `109:5955` | `approved/DES-3/C-14-image-diff-viewer.png` |
| DES-3 | `Components` | C-15 · بلاطة اللقطة | `109:6412` | `approved/DES-3/C-15-capture-tile.png` |
| DES-3 | `Components` | C-16 · المفتش | `111:6802` | `approved/DES-3/C-16-inspector.png` |
| DES-3 | `Components` | C-17 · الجداول | `112:7799` | `approved/DES-3/C-17-tables.png` |
| DES-3 | `Components` | C-18 · عناصر الإدخال | `99:144` | `approved/DES-3/C-18-inputs.png` |
| DES-3 | `Components` | C-19 · النوافذ المنبثقة والتأكيد الأصلي | `114:8568` | `approved/DES-3/C-19-sheets.png` |
| DES-3 | `Components` | C-20 · الأشرطة والرسائل | `117:9685` | `approved/DES-3/C-20-banners-toasts.png` |
| DES-3 | `Components` | C-21 · الحالات الفارغة والتلميحات وقوائم السياق | `113:8252` | `approved/DES-3/C-21-empty-tooltips-menus.png` |
| DES-3 | `Components` | C-22 · شريط التحديد | `112:8395` | `approved/DES-3/C-22-selection-bar.png` |
| DES-3 | `Components` | C-23 · قائمة «شغّل» | `113:8662` | `approved/DES-3/C-23-run-menu.png` |
| DES-3 | `Components` | C-24 · «لك» و«للنموذج» وزر النسخ الوحيد | `110:6488` | `approved/DES-3/C-24-copy-for-model.png` |
| DES-3 | `Components` | C-25 · بطاقة «ماذا أفعل الآن» | `110:6810` | `approved/DES-3/C-25-next-step-card.png` |
| DES-3 | `Components` | C-26 · وسم التكلفة | `103:2539` | `approved/DES-3/C-26-cost-tag.png` |
| DES-3 | `Components` | C-27 · بطاقة احتياج فحص نموذج | `117:9822` | `approved/DES-3/C-27-model-check-need-card.png` |
| DES-3 | `Components` | C-28 · معاينة ملف التعليمات | `117:9969` | `approved/DES-3/C-28-instructions-preview.png` |
| DES-3 | `Components` | C-29 · صف ادعاء النموذج | `117:10108` | `approved/DES-3/C-29-model-claim-row.png` |
| DES-3 | `Components` | C-icons · أيقونات Lucide المضافة | `97:4` | `approved/DES-3/C-icons-lucide-additions.png` |
| DES-3 | `Guidelines` | G-00 · مسودة اتفاقية التسمية | `118:16695` | `approved/DES-3/G-00-component-naming.png` |
| DES-4 | `Cover` | الغلاف والفهرس (حالات مصححة وإصدار 0.4) | `58:2` | `approved/DES-4/Cover.png` |
| DES-4 | `Components` | C-30 · إضافات DES-4 (4 مكوّنات) | `139:10340` | `approved/DES-4/C-30-des4-additions.png` |
| DES-4 | `Screens — AR Light` | 1.1 · المشاريع — فارغة | `153:27966` | `approved/DES-4/S1-1-projects-empty.png` |
| DES-4 | `Screens — AR Light` | 1.2 · المشاريع — قائمة بثلاثة مشاريع | `153:28378` | `approved/DES-4/S1-2-projects-list.png` |
| DES-4 | `Screens — AR Light` | 2.1 · الاكتشاف — التقدم | `143:912` | `approved/DES-4/S2-1-discovery-progress.png` |
| DES-4 | `Screens — AR Light` | 2.2 · الاكتشاف — ما وجده عِيَار | `143:1352` | `approved/DES-4/S2-2-discovery-result.png` |
| DES-4 | `Screens — AR Light` | 2.3 · الاكتشاف — فشل | `143:1813` | `approved/DES-4/S2-3-discovery-failure.png` |
| DES-4 | `Screens — AR Light` | 2.4 · الاكتشاف — تحذير مسار واسع | `143:2231` | `approved/DES-4/S2-4-discovery-wide-path.png` |
| DES-4 | `Screens — AR Light` | 2.5 · الاكتشاف — شرح الإذن قبل الطلب | `143:2651` | `approved/DES-4/S2-5-discovery-permission-sheet.png` |
| DES-4 | `Screens — AR Light` | 3.1 · اعتماد ملف المعايير (كامل الطول) | `146:1396` | `approved/DES-4/S3-1-profile-approval-full.png` |
| DES-4 | `Screens — AR Light` | 3.2 · اعتماد ملف المعايير — تغييرات معلقة مع الفرق | `146:2316` | `approved/DES-4/S3-2-profile-pending-diff.png` |
| DES-4 | `Screens — AR Light` | 3.3 · اعتماد ملف المعايير — أمر خطر | `146:2979` | `approved/DES-4/S3-3-profile-dangerous-command.png` |
| DES-4 | `Screens — AR Light` | 4.1 · نظرة عامة — محجوب | `150:2589` | `approved/DES-4/S4-1-overview-blocked.png` |
| DES-4 | `Screens — AR Light` | 4.2 · نظرة عامة — غير مكتمل | `150:3921` | `approved/DES-4/S4-2-overview-incomplete.png` |
| DES-4 | `Screens — AR Light` | 4.3 · نظرة عامة — نقي، عيار 24 | `150:5098` | `approved/DES-4/S4-3-overview-pure-24.png` |
| DES-4 | `Screens — AR Light` | 4.4 · نظرة عامة — عيار 24، يمنع حكم ‹نقي›: بندان | `150:6317` | `approved/DES-4/S4-4-overview-24-integrity-hold.png` |
| DES-4 | `Screens — AR Light` | 4.5 · نظرة عامة — من جولة سابقة، تغيرت الشيفرة | `150:7538` | `approved/DES-4/S4-5-overview-stale.png` |
| DES-4 | `Screens — AR Light` | 4.6 · نظرة عامة — لم يُشغَّل فحص كامل بعد | `150:8767` | `approved/DES-4/S4-6-overview-no-full-scan.png` |
| DES-4 | `Screens — AR Light` | 4.7 · نظرة عامة — تفاصيل الاحتساب مفتوحة | `150:9672` | `approved/DES-4/S4-7-overview-scoring-details.png` |
| DES-4 | `Screens — AR Light` | 5.1 · خطة الفحص الكامل (كامل الطول) | `150:30128` | `approved/DES-4/S5-1-plan-full.png` |
| DES-4 | `Screens — AR Light` | 5.2 · خطة الفحص الكامل — لوحة التجهيز | `150:31163` | `approved/DES-4/S5-2-plan-setup-panel.png` |
| DES-4 | `Screens — AR Light` | 5.3 · خطة الفحص الكامل — تنبيه الاعتماد | `150:32286` | `approved/DES-4/S5-3-plan-approval-alert.png` |
| DES-4 | `Screens — AR Light` | 6.1 · متابعة التشغيل (كامل الطول) | `151:8399` | `approved/DES-4/S6-1-run-monitor-full.png` |
| DES-4 | `Screens — AR Light` | 6.2 · متابعة التشغيل — يُلغى… | `151:9508` | `approved/DES-4/S6-2-run-monitor-cancelling.png` |
| DES-4 | `Screens — AR Light` | 6.3 · متابعة التشغيل — توقف المحرك | `151:10555` | `approved/DES-4/S6-3-run-monitor-engine-stopped.png` |
| DES-4 | `Screens — AR Light` | 6.4 · متابعة التشغيل — توقف الجهاز | `151:11601` | `approved/DES-4/S6-4-run-monitor-sleep-gap.png` |
| DES-4 | `Screens — AR Light` | 7.1 · نتائج التشغيل — «لك»، محجوب، المفتش (كامل الطول) | `153:29037` | `approved/DES-4/S7-1-results-for-you-blocked.png` |
| DES-4 | `Screens — AR Light` | 7.2 · نتائج التشغيل — «للنموذج» والمفتش | `154:15258` | `approved/DES-4/S7-2-results-for-the-model.png` |
| DES-4 | `Screens — AR Light` | 7.3 · نتائج التشغيل — «الاكتشافات» مع التحديد | `153:29866` | `approved/DES-4/S7-3-results-findings.png` |
| DES-4 | `Screens — AR Light` | 7.4 · نتائج التشغيل — «الفحوص»: صفوف بمراجعة | `153:30726` | `approved/DES-4/S7-4-results-checks-reviewed.png` |
| DES-4 | `Screens — AR Light` | 7.5 · نتائج التشغيل — «الأدلة» | `153:31347` | `approved/DES-4/S7-5-results-evidence.png` |
| DES-4 | `Screens — AR Light` | 7.6 · نتائج التشغيل — «الآثار الجانبية» | `153:32008` | `approved/DES-4/S7-6-results-side-effects.png` |
| DES-4 | `Screens — AR Light` | 7.7 · نتائج التشغيل — غير مكتمل | `153:32647` | `approved/DES-4/S7-7-results-incomplete.png` |
| DES-4 | `Screens — AR Light` | 7.8 · نتائج التشغيل — نقي | `153:33273` | `approved/DES-4/S7-8-results-pure.png` |
| DES-4 | `Screens — AR Light` | 7.9 · نتائج التشغيل — إعادة فحص بعد تغير الشيفرة | `153:33857` | `approved/DES-4/S7-9-results-recheck-after-change.png` |
| DES-4 | `Screens — AR Light` | 7.10 · نتائج التشغيل — أُلغي التشغيل | `153:34456` | `approved/DES-4/S7-10-results-cancelled.png` |
| DES-4 | `Screens — AR Light` | 7.11 · نتائج التشغيل — نافذة الإعادة | `153:34991` | `approved/DES-4/S7-11-results-rerun-sheet.png` |
| DES-4 | `Screens — AR Light` | 8.1 · تقرير «للنموذج» — النص كاملًا (كامل الطول) | `154:15945` | `approved/DES-4/S8-1-model-report-full.png` |
| DES-4 | `Screens — AR Light` | 8.2 · تقرير «للنموذج» — تجاوز الحد | `154:16494` | `approved/DES-4/S8-2-model-report-over-limit.png` |
| DES-4 | `Screens — AR Dark` | 4.1 · نظرة عامة — محجوب (داكن) | `154:32388` | `approved/DES-4/D4-1-overview-blocked-dark.png` |
| DES-4 | `Screens — AR Dark` | 6.1 · متابعة التشغيل (داكن) | `154:32566` | `approved/DES-4/D6-1-run-monitor-dark.png` |
| DES-4 | `Screens — AR Dark` | 7.1 · نتائج التشغيل — «لك» (داكن) | `154:32635` | `approved/DES-4/D7-1-results-for-you-dark.png` |
| DES-4 | `Screens — EN Light` | 1.1 · Projects — empty | `154:34764` | `approved/DES-4/E1-1-projects-empty-en.png` |
| DES-4 | `Screens — EN Light` | 1.2 · Projects — list of three | `154:35176` | `approved/DES-4/E1-2-projects-list-en.png` |
| DES-4 | `Screens — EN Light` | 6.1 · Run monitor | `154:35836` | `approved/DES-4/E6-1-run-monitor-en.png` |
| DES-4 | `Screens — EN Light` | 7.1 · Run results — For you | `154:36871` | `approved/DES-4/E7-1-results-for-you-en.png` |
| DES-4 | `Screens — EN Light` | 8.1 · Report for the model (12.4) | `154:37706` | `approved/DES-4/E8-1-model-report-en.png` |
