# حزمة الإصدار الأول (DEV-13)

## 1. البناء والتوقيع

| البند | القيمة |
|---|---|
| الأمر | `cd apps/desktop && npm run package` (يبني الأهداف الأربعة بـ Vite ثم الأيقونة، ثم `electron-forge package`) |
| Electron / Forge | 44.7.0 / 8.0.1 (E-01) |
| الهدف | `darwin-arm64`، وأدنى نظام macOS 13.0 (E-02) |
| معرّف الحزمة | `com.bysltan.ayar` (Q-04)، والمساعدون تحت `com.bysltan.ayar.helper` |
| الهوية | «AYAR Local Code Signing» الذاتية الثابتة (E-04، D-53)، عبر `osxSign` دائمًا (D-50)، بالتشغيل المحصّن واستحقاقَي `allow-jit` و`disable-library-validation` وحدهما |
| المتطلب المعيّن | `identifier "com.bysltan.ayar" and certificate leaf = H"86526c3ec084f4676eecbd8d298c35eab3278364"` |
| الصمامات (15.2، D-53) | RunAsNode، وEnableNodeOptionsEnvironmentVariable، وEnableNodeCliInspectArguments، وGrantFileProtocolExtraPrivileges، وEnableCookieEncryption معطلة؛ وEnableEmbeddedAsarIntegrityValidation وOnlyLoadAppFromAsar مفعّلان |
| محتوى الأرشيف | `dist/` (engine، main، preload، renderer) و`package.json` وحدهما: 160 مدخلًا |
| الأيقونة | التكوين الذي اعتمده المالك (D-DEV13-10): بلاطة Apple (824 من 1024، استدارة 185) بأسود الشعار، وفتحة عش دائرية عاجية قطرها 600، ورمز AYAR المعتمد (D-48، SVG في `apps/desktop/icon/`) يطل منها بعُرفه فوق حافتها ومنقاره داخلها وجسمه مستندًا إلى أسفلها؛ مسطّحة بلا تدرّج ولا ظل، وبهوامش شفافة، تُرسم عند 1024 بـ `tools/packaging/render-appicon.mjs` ثم إلى `.icns` في البناء (`tools/packaging/make-icns.mjs`، ويرفض مصدرًا بلا قناة ألفا). التصدير الأول لإطار Figma `30:1445` كان مسطّحًا على أبيض فأظهر قناع macOS 26 حافة بيضاء حول البلاطة (D-DEV13-07). والمظهران الفاتح والداكن بالأيقونة نفسها (D-DEV13-03) |
| الحجم | نحو 337 ميغابايت على القرص |
| commit البناء | يُذكر في [AT-report.md](AT-report.md) |

**التحقق على الحزمة** (أمر وخرج في التقرير): `codesign --verify --deep --strict` → `valid on disk` و`satisfies its Designated Requirement`؛ و`codesign -d -r-` يعطي المتطلب أعلاه؛ و`electron-fuses read` يعطي الصمامات أعلاه؛ و`PlistBuddy` يقرأ المعرّف وأدنى نظام والفئة `public.app-category.developer-tools`.

## 2. حزمة الاختبار المشتقة (D-51)

`tools/packaging/derive.mjs` ينسخ حزمة الإصدار بـ `ditto`، ويقلب صمام `EnableNodeCliInspectArguments` وحده، ويعيد التوقيع بالهوية نفسها مع حفظ المعرّف والاستحقاقات والمتطلبات والأعلام والتشغيل المحصّن، ثم يقارن كل ملف: المختلف ثلاثة (الإطار، والملف التنفيذي، وختم الحزمة)، وبعد نزع التوقيعات **بايت واحد** في الإطار. وإن اختلف غير ذلك أو تغير المتطلب المعيّن، يحذف الحزمة ويخرج بـ 1 فلا يبدأ أي اختبار عليها. والحزمة مؤقتة تُحذف بعد التشغيل.

والحزمة الضابطة (الصمامات الثلاثة مفتوحة: RunAsNode وNODE_OPTIONS والمفتش) تُشتق بالطريقة نفسها لفحوص AT-30 الإيجابية.

وعلى الحزمة المشتقة وحدها يقبل التطبيق `--ayar-data-dir` كما يقبله بناء التطوير، لأن مفتش Node نشط تحت Playwright (D-DEV13-06): macOS يحلّ مجلد Application Support من سجل المستخدم لا من `HOME`، فلا سبيل غيره لإبقاء بيانات كل اختبار في مجلد مؤقت. وحزمة الإصدار تتجاهل المفتاح دائمًا (`apps/desktop/src/main/paths.ts`)، ولذلك تكتب فحوص AT-30 عليها (التي تشغّل التطبيق كاملًا) في مجلد بيانات المستخدم الحقيقي، فتزيله الجلسة بعدها إن لم يكن موجودًا قبلها.

## 3. AT-30 على الحزمة نفسها (`tools/packaging/checks.mjs`)

| المسار | حزمة الإصدار (المتوقع: مغلق) | الحزمة الضابطة (المتوقع: مفتوح) |
|---|---|---|
| `--inspect=0` | لا «Debugger listening» | يُفتح المفتش |
| `SIGUSR1` | لا مفتش | يُفتح المفتش |
| `--remote-debugging-port=0` و`-pipe` و`-address` | خروج 78 قبل فتح المنفذ (D-52)، ولا «DevTools listening» | خروج 78 كذلك (الحارس لا يتعلق بالصمام، والمفتش غير نشط دون `--inspect`) |
| `ELECTRON_RUN_AS_NODE=1` مع `-e` | يفتح التطبيق لا Node | يطبع من Node |
| `NODE_OPTIONS=--require=…` | يُتجاهل بصمت | يقرأه Electron (ويرفض `--require` في التطبيق المغلف بتحذير ظاهر) ولا يُنفَّذ الملف |

النتائج في [AT-report.md](AT-report.md). والجولة على الشاشات مع رصد مخالفات CSP وبقية اختبارات الواجهة تجري على الحزمة المشتقة (`AYAR_E2E_APP`).

## 4. إعادة البناء من مستودع نظيف (الخطة 25)

`tools/packaging/reproduce.sh <repo> <commit> <reference .app> <report.json>`: استنساخ الـcommit إلى مجلد مؤقت، و`npm ci` من ملف القفل، و`npm run package` بالهوية نفسها، ثم `compare-packages.mjs`: قائمة الملفات، وبصمة `app.asar` بايتًا ببايت (ما يشحنه عِيَار كله: المحرك والواجهة وpreload والعملية الرئيسية)، وكل ملف آخر بايتًا ببايت، وكل Mach-O بعد نزع توقيعه. ما يُتوقع أن يختلف هو كتلة توقيع CMS وحدها (تحمل وقت التوقيع). وcdhash كل ملف تنفيذي طرفي (المساعدون الأربعة، وchrome_crashpad_handler، والمكتبات، وShipIt، وMantle، وReactiveObjC) متساوٍ بين البناءين؛ أما cdhash الحزمة وإطار Electron وSquirrel فيختلف بالضرورة لأن ختم مواردها يبصم المكتبات والمساعدين المضمّنين ملفات كاملة بتوقيعها، فيتبع وقت التوقيع (D-DEV13-08)، ويُسجَّل في التقرير «مختوم فوق التوقيعات» لا اختلافًا. النتيجة في التقرير.
