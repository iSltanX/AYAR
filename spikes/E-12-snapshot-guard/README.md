# E-12 — منع كتابة اللقطات

**المعيار (الخطة 22):** الأعلام التي تعطي صفر كتابة، وإلا وضع CI للأداة بآثار موثقة.

**ما يُفحص:** مشاريع بلقطات ناقصة لـ Vitest وJest وPlaywright، وتأكيد صفر كتابة بفرق لقطة الحالة. على مكوّنات FX-ADAPTERS السليمة تُضاف اختبارات بلقطات ناقصة (`toMatchSnapshot` و`toMatchInlineSnapshot()` فارغة و`toMatchFileSnapshot` و`toHaveScreenshot`) ولقطة قديمة غير مستخدمة، ويُشغَّل كل إطار بأعلام C-15 وبدونها **دون متغير `CI`** (C-07 لا يضبطه)، ومع `CI=1` للمقارنة.

## الإعادة

```bash
~/.nvm/versions/node/v24.16.0/bin/node spikes/E-12-snapshot-guard/run.mjs    # النتائج في results/run.json
```

## النتائج (2026-10-10، Vitest 5.0.3، Jest 30.5.2، Playwright 1.64.0)

| الإطار | التشغيل | الخروج | ما كُتب في شجرة المشروع |
|---|---|---|---|
| Vitest | افتراضي (بلا أعلام، بلا CI) | 0 | **3 ملفات**: `__snapshots__/snap.test.js.snap` و`__snapshots__/file.txt` **وملف الاختبار نفسه** (اللقطة المضمّنة تُكتب داخله) |
| Vitest | **`--update=none`** (C-15) | 1 | **لا شيء**؛ «Snapshot … mismatched» للناقصة، والتقرير JSON يحمل `snapshot.unmatched`/`filesUnmatched` و`didUpdate: false` |
| Vitest | `CI=1` بلا أعلام | 1 | لا شيء (Vitest يختار `none` تحت CI) |
| Vitest | `--update=false` | 0 | **يكتب** (القيمة `false` تعني «لا تحديث للقديم» لا «لا كتابة للجديد») |
| Jest | افتراضي (بلا `--ci`) | 1 | `__snapshots__/snap.test.js.snap` **وملف الاختبار** (المضمّنة)، ويذكر «1 snapshot file obsolete» دون حذفه |
| Jest | **`--ci`** (C-15) | 1 | **لا شيء**؛ «New snapshot was not written. The update flag must be explicitly passed» |
| Jest | `CI=1` بلا `--ci` | 1 | لا شيء |
| Playwright | افتراضي (بلا أعلام) | 1 | `tests/snap.spec.js-snapshots/home-darwin.png` و`t-darwin.txt` («writing actual») **ويفشل** |
| Playwright | **`--update-snapshots=none`** (C-15) | 1 | **لا شيء**؛ «A snapshot doesn't exist at …» |
| Playwright | `CI=1` بلا أعلام | 1 | **يكتب الملفين** (CI لا يمنع الكتابة في Playwright) |
| Playwright | `--update-snapshots=missing` | 0 | يكتب الناقص ويمر |

وبقيت ملفات اللقطات القديمة غير المستخدمة كما هي في كل التشغيلات (لا حذف تلقائي). والتقارير (JSON) إلى مجلد خارج المشروع، و`--output` في Playwright إلى مجلد مؤقت فلا يُنشأ `test-results/` داخل المشروع.

**ملاحظة إعادة:** في التشغيل المتسلسل كُتبت اللقطة المضمّنة داخل ملف الاختبار في الحالة الافتراضية الأولى، ولم يستعدها السكربت (يحذف المضاف فقط)، فظهرت في التشغيلات اللاحقة «موجودة». أُعيد فحص `toMatchFileSnapshot` منفردًا بـ `--update=none`: رمز 1، `filesUnmatched: 1`، ولا ملف يُكتب (مسجل في README هذا لأن `results/run.json` يحمل التسلسل الأصلي).

## القرار

- **الأعلام تحقق المعيار (صفر كتابة):** Vitest `--update=none`، وJest `--ci`، وPlaywright `--update-snapshots=none`. كما في C-15 بالضبط، فلا تغيير.
- **لا يُعتمد على `CI`:** يمنع الكتابة في Vitest وJest لكنه **لا يمنعها في Playwright**، ويغيّر سلوك إعدادات المشاريع (C-07). والأعلام الصريحة هي الضمان.
- **للمحول (DEV-6):** اللقطة الناقصة نتيجتها «أخفق» من الأداة بسبب «لقطة مفقودة» (يُميَّز في Vitest من `snapshot.unmatched` و`filesUnmatched` في JSON، وفي Jest من رسالة «New snapshot was not written»، وفي Playwright من «A snapshot doesn't exist»)، فتُعرض اقتراحًا «اعتماد لقطات جديدة» لا إخفاق سلوك. واللقطات القديمة غير المستخدمة تُذكر معلومةً من الخرج دون حذف.
