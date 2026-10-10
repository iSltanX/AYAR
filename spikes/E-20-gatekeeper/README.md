# E-20 — Gatekeeper والأدوات المُدارة

**المعيار (الخطة 22):** اعتماد الأدوات ذات الثنائيات الموقعة أو العاملة دون تعديل، وتوثيق الاستثناءات.

**ما يُفحص:** تثبيت كل أداة مُدارة وتشغيلها، وفحص سمة الحجر وتوقيعها (C-11). كل الأدوات هنا نُزّلت برمجيًّا (gh release download، أو pip/uv، أو Playwright، أو npm) بإصدارات مثبتة.

## الإعادة

```bash
~/.nvm/versions/node/v24.16.0/bin/node spikes/E-20-gatekeeper/run.mjs    # النتائج في results/run.json
```

## النتائج (2026-10-10، macOS 27.0.1، Gatekeeper «assessments enabled»)

### 1. الأدوات المُدارة بعد التنزيل البرمجي

| الأداة | الحجم | التوقيع | سمة الحجر | `spctl --assess --type execute` | تعمل؟ |
|---|---|---|---|---|---|
| Betterleaks 1.9.0 | 22 م.ب | ad-hoc (linker-signed)، لا Team ID | **لا** | rejected | ✓ |
| Gitleaks 8.30.1 (مُدار) و(Homebrew) | 20 / 15 م.ب | ad-hoc (linker-signed) | لا | rejected | ✓ |
| OSV-Scanner 2.6.0 | 53 م.ب | ad-hoc (linker-signed) | لا | rejected | ✓ |
| lychee 0.24.2 | 16 م.ب | ad-hoc (linker-signed) | لا | rejected | ✓ |
| cosign 3.1.3 | 133 م.ب | ad-hoc (linker-signed) | لا | rejected | ✓ |
| mise 2026.10.7 | 121 م.ب | **Developer ID Application: Jeffrey Dickey (4993Y37DX6)**، تشغيل محصّن | لا | accepted (origin=Developer ID) | ✓ |
| uv 0.13.0 (عبر pip) | 28 م.ب | **Developer ID Application: OpenAI OpCo, LLC (2DC432GLL2)**، تشغيل محصّن | لا | accepted (origin=Developer ID) | ✓ |
| semgrep-core 1.180.0 (داخل حزمة semgrep من pip) | 200 م.ب | ad-hoc (linker-signed) | لا | rejected | ✓ |
| node 24.18.1 (Homebrew، للمقارنة) | — | ad-hoc | لا | rejected | ✓ |
| **Chromium for Testing 156.0.8078.4** (Playwright، حزمة `.app`، 367 م.ب) | 367 م.ب | ad-hoc (linker-signed)، لا Team ID | لا | rejected: «code has no resources but signature indicates they must be present» | ✓ |

ملاحظة: `spctl --assess` يرفض كل ثنائي سطر أوامر بتوقيع ad-hoc (وحتى node من Homebrew)، وهذا طبيعي لأنه يقيّم بمعيار التوزيع (Developer ID + توثيق)، أما **البوابة الفعلية عند التنفيذ فهي سمة الحجر**: بلا حجر يعمل الملف مهما كان توقيعه.

### 2. هل يضع التنزيل البرمجي سمة الحجر؟

| الطريقة | `com.apple.quarantine` | السمات الموجودة |
|---|---|---|
| Node `https` → `fs.createWriteStream` (طريقة C-11 داخل `utilityProcess`) | **لا** | `com.apple.provenance` فقط |
| `curl -o` | لا | `com.apple.provenance` فقط |
| `gh release download` (الأدوات أعلاه) | لا | `com.apple.provenance` |

سمة الحجر يضعها ما يختار وضعها (المتصفحات ومدير التنزيلات في Chromium/Electron `session.downloadURL`، وBrowser-based LaunchServices)، لا مكتبات HTTP.

### 3. نسخة موسومة بالحجر يدويًّا (دون تشغيل)

على نسختين (gitleaks وosv-scanner) وُسمتا بـ `xattr -w com.apple.quarantine "0083;…;AYAR-E20;"`: تقييم `spctl` قبل الوسم وبعده «rejected» (لا توقيع قابل للتوزيع)، و`xattr -d` يزيل السمة. **لم تُشغَّل النسخة الموسومة** عمدًا: تشغيل ثنائي موسوم بالحجر وبتوقيع ad-hoc يستدعي حوار Gatekeeper على شاشة المالك ويقتل العملية (macOS 15 فما بعد بلا تجاوز بالنقر مع Control، S-11)، وهذا موثق لا مُجرَّب هنا.

## القرار

- **كل الأدوات المُدارة العشر تعمل دون تعديل** بعد التنزيل البرمجي، لأن طريقة C-11 (HTTPS في Node إلى ملف) لا تضع سمة الحجر. فلا حاجة لإزالة سمة ولا لاستثناء في إعدادات النظام.
- **التحقق في C-11:** البصمة المثبتة لكل ملف (D-13)، ثم التوقيع حيث يتاح: sigstore لـ Betterleaks (E-08)، وتوقيع Developer ID لـ mise وuv **بمعرّف الفريق المثبت في الكتالوج** (الأداة التي تغيّر فريق توقيعها بين إصدارين تُوقَف للمراجعة؛ وهذا أوضح مثال: ثنائي uv 0.13.0 موقّع باسم «OpenAI OpCo, LLC» لا باسم مشروع uv، فيُثبَّت الفريق الملاحَظ صراحة)، و`codesign --verify` للباقي يثبت فقط سلامة التوقيع الذاتي لا هوية.
- **الحماية من الحجر غير المقصود:** إن وُجدت السمة على ملف مُدار (مثلًا نُقل يدويًّا أو نُزّل بمتصفح) تُعرض «الأداة موسومة بالحجر» مع إرشاد إزالتها من المستخدم نفسه؛ ولا يزيل عِيَار السمة إلا عن ملف نزّله هو وتحقق من بصمته. و`spctl` لا يُستخدم معيارًا لأنه يرفض كل ثنائيات سطر الأوامر غير الموزعة.
- **الاستثناءات الموثقة:** Chromium for Testing غير موقّع بهوية (ad-hoc) و`spctl` يرفضه، ويعمل من مجلد Playwright لأنه بلا حجر؛ وإن عُطّل تحميله يومًا، فالبديل تنزيل Chrome for Testing بالبصمة نفسها بطريقة C-11. **لا يتغير نص الخطة.**
