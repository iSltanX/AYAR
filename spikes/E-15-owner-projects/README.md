# E-15 — مشاريع المالك الحقيقية (اكتشاف للقراءة فقط)

**المعيار (الخطة 22):** تعديل الكاشفات والافتراضات حيث تختلف الإعدادات الفعلية، وتوثيق غير المدعوم.

**الإذن (decisions.md، E-15):** Rasd وTars وWasl **للقراءة فقط**: لا يُشغَّل فيها أي أمر، ولا يُكتب شيء (ولا `.ayar/`)، ولا تُنسخ محتوياتها، وملفات الأسرار تُسجَّل بأسمائها دون قراءة.

## الملفات

- `discover.mjs`: سكربت تجربة يطبّق قواعد C-06 (قائمة التخطي، والعمق 12، و100 ألف مدخل، و2 م.ب لملف الإعداد، ولا تتبع روابط رمزية)، ويقرأ ملفات الإعداد المعروفة فقط، ويصنّف السكربتات بأسمائها (لا يسجل نصوص الأوامر)، ويجرد كل ملف (الحجم والوقت) قبل الاكتشاف وبعده. النتائج: `results/<project>.json` و`results/summary.md`.

## الإعادة

```bash
~/.nvm/versions/node/v24.16.0/bin/node spikes/E-15-owner-projects/discover.mjs
```

## النتائج (2026-10-10)

| المشروع | المدخلات | الزمن | المدير / القفل | النوع | السكربتات | الاختبارات | الجودة | ملفات حساسة (بالاسم) | ملفات تغيّرت |
|---|---|---|---|---|---|---|---|---|---|
| **Rasd** (إضافة متصفح، TypeScript) | 2,415 | 39 مللي ثانية | `packageManager: pnpm@11.11.0` / `pnpm-lock.yaml` + `pnpm-workspace.yaml` | إضافة MV3 عبر **CRXJS** (`@crxjs/vite-plugin`) + Vite + Vitest + Playwright + ESLint + Prettier + fast-check | **83** سكربتًا (5 اختبار، 7 فحص أنواع، 4 تدقيق، 4 بناء، 59 أخرى؛ 5 مركبة: `build` و`build:all` و`typecheck` و`check` …) | 353 ملف وحدة، 8 ملفات رحلات | ESLint مسطح، tsconfig | `.npmrc` | **0** من 35,236 |
| **Tars** (تطبيق سطح مكتب) | 11,740 | 90 | لا `packageManager` / `package-lock.json` | **Tauri 2** (`src-tauri/Cargo.toml`، 50 ملف Rust) + **Svelte** + Vite | 5 (تشغيل 2، بناء 1، svelte-check 1) | لا ملفات اختبار بأنماط الأطر | لا مدقق؛ tsconfig | `.env.example` | **0** من 71,626 |
| **Wasl** (إضافة Obsidian) | 201 | 3 | لا `packageManager` / `package-lock.json` | **إضافة Obsidian** (`manifest.json` بـ `minAppVersion`، تبعية `obsidian`) + esbuild + Vitest | 9 (4 مركبة: `build` و`check` و`version` و`prepare`؛ `version` يستدعي git) | 19 ملف وحدة | لا مدقق؛ tsconfig | لا شيء | **0** من 2,515 |

وفي الثلاثة: لا `.ayar/` أُنشئ، ولا رابط رمزي، ولا مسح جزئي.

### ما يختلف عن افتراضات C-06 (يُعدَّل في DEV-4)

1. **Manifest المولَّد (Rasd):** لا `manifest.json` في الجذر ولا `src/` ولا `public/`؛ الموجود في مجلدات مخرجات (`artifacts/design/ext/` و`dist-firefox/`) يبنيه CRXJS من مصدر TypeScript. فالكاشف يتعرف إطار CRXJS من التبعية ويعلن «Manifest يُولَّد بالبناء» فتعتمد `sec.ext.manifest` و`sec.ext.permissions` على `code.build` (العلاقة موجودة في 10.3)، ولا يقرأ Manifest من `artifacts/` (مجلد مخرجات غير مذكور في القائمة الافتراضية `dist/build/out/.output`؛ يُقرأ من إعداد البناء أو يُعلن في الملف).
2. **إضافة Obsidian (Wasl):** `manifest.json` بلا `manifest_version` وبه `minAppVersion` و`id`، مع تبعية `obsidian`. قاعدة التصنيف: ليست إضافة متصفح؛ و`sec.ext.manifest` غير منطبق؛ ونسخة ثانية من Manifest داخل `test-vault/.obsidian/plugins/wasl/` (خزنة اختبار) يجب ألا تُعد مكوّنًا.
3. **`packageManager` أقدم من المثبت (Rasd):** `pnpm@11.11.0` والمثبت 12.8.1، وpnpm عبر corepack سينزّل 11.11.0 ما لم يُمنع (E-07) ← «يحتاج تجهيزًا» مع ذكر النسختين، أو تشغيل 12.8.1 بـ `COREPACK_ENABLE_NETWORK=0` و`manage-package-manager-versions=false` إن اعتمده المستخدم.
4. **السكربتات بمتغير بيئة أو خيارات Node في أولها** (`RASD_TARGET=firefox vite build` و`NODE_OPTIONS=--max-old-space-size=4096 …`): تصنيف الأداة يتخطى تعيينات البيئة، وتُنقل التعيينات إلى بيئة المثيل كمتغيرات صريحة غير سرية (C-09).
5. **عدد السكربتات الكبير (83):** الاقتراح يعرض المصنفة (اختبار وأنواع وتدقيق وبناء) ويطوي «أخرى»؛ و5 منها مركبة فتُعامل كما في C-15 (استدعاء الأداة المحلية مباشرة).
6. **`pnpm-workspace.yaml` بلا `workspaces` في package.json (Rasd):** الملف يكفي للمكوّنات (C-06 يذكره)، وقد يكون لإعدادات pnpm فقط (`allowBuilds` و`minimumReleaseAge`، G-DEV1-02) دون حزم؛ فغياب `packages:` فيه لا يعني مساحة عمل.
7. **Tauri (Tars):** الواجهة Svelte/Vite مدعومة، والجزء Rust اكتشاف وفحوص مخصصة فقط (17)؛ وبلا اختبارات ولا مدقق: `beh.unit` ناقص و`code.lint` غير منطبق مع بطاقة اقتراح، و`code.types` عبر `svelte-check` (المحول يعرفه، C-15).
8. **خطافات مخصصة (Wasl `.githooks/`، وسكربت `version` يستدعي git):** لا يُشغَّل أي منها (T2)، وتُذكر معلومةً.
9. **مجلد مخرجات غير قياسي:** `eval/out` (Tars) و`artifacts/` (Rasd) خارج القائمة الافتراضية؛ تُقرأ إعدادات البناء (`outDir` في Vite) لتكملة القائمة.
10. **سياسة الصلاحيات (Rasd):** موجودة توثيقًا في `Docs/ADR/permissions.md` و`Docs/Store/permissions.md` لا بصيغة آلية؛ `sec.ext.permissions` «ناقص إعداد» حتى تُعلن في الملف (يمكن الإشارة إلى الملف التوثيقي).
11. **التعريب والاتجاه:** Rasd بـ `_locales` (7 ملفات) وصفحات تعلن `dir="rtl"`؛ وTars بملف i18n وRTL؛ فتنطبق فحوص `design.rtl.*` كما تفترض الخطة.

### غير المدعوم (كما في 17)

Rust في Tars (`cargo test`/`clippy`) إلا فحصًا مخصصًا؛ ولا شيء آخر خارج الحدود.

## القرار

الافتراضات صالحة في جملتها (المنظومات: pnpm وnpm، وVite/Svelte، وVitest/Playwright/ESLint، وManifest V3)، والكاشفات تُعدَّل في النقاط 1–6 و9 (CRXJS وObsidian وcorepack وتعيينات البيئة في السكربتات وpnpm-workspace بلا حزم ومجلدات المخرجات من إعداد البناء)، وتُوثق النقاط 7 و8 حدودًا وملاحظات. **لا يتغير نص الخطة**؛ هذه تفاصيل تنفيذ C-06 لـ DEV-4.
