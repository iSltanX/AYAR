# E-13 — نسخة TypeScript لأدوات عِيَار، ومشغّل اختباراته

**المعيار (الخطة 22):** 6 للأدوات إن تعطلت مع 7. ويمكن 7 لفحص أنواع حزم المحرك. وVitest لاختبارات عِيَار **[توصية]** إن عمل مع الحزم كلها، وإلا node:test للمحرك.

## الهيكل

مستودع صغير بمساحات عمل npm، على هيئة 6.4:

- `packages/engine`: TypeScript بلا Electron. `src/verdict.ts` أنواع ومنطق نقي، و`src/io.ts` يستورد `node:fs`. واختبارات Vitest (`test/*.test.ts`) وnode:test (`test/*.node.test.ts`).
- `apps/desktop`: Svelte 5 بـ `<script lang="ts">` و`$props()`، ووحدة runes في `counter.svelte.ts`، واختبار Vitest يرسم المكوّن بـ `svelte/server` بنص عربي.
- **ضابط سلبي لكل أداة:** خطأ أنواع في `packages/engine/negative/bad-types.ts` و`negative-svelte/Bad.svelte`، ومخالفة تدقيق تحتاج معلومات الأنواع (`no-floating-promises`) في `negative-lint/`، واختباران فاشلان عمدًا. والفحص السلبي لا يُحسب ناجحًا إلا إن فشل للسبب المقصود، لا بانهيار الأداة.

## الإعادة

```bash
cd spikes/E-13-dev-tooling
./run-all.sh      # يثبت كل إعداد بدوره ويشغّل المصفوفة، وينتهي بالإعداد الجنبي مثبتًا
cat results/{ts6,ts7,hybrid}/summary.tsv
```

`run-matrix.sh <label> [tsc]` يشغّل المصفوفة على الإعداد المثبت حاليًا.

## النتائج (2026-10-10، Node 24.18.1، npm 11.16.0)

الإصدارات: svelte 5.57.2، وvite 8.3.4، و@sveltejs/vite-plugin-svelte 7.3.1، وsvelte-check 4.7.6، وtypescript-eslint 8.71.1، وeslint 10.12.0، وeslint-plugin-svelte 3.23.1، وvitest 5.0.3، و@types/node 24.19.2.

| الفحص | TS 6.0.3 وحده | TS 7.0.2 وحده | جنبًا إلى جنب (`typescript`=6.0.3 و`@typescript/native`=7.0.2) |
|---|---|---|---|
| `tsc` على المحرك، سليم / معيب | ✓ 0.35 ث / ✓ رمز 2 | ✓ 0.10 ث / ✓ **رمز 1** | ✓ 0.10 ث بـ TS 7 / ✓ رمز 1 |
| svelte-check، سليم / معيب | ✓ / ✓ | **✗ يرفض العمل** | ✓ / ✓ |
| svelte-check `--tsgo` (تشخيص TS 7) | — | — | ✓ / ✓ |
| typescript-eslint بمعلومات الأنواع، سليم / معيب | ✓ / ✓ | **✗ يرفض العمل** («does not support TS 7.0») | ✓ / ✓ |
| Vitest (المحرك وSvelte معًا)، سليم / معيب | ✓ 4 اختبارات / ✓ | ✓ / ✓ | ✓ / ✓ |
| node:test (المحرك، تجريد الأنواع في Node 24)، سليم / معيب | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |

الخرج الخام لكل فحص في `results/<الإعداد>/`، وخرج التثبيت في `results/install-*.txt`.

ملاحظة: `run-matrix.sh` يقبل أي رمز غير الصفر في الفحص السلبي. فخانتا «معيب» لـ svelte-check وtypescript-eslint في عمود TS 7 وحده ناجحتان شكلًا، لكن الأداة انهارت ولم تكشف شيئًا (`results/ts7/*.txt`). والجدول أعلاه يسجلهما ✗.

**ما ظهر أثناء التجربة:**

1. **npm لا يمنع TS 7 مع أدوات تشترط 6.** يثبته بتحذير `ERESOLVE overriding peer dependency`، فتنكسر الأدوات وقت التشغيل لا وقت التثبيت.
2. **رمز الخروج عند خطأ أنواع:** 2 في TS 6، و1 في TS 7. هذا يخص محول الأنواع في عِيَار (C-15)، الذي «يعرف النسختين».
3. **تصادم الاسم `tsc`:** الحزمتان تعلنان أمر `tsc`، فـ `node_modules/.bin/tsc` صار TS 7 مع أن `typescript` هو 6. فتُستدعى كل نسخة بمسارها الصريح.
4. **`svelte-check --tsgo` يكتب ملفات مترجمة داخل المشروع** (`.svelte-check/`)، ويقرأ كل ملفات `.svelte` في مساحة العمل متجاهلًا `include` في tsconfig. ولا يُستخدم في محول عِيَار لمشاريع المستخدم، لأنه أثر جانبي في المشروع المفحوص.
5. **أنواع الواجهة لا تستورد Node:** استيراد الواجهة نوعًا من ملف يستورد `node:fs` أفشل svelte-check، فقُسم المحرك إلى أنواع نقية و`io.ts`. وهذا درس مباشر لـ `packages/protocol`.
6. **قاعدتان في التدقيق تحتاجان استثناءً محدودًا بنوع الملف:** `$props()` في Svelte 5 نوعه `any` في الصيغة الموثقة، فـ `no-unsafe-assignment` يُطفأ لملفات `.svelte` وحدها. و`describe`/`it` في node:test تعيدان وعودًا، فـ `no-floating-promises` يُطفأ لملفات `*.node.test.ts` وحدها. وVitest لا يحتاج الثاني.

## القرار

- **TypeScript 6.0.3 حزمةً باسم `typescript`،** لأن svelte-check وtypescript-eslint تعطّلا مع 7. وهو ما تقرأه الأدوات وتفحص به الواجهة.
- **TypeScript 7.0.2 بالاسم المستعار `@typescript/native`،** يُستدعى بمساره الصريح لفحص أنواع حزم المحرك، كما يجيز المعيار. وهو أسرع بنحو 3.5 مرات هنا.
- **Vitest مشغّلًا لاختبارات عِيَار.** عمل مع الحزم كلها، المحرك والواجهة بـ Svelte، فتثبت التوصية. وnode:test لا حاجة له.
- **ترتيب الاسمين عكس نص الخطة:** الخطة 3.2 تذكر أن الأدوات تبقى على 6 «عبر `@typescript/typescript6`». والمجرَّب هنا ما يطلبه svelte-check نفسه: `typescript` = 6 و`@typescript/native` = 7. التفصيل في D-55.
- **في DEV-3:** المجلدات المعيبة عمدًا (`negative-lint/` و`negative-svelte/` و`packages/engine/negative/`) أمثلة تجربة، ولا تدخل أنماط تدقيق المستودع أو اختباراته.
