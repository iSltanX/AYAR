# E-17 — فتح الملف في المحرر عند السطر

**المعيار (الخطة 22):** قوالب لـ VS Code وCursor وZed وXcode، والافتراضي `open` للملف. و**قرار المالك المفوَّض (decisions.md، E-17):** الافتراضي `open`، والقوالب الأربعة تُعرض لما يُكتشف مثبتًا؛ تتحقق DEV-2 على جهاز المالك من `open` ومن Xcode عند السطر، ومن الثلاثة الأخرى بمراجعها الرسمية، ويجوز تنزيل أحدها للتجربة خارج المستودع دون تثبيت في `/Applications` ودون جعله افتراضيًّا.

## الملفات

- `run.mjs`: الكشف (معرّفات الحزم بـ `mdfind`، ومسارات `/Applications`، وأوامر سطر الأوامر)، والتطبيق الافتراضي لكل نوع ملف عبر `NSWorkspace.urlForApplication(toOpen:)` (سكربت Swift صغير، بلا فتح)، والقوالب بمراجعها، وتجربة `xed --line 3 -b` و`open -g`، وVS Code 1.141.0 منزَّلًا إلى `~/.cache/ayar-dev2/editors` ببيانات مستخدم وإضافات مؤقتة ثم إغلاقه. النتائج في `results/run.json`.

## الإعادة

```bash
~/.nvm/versions/node/v24.16.0/bin/node spikes/E-17-editor/run.mjs [--no-vscode]   # يفتح Xcode في الخلفية وتطبيق .md الافتراضي وVS Code المؤقت لثوانٍ
```

## النتائج (2026-10-10)

### 1. الكشف على جهاز المالك

| المحرر | معرّف الحزمة | موجود | سطر الأوامر |
|---|---|---|---|
| Xcode | `com.apple.dt.Xcode` | `/Applications/Xcode.app` (27.0، 27A266a) | `/usr/bin/xed` |
| VS Code | `com.microsoft.VSCode` | لا | لا `code` |
| Cursor | `com.todesktop.230313mzl4w4u92` | لا | لا |
| Zed | `dev.zed.Zed` | لا | لا |

### 2. التطبيق الافتراضي لأنواع الملفات (LaunchServices)

| الامتداد | التطبيق الافتراضي |
|---|---|
| `.ts` | **QuickTime Player** (`.ts` = MPEG transport stream) |
| `.md` | Katib |
| `.py` و`.json` | Notepad Pro |

فالقالب الافتراضي `open <file>` المجرد لا يصلح لكل الامتدادات؛ و`open -t <file>` يفتح محرر النصوص الافتراضي للنص (بلا سطر).

### 3. القوالب ومراجعها

| المحرر | القالب | المرجع |
|---|---|---|
| Xcode | `xed --line <N> [-b] <file>` | `xed --help` (Xcode 27): «-l, --line <number> Select line <number> after opening file»، و`-b` يبقي Xcode في الخلفية |
| VS Code | `code --goto <file>:<line>[:<col>]` (أو `-g`) | توثيق سطر أوامر VS Code: `--goto` «Open a file at the path on the specified line and character position» |
| Cursor | `cursor --goto <file>:<line>[:<col>]` | واجهة Cursor لسطر الأوامر مشتقة من VS Code وتقبل الأعلام نفسها (توثيق Cursor) |
| Zed | `zed <file>:<line>[:<col>]` | توثيق Zed: «zed path:line:column» |
| الافتراضي | `open -t <file>` للنص، و`open <file>` لغيره | `man open`: `-t` يفتح بمحرر النصوص الافتراضي |

### 4. التجارب الفعلية

| التجربة | النتيجة |
|---|---|
| `xed --line 3 -b sample.ts` | خرج 0 في 2–3 ث، وأطلق Xcode (لم يكن يعمل قبلها في التشغيل الأول؛ بقي مفتوحًا ولم يُغلق لأنه تطبيق المالك) |
| `open -g sample.md` | خرج 0 → Katib |
| **VS Code 1.141.0** (`VSCode-darwin-arm64.zip`، 328,788,027 بايت، SHA-256 `9b4ae386…45f42d`، 10.5 دقائق تنزيل؛ موقّع «Developer ID Application: Microsoft Corporation (UBF8T346G9)»؛ بلا حجر) | `code --version` → 1.141.0 (`2a59476c…`، arm64)؛ `code --goto sample.ts:3:5 --new-window --disable-extensions --user-data-dir <tmp> --extensions-dir <tmp>` خرج 0 في 1.1 ث والتطبيق يعمل، ثم أُغلقت النسخة المؤقتة بكل عملياتها (0 عملية باقية). في التشغيل الأول لم يُغلق لأن نمط الإغلاق استهدف `MacOS/Electron` والملف الحقيقي `MacOS/Code`؛ أُصلح وأُعيد |

**يحتاج الشاشة (طلب اختياري للمالك، 3 خطوات في نحو دقيقتين):** هل حدد Xcode السطر 3 في `sample.ts`؟ وهل فُتح `sample.md` في Katib؟ وهل وقف VS Code عند 3:5؟ الخروج 0 وإطلاق التطبيقات مثبتان، وتحديد السطر لا يُقرأ دون الشاشة أو إذن Automation (لم يُطلب تجنبًا لحوار إذن).

## القرار

- القوالب الأربعة كما في الجدول، تُعرض لما يُكتشف (معرّف الحزمة عبر LaunchServices/`mdfind` أو أمر سطر الأوامر في PATH) ويختار المستخدم منها.
- **الافتراضي `open -t` للملفات النصية** (ولا سطر)، و`open` المجرد لغير النص، لأن `open` بامتداد مثل `.ts` يفتح QuickTime (G-DEV2-02). هذا تطبيق قرار المالك المفوَّض مع ضبط صغير يُسجَّل في D-DEV2-05.
- **لا يتغير نص الخطة.**
