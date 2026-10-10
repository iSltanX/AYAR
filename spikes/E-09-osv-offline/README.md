# E-09 — OSV دون اتصال، والقاعدة المصغرة

**المعيار (الخطة 22):** أعلام تضمن عدم الاتصال وعدم تنفيذ شيفرة. وإن تعذرت القاعدة المصغرة، فلقطة مثبتة من مدخلات حقيقية.

**ما يُفحص:** تنزيل قواعد npm وPyPI إلى مجلد عِيَار، وقياس الحجم والزمن، وفحص دون اتصال، وصنع قاعدة مصغرة بحزمة وثغرة مزيفتين. ثم إكمال عيوب الثغرات في FX-EXT وFX-PY (وFX-ADAPTERS) وتحديث `fixtures/SANITY.md`.

## الملفات

| الملف | ما يفعله | النتائج |
|---|---|---|
| `download-db.mjs` | ينزّل القاعدتين بأعلام osv-scanner 2.6.0 نفسها إلى `~/.cache/ayar-dev2/osv-db`، ويقيس الزمن والحجم والتخطيط وعدد السجلات وصيغتها، ثم يفحص دون اتصال ثلاث مرات (منها مرة بوكيل HTTP وهمي) | `results/download-db.json` |
| `mini-db.mjs` | يبني القاعدة المصغرة من `fixtures/tools/osv-mini-db` ويفحص بها النسخ الست (معيبة وسليمة لكل من FX-ADAPTERS وFX-EXT وFX-PY) بـ `--all-packages` ووكيل وهمي | `results/mini-db.json` |
| `fixtures/tools/osv-mini-db/` | **القاعدة المصغرة نفسها** (خارج هذا المجلد، لأنها جزء من مشاريع الاختبار): سجلان `records/npm/AYAR-2026-0001.json` و`records/PyPI/AYAR-2026-0002.json` و`build.mjs` كاتب ZIP حتمي بلا تبعيات | — |

## الإعادة

```bash
N=~/.nvm/versions/node/v24.16.0/bin/node
$N spikes/E-09-osv-offline/download-db.mjs     # ينزّل 254 ميغابايت إلى ~/.cache/ayar-dev2/osv-db
$N spikes/E-09-osv-offline/mini-db.mjs
# مشاريع الاختبار بعد الإكمال:
$N fixtures/tools/sanity.mjs run FX-ADAPTERS good:osv osv--bad osv--no-lockfiles osv--config-error
$N fixtures/tools/sanity.mjs run FX-EXT good vuln-dep && $N fixtures/tools/sanity.mjs run FX-PY good vuln-dep
$N fixtures/tools/sanity.mjs report && $N fixtures/tools/validate.mjs
```

## النتائج (2026-10-10)

### 1. القاعدة الكاملة (`results/download-db.json`)

| القياس | النتيجة |
|---|---|
| الأمر | `osv-scanner scan source -r . --download-offline-databases --offline-vulnerabilities --no-call-analysis=all --format json --output-file …` مع `OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY=<مجلد>` |
| ما نُزّل | قواعد المنظومات التي وجدها في المشروع فقط: `npm/all.zip` **218.2 م.ب** (230,260 سجلًا) و`PyPI/all.zip` **36.0 م.ب** (26,216 سجلًا)؛ المجموع 242 م.ب على القرص |
| الزمن | **26.5 ثانية** للتنزيلين معًا (شبكة المالك) |
| التخطيط | `<cache>/osv-scalibr/<Ecosystem>/all.zip`، كل سجل ملف JSON باسم معرّفه (`GHSA-….json`)، بمخطط OSV 1.9.0، وتواريخ ZIP ثابتة (1980) |
| البصمات | npm `802734dd…eb160`، PyPI `ef5b682c…674f70` (لا بصمة منشورة من المصدر؛ تُسجَّل محليًّا مع `Last-Modified` و`ETag` من الترويسات) |
| الفحص دون اتصال | `--offline` (أو `--offline-vulnerabilities`): **6.0 ثوانٍ** لمشروع صغير، معظمها تحميل `npm/all.zip` في الذاكرة. ومع `HTTPS_PROXY=http://127.0.0.1:9` النتيجة نفسها والزمن نفسه: **لا اتصال** |
| تحليل الاستدعاء | معطل افتراضيًّا في 2.6.0 (يُفعَّل بـ `--call-analysis=go|rust` فقط)، و`--no-call-analysis=all` مقبول ويُمرَّر دائمًا للتأكيد (E-09: لا تنفيذ `build.rs`) |

### 2. القاعدة المصغرة (`results/mini-db.json`)

`build.mjs` يكتب ZIP بطريقة التخزين فقط (local headers + central directory + EOCD، وCRC-32 محسوب) و`unzip -t` يقبله. وosv-scanner يقرؤه بالمسار نفسه الذي يقرأ به القاعدة الكاملة:

| المشروع/النسخة | الخروج | الزمن | ما استُخرج وطُوبق |
|---|---|---|---|
| FX-ADAPTERS/osv--bad (قفل npm بسجل وهمي) | **1** | 220 مللي ثانية | `ayar-vuln-fake@1.0.0 ← AYAR-2026-0001`، وleft-pad@1.3.0 بلا ثغرة |
| FX-ADAPTERS/good | 0 | 41 | left-pad@1.3.0 فقط |
| FX-EXT/vuln-dep (pnpm-lock، تبعية `file:`) | **1** | 44 | **`ayar-vuln-fake@file:vendor/ayar-vuln-fake ← AYAR-2026-0001`**: يستخرجها بإصدار نصي هو المسار، ويطابقها لأن النطاق يبدأ من 0 |
| FX-EXT/good | 0 | 48 | 188 حزمة بلا ثغرة |
| FX-PY/vuln-dep (uv.lock، مصدر `directory`) | **1** | 44 | **`ayar-vuln-fake@1.0.0 ← AYAR-2026-0002`** |
| FX-PY/good | 0 | 42 | 19 حزمة بلا ثغرة |

الحجم: القاعدة المصغرة 8 كيلوبايت مقابل 242 ميغابايت؛ والفحص بها 40–220 مللي ثانية مقابل 6 ثوانٍ. وكل ذلك مع وكيل HTTP وهمي (لا اتصال).

### 3. إكمال مشاريع الاختبار

- **لا حاجة لمدخل قفل بسجل وهمي** (الاحتمال الذي سجلته DEV-1): OSV يقرأ تبعية `file:` من `pnpm-lock.yaml` وتبعية `directory` من `uv.lock` ويطابقهما. فبقيت النسخ كما هي، وأُزيلت علامات `pending: E-09` من ملفات التوقع الستة، وصار `sec.deps` تشغيلًا فعليًّا في `FX-ADAPTERS/sanity.mjs` و`FX-EXT/sanity.mjs` و`FX-PY/sanity.mjs`: يبني القاعدة المصغرة إلى `$TMPDIR/ayar-osv-mini-db` ثم يفحص بـ `--offline --no-call-analysis=all --format json --output-file`.
- **SANITY.md** أُعيد توليده: صفوف `sec.deps` الست «✓» (الخروج 1 للمعيبة بمعرّف الثغرة، و0 للسليمة)، ولم يبقَ صف «ينتظر E-09». و`validate.mjs`: 123 ملف توقع في 10 مشاريع.
- **ملاحظة لـ DEV-6:** إصدار الحزمة في تقرير OSV قد يكون نصًّا غير دلالي (`file:vendor/ayar-vuln-fake`) فمرساة بصمة الاكتشاف «الحزمة والإصدار ومعرّف الثغرة» تحتمل ذلك.

## القرار

- **الأعلام (C-15، صف OSV):** `osv-scanner scan source -r <root> --offline --no-call-analysis=all --format json --output-file <r>/osv.json` مع `OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY=<مجلد عِيَار>/osv-db`. تحقق المعيار: لا اتصال (أُثبت بالوكيل الوهمي) ولا تنفيذ شيفرة (تحليل الاستدعاء معطل صراحة). و`--output` مهجور فلا يُستخدم.
- **التجهيز (C-11):** `osv-scanner scan source -r <مشروع-قالب> --download-offline-databases --offline-vulnerabilities` حيث المشروع القالب يحوي ملف قفل لكل منظومة مدعومة (npm وPyPI)، لأن الأداة تنزّل قواعد المنظومات التي تراها فقط. الحجم المتوقع نحو 255 م.ب تنزيلًا و242 م.ب على القرص، والزمن نحو نصف دقيقة. ويُسجَّل تاريخ `Last-Modified` من ترويسة الاستجابة أو تاريخ التنزيل مع كل نتيجة (A-08 يؤيَّد: الإجراء صريح لا تلقائي).
- **رموز الخروج:** 0 لا ثغرات، و1 ثغرات، و**127** حين تغيب القاعدة دون اتصال («no offline version of the OSV database») ← «ناقص: قاعدة OSV غير مجهزة»، و128 لغياب ملفات القفل أو تلف أحدها (يُميَّز بالنص، G-DEV1-03).
- **القاعدة المصغرة ممكنة** (الفرع الأول في المعيار)، فلا حاجة للقطة مثبتة من مدخلات حقيقية. مكانها `fixtures/tools/osv-mini-db/`، وتُبنى وقت الاختبار ولا تُلتزم ملفات zip.
- **لا يتغير نص الخطة.**
