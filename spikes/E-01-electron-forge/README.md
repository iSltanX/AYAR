# E-01 — نسختا Electron وForge، والخط ثابت العرض المعروض

**المعيار (الخطة 22):** Forge 8 إن نجحت الخطوات دون التفاف، وإلا 7.11.2 مؤقتًا. وأحدث Electron مستقر ينجح في الخطوات نفسها، ولا إصدار خارج الدعم.

**الخطوات المطلوبة:** التغليف، وقراءة الصمامات، والتوقيع المحلي، والفتح من Finder، وإنشاء `utilityProcess`، وفتح `node:sqlite`، والخط ثابت العرض المعروض فعلًا.

هذا المجلد أيضًا **التطبيق المشترك** لتجارب G-05 وE-04 وE-05 وE-23. كل تجربة تختار بناءها بمتغيرات البيئة الموصوفة في رأس [forge.config.js](forge.config.js).

## ما في التطبيق

- `src/main.js`: نافذة بإعداد 15.2 (`contextIsolation` و`sandbox` و`nodeIntegration: false` و`webSecurity`)، ومحتوى من بروتوكول `app://` لا من `file://`، وسياسة CSP الحرفية من 15.2 (دون `ayar-evidence:`)، ومنع التنقل والنوافذ، ورفض كل طلب إذن.
- حارس التصحيح عن بعد في أعلى `src/main.js` (أُضيف في G-05، D-52): يخرج برمز 78 إن طُلب منفذ Chromium للتصحيح دون مفتش Node نشط.
- `src/engine.mjs`: المحرك في `utilityProcess`، يفتح `node:sqlite` بسجل WAL. لا يستورد `electron`.
- الفحص الذاتي عند الإقلاع، ويكتب `~/Library/Application Support/AYAR Spike/selftest.json`:
  1. إنشاء المحرك، ثم فتح القاعدة وإدراج صف.
  2. التحقق من أن عالم الواجهة بلا Node (`typeof process/require/Buffer`).
  3. **الخط المعروض فعلًا** عبر بروتوكول أدوات المطوّر `CSS.getPlatformFontsForNode`. هذا هو الخط الذي رسم الحروف، لا المعلن في CSS.
  4. قتل عملية الواجهة بـ `SIGKILL`، ثم التحقق من أن المحرك حي بالـ pid نفسه وأن القاعدة تُقرأ، ثم إعادة تحميل النافذة.

## الإعادة

```bash
cd spikes/E-01-electron-forge
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin   # npm وnode في صدفة Claude Code دالتا nvm معطوبتان
/opt/homebrew/bin/npm ci
# Electron 44 لا ينزّل ملفه الثنائي عند التثبيت؛ يُنزَّل عند أول استخدام أو بهذا الأمر،
# ويتحقق من البصمة مقابل checksums.json المضمن في الحزمة:
/opt/homebrew/bin/node node_modules/electron/install.js

# 1) تغليف بالتوقيع الخاص الذي تعيده إضافة الصمامات وحده (للمقارنة فقط):
node_modules/.bin/electron-forge package
# 2) تغليف بتوقيع الحزمة كاملة عبر osxSign، بهوية خاصة "-":
SPIKE_IDENTITY=- SPIKE_DLV=1 node_modules/.bin/electron-forge package

APP="out/AYAR Spike-darwin-arm64/AYAR Spike.app"
node_modules/.bin/electron-fuses read --app "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
open -n "$APP" --args --auto-quit          # LaunchServices، المسار نفسه الذي يسلكه Finder
cat ~/Library/Application\ Support/AYAR\ Spike/selftest.json
```

## النتائج (2026-10-09، Electron 44.7.0، Forge 8.0.1)

الملفات الخام في [results/](results/).

| الخطوة | النتيجة | الدليل |
|---|---|---|
| التثبيت | Forge 8.0.1 (ESM، ويحتاج Node 22.13 فأحدث) مع npm 11.16.0 وNode 24.18.1. والملف الثنائي لـ Electron نُزّل يدويًا وبصمته مطابقة | — |
| التغليف | نجح، في ثوانٍ | `results/package-*.txt` |
| الصمامات | الستة في 15.2 كما يجب: `RunAsNode` و`EnableNodeOptionsEnvironmentVariable` و`EnableNodeCliInspectArguments` و`GrantFileProtocolExtraPrivileges` معطلة، و`EnableEmbeddedAsarIntegrityValidation` و`OnlyLoadAppFromAsar` مفعّلان | `results/fuses-final.txt` |
| التوقيع، المسار 1 | **غير صالح للحزمة**: إضافة الصمامات تعيد توقيع الملف التنفيذي وحده، فيبقى ختم الحزمة القديم (`invalid Info.plist`). والتطبيق يعمل، لكن `tccd` يعجز عن نسبته إلى هوية (`IDENTITY_ATTRIBUTION: Failed to copy signing info`) | `results/codesign-fuses-only-adhoc.txt` و`results/tcc-attribution-fuses-only-adhoc.txt` |
| التوقيع، المسار 2 | **صالح**: `valid on disk` و`satisfies its Designated Requirement`، والمعرّف `com.bysltan.ayar.spike` | `results/codesign-final.txt` |
| التشغيل المحصّن يمنع حقن المكتبات | `DYLD_INSERT_LIBRARIES` بمكتبة تكتب علامة: **حُقنت** في المسار 1 (بلا تشغيل محصّن، ضابط إيجابي)، و**لم تُحقن** في المسار 2 مع `disable-library-validation`. و`SIGUSR1` لا يفتح مفتش Node في المسار 2 | `results/dyld-and-sigusr1.txt` |
| التشغيل المحصّن دون Team ID | يرفض النظام تحميل `Electron Framework` (`Library Validation failed ... different Team IDs`). والحل استثناء `com.apple.security.cs.disable-library-validation` في التطبيق ومساعديه | `results/hardened-runtime-no-dlv.txt` |
| الفتح عبر LaunchServices وFinder | نجح، وأب العملية `launchd` (ppid = 1). وفي 2026-10-10 فُتحت حزم التطبيق نفسه بالنقر المزدوج في Finder (E-04 بناءان، وE-05) بالتحكم بالشاشة وعملت. ملاحظة: `open` ينقل بيئة مستدعيه إلى التطبيق، وFinder لا ينقلها (E-06) | `results/selftest-final.json` |
| `utilityProcess` | أُنشئ وفتح القاعدة، وعاش بعد قتل الواجهة بالـ pid نفسه، وقرأ القاعدة بعده | `steps.renderer.kill` |
| `node:sqlite` | SQLite 3.53.4، وسجل `wal`، ولا تحذيرات تجريبية | `steps.engine.sqlite` |
| الخط ثابت العرض | **Menlo-Regular** للاتينية. والعربية داخل المسار بالبديل التلقائي **Courier New** (15 حرفًا). وSF Mono لم يُستخدم | `steps.renderer.fonts` |
| CSP | صفر مخالفات | `cspViolations` |
| الحجم | التطبيق 302 ميغابايت، منها Electron Framework 299. ومضغوطًا بـ `ditto` 127 مليون بايت. وفي الحزمة 55 مجلد `.lproj` | `results/size.txt` |

## القرار

- **Electron 44.7.0 وForge 8.0.1.** نجحت الخطوات كلها على Forge 8 دون التفاف في Forge نفسه، فلا حاجة لتجربة 7.11.2. وElectron 44 مدعوم (42 و43 و44)، وElectron 45 يصدر مستقرًا في 20 أكتوبر 2026 فتُعاد التجربة عند الترقية.
- **التوقيع يمر دائمًا عبر `osxSign`، حتى في بناء التطوير.** لا يُكتفى بالتوقيع الذي تعيده إضافة الصمامات، لأن ختم الحزمة يبقى غير صالح ولا ينسب `tccd` الأذونات إلى هوية.
- **الاستحقاقات:** `allow-jit` و`disable-library-validation` للتطبيق ومساعديه، ولا شيء غيرهما. ومساعد الإضافات يحتفظ بمجموعة Chromium. ولا كاميرا ولا ميكروفون ولا موقع، خلافًا لافتراضي osx-sign. التفاصيل في D-50.
- **الخط ثابت العرض:** Menlo فعلًا، كما توقعت الخطة 16.4. والبديل العربي داخل الخط ثابت العرض Courier New، وهذا ملاحظة للتصميم (G-48).
