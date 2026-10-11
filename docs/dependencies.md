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
| خط Cairo (متغير، `Cairo-Variable.ttf`) | google/fonts عند `a2c83dae` | OFL-1.1 | خط العناوين، مضمّن في الواجهة، وترخيصه في `public/licenses/`. أضافته DEV-10 | `apps/desktop` (الواجهة) |
| خط Almarai (Regular وBold) | google/fonts عند `3d8d20e8` | OFL-1.1 | خط النص، مضمّن في الواجهة، وترخيصه في `public/licenses/`. أضافته DEV-10 | `apps/desktop` (الواجهة) |
| أيقونات Lucide (المستخدمة وحدها، مولّدة في `icons.generated.ts` من lucide-static) | 1.48.0 | ISC | أيقونات الواجهة (A-12، D-DES2-03). أضافتها DEV-10 | `apps/desktop` (الواجهة) |
| @babel/parser | 8.0.7 | MIT | شجرة JS وTS لـ `code.complexity` (التعقيد الدوري وطول الدالة) دون تشغيل شيء. أضافته DEV-6 (G-26) | `packages/analyzers` |
| postcss | 8.5.29 | MIT | قراءة CSS لـ `design.tokens.static` و`design.fonts.static` و`design.rtl.static` ومراجع CSS في `code.refs.local`. أضافته DEV-6 (G-26) | `packages/analyzers`، و`packages/probe` (إسناد المصدر) |
| playwright-core | 1.64.0 | Apache-2.0 | قيادة Chromium في المسبار (C-14، E-11). يُشحن نسخة خارج الحزمة في `dist/engine/node_modules` (D-DEV7-02). وأدخلته DEV-7 في الشحن | `packages/probe` |
| axe-core | 4.14.0 | MPL-2.0 | فحص الإتاحة داخل صفحات المسبار (`design.a11y`)، ملفه `axe.min.js` بجانب المحرك. وفي الجذر 4.13.0 للاختبار (القسم 3). أضافته DEV-7 | `packages/probe` |
| pixelmatch | 7.2.0 | ISC | مقارنة الصور بمراجعها (G-28، D-DEV7-06). و6.6 تذكر 8.0.0، لكنه نُشر 2026-10-06 قبل المرحلة بخمسة أيام، فاختيرت 7.2.0. أضافته DEV-7 | `packages/probe` |
| pngjs | 7.0.0 | MIT | قراءة PNG وكتابته للمقارنة. أضافته DEV-7 | `packages/probe` |

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
| @types/pngjs | 6.0.5 | MIT | أنواع pngjs. أضافته DEV-7 |

## 3. الاختبار (لا يُشحن)

| الحزمة | الإصدار | الترخيص | الدور |
|---|---|---|---|
| vitest | 5.0.3 | MIT | مشغّل اختبارات عِيَار للوحدة والخصائص والتكامل (E-13) |
| fast-check | 4.10.2 | MIT | اختبارات الخصائص (الخطة 19) |
| playwright-core | 1.64.0 | Apache-2.0 | قيادة Electron في اختبارات الأمان (G-05)؛ وصار يُشحن مع المسبار (القسم 1) |
| lucide-static | 1.48.0 | ISC | مصدر عقد الأيقونات لمولّد `icons.generated.ts` وقت التطوير؛ لا تُشحن الحزمة نفسها. أضافتها DEV-10 |
| axe-core | 4.13.0 | MPL-2.0 | فحص الإتاحة في اختبارات Electron للواجهة (AT-40). أضافته DEV-10 |
| @stryker-mutator/core | 10.0.0 | Apache-2.0 | قياس قوة الاختبار على المصنّف والنقاء والإخفاء والمخطِّط (الخطة 19، Q-05)، بـ `npm run test:mutation`. أضافته DEV-6 |
| qs (تجاوز في الجذر) | 6.16.0 | BSD-3-Clause | تبعية غير مباشرة لـ `typed-rest-client` تحت Stryker، بتجاوز يسد ثغرتي 6.15.1 (G-DEV6-07، G-DEV6-09). أضافته DEV-6 |

## 4. من قائمة 6.6 ولم يُضف بعد

تُضاف كل منها في مرحلتها حين تُستخدم، بإصدار يُتحقق منه وقتها (G-26).

| الحزمة | الإصدار في 6.6 | الترخيص | المرحلة المتوقعة |
|---|---|---|---|
| fast-xml-parser | 5.11.2 | MIT | لم تحتجه DEV-6: قارئ XML داخلي محروس لـ JUnit (`packages/adapters/src/read/xml.ts`) |
| picomatch | 4.0.7 | MIT | لم تحتجه DEV-4 (الاكتشاف بـ `ignore`)؛ يُضاف حين تحتاجه مرحلة |
| pixelmatch | 8.0.0 | ISC | أُضيف 7.2.0 في DEV-7 (القسم 1) |
| @axe-core/playwright | 4.13.0 | MPL-2.0 | لا يُضاف: المسبار يحقن axe-core 4.14.0 مباشرة بـ `page.evaluate` (D-DEV7-11) |
| better-sqlite3 | 13.0.3 | MIT | لا يُضاف: E-03 حسمت `node:sqlite` |
| **G-26:** مكتبة الضغط | — | — | DEV-5 (المحتوى المعنون، C-17)؛ وقد يكفي `node:zlib` المضمّن |

## 5. خلاصة تراخيص ملف القفل

`npm query '*'` على ملف القفل في 2026-10-11 (بعد DEV-7): 456 حزمة، منها 10 حزم عِيَار نفسها (`UNLICENSED`، خاصة). والبقية: MIT (349)، وApache-2.0 (38)، وISC (24)، وBSD-2-Clause (12)، وBlueOak-1.0.0 (9)، وBSD-3-Clause (7)، وMPL-2.0 (4: `lightningcss` وملفه الثنائي، أداة بناء في Vite لا تُشحن، و`axe-core` 4.13.0 للاختبار، و`axe-core` 4.14.0 الذي يُشحن مع المسبار دون تعديل، فيُرفق نص ترخيصه ومصدره في الإصدار)، و`MIT OR CC0-1.0` (1)، وCC-BY-4.0 (1: `caniuse-lite`، بيانات تطوير تحت Stryker لا تُشحن)، و0BSD (1: `tslib`، تطوير). **لا ترخيص من عائلة GPL.**
