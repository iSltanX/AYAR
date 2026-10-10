# سجل التبعيات والتراخيص

كل تبعية مباشرة لمستودع عِيَار بإصدارها المثبت وترخيصها ودورها. أنشأته DEV-3، وتضيف إليه الجلسة الرئيسية بعدها من قسم «التبعيات المضافة» في ملفات التسليم (docs/waves/README.md، القسم 6). والقائمة المرجعية في [الخطة 6.6](plan/AYAR-plan-2-architecture.md).

**القواعد:**

- الإصدارات مثبتة حرفيًا (`.npmrc`: `save-exact=true`) ومقفلة في `package-lock.json`، ويُبنى من مستودع نظيف بـ `npm ci`. ومدير الحزم npm بمساحات العمل (D-DEV3-01).
- الإصدار والترخيص من سجل npm (`npm view <الحزمة>@<الإصدار> version license`) في 2026-10-10.
- «يُشحن» أي يدخل حزمة التطبيق (مجمّعًا في `apps/desktop/dist/`)، فتلزم ملفات ترخيصه داخل التطبيق في DEV-13. وما سواه أدوات بناء واختبار لا تُشحن.

## 1. ما يُشحن داخل التطبيق

| الحزمة | الإصدار | الترخيص | الدور | المستخدم |
|---|---|---|---|---|
| electron | 44.7.0 | MIT | الغلاف، وفيه Node 24 وChromium (E-01). الملف الثنائي ينزّله `postinstall` من إصدارات Electron الرسمية ويتحقق من بصمته | `apps/desktop` |
| zod | 4.6.5 | MIT | مخططات البروتوكول، يُتحقق بها في الطرفين (D-29). تعمل دون JIT تحت CSP | `packages/protocol` |
| intl-messageformat | 12.1.3 | BSD-3-Clause | رسائل ICU بصيغ الجمع العربية الست (C-24) | `packages/i18n` |
| @formatjs/icu-messageformat-parser | 3.5.21 | MIT | تبعية intl-messageformat (غير مباشرة) | — |
| @formatjs/icu-skeleton-parser | 2.1.12 | MIT | تبعية intl-messageformat (غير مباشرة) | — |
| @formatjs/fast-memoize | 3.1.7 | MIT | تبعية intl-messageformat (غير مباشرة) | — |
| svelte | 5.57.2 | MIT | الواجهة؛ يُشحن منها وقت التشغيل المجمّع وحده | `apps/desktop` (الواجهة) |
| yaml | 2.9.1 | ISC | تحليل YAML في الاكتشاف (`pnpm-workspace.yaml` وworkflows) بالمخطط الأساسي دون وسوم مخصصة، وبحد للأسماء المستعارة. أضافته DEV-4 | `packages/engine` |
| smol-toml | 1.9.0 | BSD-3-Clause | تحليل TOML في الاكتشاف (`pyproject.toml` و`uv.toml`). أضافته DEV-4 | `packages/engine` |
| ignore | 7.0.12 | MIT | قواعد `.gitignore` المتداخلة في الاكتشاف (وفي الشجرة نسخة 5.3.2 أخرى تبعية لـ ESLint). أضافته DEV-4 | `packages/engine` |

و`node:sqlite` (طبقة التخزين، E-03) مضمّن في Node داخل Electron، فلا حزمة له.

## 2. البناء والتغليف (لا يُشحن)

| الحزمة | الإصدار | الترخيص | الدور |
|---|---|---|---|
| @electron-forge/cli | 8.0.1 | MIT | التغليف والتوقيع عبر `osxSign` (E-01، D-50) |
| @electron-forge/plugin-fuses | 8.0.1 | MIT | قفل الصمامات وقت التغليف (15.2) |
| @electron/fuses | 2.1.3 | MIT | قيم الصمامات وقراءتها (AT-30) |
| vite | 8.3.4 | MIT | تجميع الواجهة وpreload والعملية الرئيسية والمحرك |
| @sveltejs/vite-plugin-svelte | 7.3.1 | MIT | ترجمة مكونات Svelte في Vite |
| typescript | 6.0.3 | Apache-2.0 | فحص أنواع الواجهة والعملية الرئيسية، وما تقرؤه أدوات التدقيق (E-13، D-55) |
| @typescript/native (`npm:typescript@7.0.2`) | 7.0.2 | Apache-2.0 | فحص أنواع حزم المحرك بمساره الصريح (E-13، D-55) |
| svelte-check | 4.7.6 | MIT | فحص أنواع مكونات Svelte |
| eslint | 10.12.0 | MIT | التدقيق، ومنه قاعدة منع `electron` في `packages/**` (NFR-07) |
| typescript-eslint | 8.71.1 | MIT | التدقيق بمعلومات الأنواع |
| eslint-plugin-svelte | 3.23.1 | MIT | تدقيق مكونات Svelte |
| @types/node | 24.19.2 | MIT | أنواع Node 24 |

## 3. الاختبار (لا يُشحن)

| الحزمة | الإصدار | الترخيص | الدور |
|---|---|---|---|
| vitest | 5.0.3 | MIT | مشغّل اختبارات عِيَار للوحدة والخصائص والتكامل (E-13) |
| fast-check | 4.10.2 | MIT | اختبارات الخصائص (الخطة 19) |
| playwright-core | 1.64.0 | Apache-2.0 | قيادة Electron في اختبارات الأمان (G-05)؛ ويستخدمه المسبار لاحقًا (C-14) |

## 4. من قائمة 6.6 ولم يُضف بعد

تُضاف كل منها في مرحلتها حين تُستخدم، بإصدار يُتحقق منه وقتها (G-26).

| الحزمة | الإصدار في 6.6 | الترخيص | المرحلة المتوقعة |
|---|---|---|---|
| fast-xml-parser | 5.11.2 | MIT | DEV-6 (JUnit) |
| picomatch | 4.0.7 | MIT | لم تحتجه DEV-4 (الاكتشاف بـ `ignore`)؛ يُضاف حين تحتاجه مرحلة |
| pixelmatch | 8.0.0 | ISC | DEV-7 |
| axe-core و@axe-core/playwright | 4.14.0 و4.13.0 | MPL-2.0 | DEV-7، يُضمَّن دون تعديل |
| lucide | 1.54.0 | ISC | DEV-10 |
| better-sqlite3 | 13.0.3 | MIT | لا يُضاف: E-03 حسمت `node:sqlite` |
| خطا Almarai وCairo | — | OFL 1.1 | DEV-10 |
| **G-26:** @babel/parser | — | — | DEV-6 (المحللات، C-13) |
| **G-26:** postcss | — | — | DEV-6 (`design.tokens.static`) |
| **G-26:** مكتبة الضغط | — | — | DEV-5 (المحتوى المعنون، C-17)؛ وقد يكفي `node:zlib` المضمّن |

## 5. خلاصة تراخيص ملف القفل

`npm query '*'` على ملف القفل في 2026-10-10: 297 حزمة، منها 6 حزم عِيَار نفسها (`UNLICENSED`، خاصة). والبقية: MIT (224)، وApache-2.0 (24)، وISC (16)، وBSD-2-Clause (12)، وBlueOak-1.0.0 (9)، وBSD-3-Clause (3)، وMPL-2.0 (2: `lightningcss` وملفه الثنائي، أداة بناء في Vite لا تُشحن)، و`MIT OR CC0-1.0` (1). **لا ترخيص من عائلة GPL.**
