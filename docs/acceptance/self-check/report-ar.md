# تقرير عِيَار لك — RUN-20261012-002 · repo

## ماذا حدث
فحصنا 264 فحصًا في 6 د و12 ث ضمن التشغيل RUN-20261012-002. هذه نتائجها:
- اجتاز: 14
- يحتاج مراجعة: 2
- ناقص: 4
- تعذّر: 18
- غير منطبق: 226
ولم ينطبق 226 فحصًا على مشروعك فلم يُشغَّل.

## ماذا يعني
الحكم: غير مكتمل · العيار: عيار 11 من 24
النطاق: 11 معيارًا، 34 فحصًا، 36 مثيلًا
غير مكتمل: العيار 11 من 24، وما ينقص: فحوص مطلوبة تحتاج مراجعة (2)؛ فحوص مطلوبة ناقصة (3)؛ فحوص مطلوبة تعذّرت (18)؛ فحص النزاهة integ.reviews لم يجتز (missing). ومعه 3 فحص ينتظر تجهيزًا. لا يصل المشروع إلى «نقي» حتى يُحسم كل بند منها.

## المشكلة وأثرها

### AYR-SEC-SAST-0063 — HTML يُكتب من قيمة غير ثابتة
- الشدة: متوسطة · اشتباه (إشارة تحتاج حكمك) · مستمر
- الموضع: fixtures/semgrep-rules/ayar.js.html-injection.js:4:3 — الأنماط الأمنية (`sec.sast`)
- ماذا حدث: HTML is written from a value that is not a constant (innerHTML, outerHTML, insertAdjacentHTML, document.write): check that it cannot carry markup from outside.
- الأثر لو بقي: إدراج HTML من نص غير موثوق يفتح الباب لحقن سكربت في صفحة المستخدم.
- الخطوة التالية (واحدة من أربع: تعالجها مباشرة، أو تحتاج نموذجًا، أو تحتاج مراجعتك، أو لا شيء مطلوب): تحتاج مراجعتك — «راجع وقرّر»: اشتباه يحتاج حكمك.

### AYR-SEC-SAST-0064 — HTML يُكتب من قيمة غير ثابتة
- الشدة: متوسطة · اشتباه · مستمر
- الموضع: fixtures/semgrep-rules/ayar.js.html-injection.js:6:3 — الأنماط الأمنية (`sec.sast`)
- ماذا حدث: HTML is written from a value that is not a constant (innerHTML, outerHTML, insertAdjacentHTML, document.write): check that it cannot carry markup from outside.
- الأثر لو بقي: إدراج HTML من نص غير موثوق يفتح الباب لحقن سكربت في صفحة المستخدم.
- الخطوة التالية: تحتاج مراجعتك — «راجع وقرّر»: اشتباه يحتاج حكمك.

### AYR-SEC-SAST-0065 — HTML يُكتب من قيمة غير ثابتة
- الشدة: متوسطة · اشتباه · مستمر
- الموضع: fixtures/semgrep-rules/ayar.js.html-injection.js:8:3 — الأنماط الأمنية (`sec.sast`)
- ماذا حدث: HTML is written from a value that is not a constant (innerHTML, outerHTML, insertAdjacentHTML, document.write): check that it cannot carry markup from outside.
- الأثر لو بقي: إدراج HTML من نص غير موثوق يفتح الباب لحقن سكربت في صفحة المستخدم.
- الخطوة التالية: تحتاج مراجعتك — «راجع وقرّر»: اشتباه يحتاج حكمك.

### AYR-SEC-SAST-0066 — HTML يُكتب من قيمة غير ثابتة
- الشدة: متوسطة · اشتباه · مستمر
- الموضع: fixtures/semgrep-rules/ayar.js.html-injection.js:10:3 — الأنماط الأمنية (`sec.sast`)
- ماذا حدث: HTML is written from a value that is not a constant (innerHTML, outerHTML, insertAdjacentHTML, document.write): check that it cannot carry markup from outside.
- الأثر لو بقي: إدراج HTML من نص غير موثوق يفتح الباب لحقن سكربت في صفحة المستخدم.
- الخطوة التالية: تحتاج مراجعتك — «راجع وقرّر»: اشتباه يحتاج حكمك.

### AYR-SEC-SAST-0067 — HTML يُكتب من قيمة غير ثابتة
- الشدة: متوسطة · اشتباه · مستمر
- الموضع: fixtures/semgrep-rules/ayar.js.html-injection.js:12:3 — الأنماط الأمنية (`sec.sast`)
- ماذا حدث: HTML is written from a value that is not a constant (innerHTML, outerHTML, insertAdjacentHTML, document.write): check that it cannot carry markup from outside.
- الأثر لو بقي: إدراج HTML من نص غير موثوق يفتح الباب لحقن سكربت في صفحة المستخدم.
- الخطوة التالية: تحتاج مراجعتك — «راجع وقرّر»: اشتباه يحتاج حكمك.

### AYR-SEC-SAST-0069 — dangerouslySetInnerHTML بقيمة غير ثابتة
- الشدة: متوسطة · اشتباه · مستمر
- الموضع: fixtures/semgrep-rules/ayar.js.react-dangerous-html.jsx:4:10 — الأنماط الأمنية (`sec.sast`)
- ماذا حدث: dangerouslySetInnerHTML with a value that is not a constant: check that it cannot carry markup from outside.
- الأثر لو بقي: تمرير HTML خام إلى React يتجاوز حمايته من الحقن.
- الخطوة التالية: تحتاج مراجعتك — «راجع وقرّر»: اشتباه يحتاج حكمك.

### AYR-SEC-SAST-0075 — pickle يحمّل بيانات قد تأتي من الخارج
- الشدة: متوسطة · اشتباه · مستمر
- الموضع: fixtures/semgrep-rules/ayar.py.pickle-load.py:8:12 — الأنماط الأمنية (`sec.sast`)
- ماذا حدث: pickle loads data that may come from outside: unpickling it can run code.
- الأثر لو بقي: تحميل pickle من مصدر غير موثوق ينفّذ شيفرة عند القراءة.
- الخطوة التالية: تحتاج مراجعتك — «راجع وقرّر»: اشتباه يحتاج حكمك.

### AYR-SEC-SAST-0080 — YAML بمحمّل غير آمن
- الشدة: متوسطة · اشتباه · مستمر
- الموضع: fixtures/semgrep-rules/ayar.py.yaml-unsafe-load.py:7:5 — الأنماط الأمنية (`sec.sast`)
- ماذا حدث: YAML is loaded with a loader that can build arbitrary objects.
- الأثر لو بقي: تحميل YAML غير الآمن قد ينشئ كائنات تنفّذ شيفرة.
- الخطوة التالية: تحتاج مراجعتك — «راجع وقرّر»: اشتباه يحتاج حكمك.

### AYR-SEC-SAST-0081 — YAML بمحمّل غير آمن
- الشدة: متوسطة · اشتباه · مستمر
- الموضع: fixtures/semgrep-rules/ayar.py.yaml-unsafe-load.py:9:12 — الأنماط الأمنية (`sec.sast`)
- ماذا حدث: YAML is loaded with a loader that can build arbitrary objects.
- الأثر لو بقي: تحميل YAML غير الآمن قد ينشئ كائنات تنفّذ شيفرة.
- الخطوة التالية: تحتاج مراجعتك — «راجع وقرّر»: اشتباه يحتاج حكمك.

### AYR-DSN-A11R-0001 — مراجعة بشرية لم تُسجَّل
- الشدة: متوسطة · اشتباه · مستمر
- الموضع: بلا موضع محدد — مراجعة الإتاحة البشرية (`design.a11y.review`)
- ماذا حدث: no human accessibility review is recorded for this interface
- الأثر لو بقي: لا تُسجَّل مطابقة الإتاحة حتى يراجعها إنسان: الأداة وحدها لا تكفي.
- الخطوة التالية: تحتاج مراجعتك — «راجع وقرّر»: مراجعة بشرية لم تُسجَّل.

ومعها 73 اكتشاف استُبعد بمراجعتك (إنذار كاذب) فلا يُحتسب: AYR-SEC-SECR-0003, AYR-SEC-SECR-0004, AYR-SEC-SECR-0005, AYR-SEC-SECR-0007, AYR-SEC-SECR-0006, AYR-SEC-SECR-0017, AYR-SEC-SECR-0008, AYR-SEC-SECR-0010, AYR-SEC-SECR-0009, AYR-SEC-SECR-0011, AYR-SEC-SECR-0012, AYR-SEC-SECR-0013, AYR-SEC-SECR-0014, AYR-SEC-SECR-0015, AYR-SEC-SECR-0016, AYR-SEC-SAST-0046, AYR-COD-REFL-0021, AYR-COD-REFL-0022, AYR-COD-REFL-0023, AYR-COD-REFL-0024, AYR-COD-REFL-0025, AYR-COD-REFL-0026, AYR-COD-REFL-0027, AYR-COD-REFL-0035, AYR-COD-REFL-0036, AYR-COD-REFL-0037, AYR-COD-REFL-0038, AYR-COD-REFL-0039, AYR-COD-REFL-0040, AYR-COD-REFL-0041, AYR-COD-REFL-0042, AYR-COD-REFL-0043, AYR-COD-REFL-0044, AYR-COD-REFL-0045, AYR-SEC-SAST-0047, AYR-SEC-SAST-0048, AYR-SEC-SAST-0049, AYR-SEC-SAST-0050, AYR-SEC-SAST-0051, AYR-SEC-SAST-0052, AYR-SEC-SAST-0053, AYR-SEC-SAST-0054, AYR-SEC-SAST-0055, AYR-SEC-SAST-0056, AYR-SEC-SAST-0057, AYR-SEC-SAST-0058, AYR-SEC-SAST-0059, AYR-SEC-SAST-0060, AYR-SEC-SAST-0061, AYR-SEC-SAST-0062, AYR-SEC-SAST-0068, AYR-SEC-SAST-0070, AYR-SEC-SAST-0071, AYR-SEC-SAST-0072, AYR-SEC-SAST-0073, AYR-SEC-SAST-0074, AYR-SEC-SAST-0076, AYR-SEC-SAST-0077, AYR-SEC-SAST-0078, AYR-SEC-SAST-0079, AYR-SEC-SAST-0082, AYR-SEC-SAST-0083, AYR-COD-REFL-0018, AYR-COD-REFL-0019, AYR-COD-REFL-0020, AYR-COD-REFL-0028, AYR-COD-REFL-0029, AYR-COD-REFL-0030, AYR-COD-REFL-0031, AYR-COD-REFL-0032, AYR-COD-REFL-0033, AYR-COD-REFL-0034, AYR-DSN-TOKS-0002.

## ماذا أفعل الآن
### تعالجها مباشرة
- «عرّف…» — الإتاحة الآلية والتباين (`design.a11y@apps/desktop`): ناقص، ناقص إعداد: renderTarget
- «جهّز…» — الاتجاه ساكنًا (`design.rtl.static@.`): ناقص، غير منطبق: لا واجهة باتجاه من اليمين إلى اليسار
- «ثبّت التبعيات» — ثغرات التبعيات دون اتصال (`sec.deps@.`): ناقص، ناقص: قاعدة الثغرات المحلية غير موجودة
- «جهّز…» — الأنواع (`code.types@.`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج npm، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — الأنواع (`code.types@packages/adapters`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج node، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — الأنواع (`code.types@packages/analyzers`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج node، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — الأنواع (`code.types@packages/catalog`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج node، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — الأنواع (`code.types@packages/engine`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج node، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — الأنواع (`code.types@packages/i18n`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج node، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — الأنواع (`code.types@packages/probe`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج node، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — الأنواع (`code.types@packages/protocol`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج node، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — الأنواع (`code.types@tools/cli`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج node، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — اختبارات الوحدة والانحدار (`beh.unit@apps/desktop`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج vitest,jest,node-test,pytest، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — اختبارات الوحدة والانحدار (`beh.unit@packages/adapters`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج vitest,jest,node-test,pytest، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — اختبارات الوحدة والانحدار (`beh.unit@packages/analyzers`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج vitest,jest,node-test,pytest، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — اختبارات الوحدة والانحدار (`beh.unit@packages/catalog`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج vitest,jest,node-test,pytest، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — اختبارات الوحدة والانحدار (`beh.unit@packages/engine`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج vitest,jest,node-test,pytest، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — اختبارات الوحدة والانحدار (`beh.unit@packages/i18n`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج vitest,jest,node-test,pytest، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — اختبارات الوحدة والانحدار (`beh.unit@packages/probe`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج vitest,jest,node-test,pytest، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — اختبارات الوحدة والانحدار (`beh.unit@packages/protocol`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج vitest,jest,node-test,pytest، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح
- «جهّز…» — اختبارات الوحدة والانحدار (`beh.unit@tools/cli`): تعذّر، تعذّر: لا محوّل في عِيَار يقرأ نتائج vitest,jest,node-test,pytest، فلا حكم بلا دليل. عرّفه فحصًا مخصصًا بمعيار نجاح

### تحتاج نموذجًا
لا شيء هنا.

### تحتاج مراجعتك
- «راجع وقرّر» — مراجعة الإتاحة البشرية (`design.a11y.review@apps/desktop`): يحتاج مراجعة، يحتاج مراجعة: اشتباهات تحتاج قرارك (1)
- «راجع وقرّر» — الأنماط الأمنية (`sec.sast@.`): يحتاج مراجعة، يحتاج مراجعة: اشتباهات تحتاج قرارك (9)
- «راجع وقرّر» — AYR-SEC-SAST-0063: اشتباه يحتاج حكمك.
- «راجع وقرّر» — AYR-SEC-SAST-0064: اشتباه يحتاج حكمك.
- «راجع وقرّر» — AYR-SEC-SAST-0065: اشتباه يحتاج حكمك.
- «راجع وقرّر» — AYR-SEC-SAST-0066: اشتباه يحتاج حكمك.
- «راجع وقرّر» — AYR-SEC-SAST-0067: اشتباه يحتاج حكمك.
- «راجع وقرّر» — AYR-SEC-SAST-0069: اشتباه يحتاج حكمك.
- «راجع وقرّر» — AYR-SEC-SAST-0075: اشتباه يحتاج حكمك.
- «راجع وقرّر» — AYR-SEC-SAST-0080: اشتباه يحتاج حكمك.
- «راجع وقرّر» — AYR-SEC-SAST-0081: اشتباه يحتاج حكمك.
- «راجع وقرّر» — AYR-DSN-A11R-0001: مراجعة بشرية لم تُسجَّل.

### لا شيء مطلوب
- مطابقة الرموز ساكنًا (`design.tokens.static@.`): اجتاز — اجتاز معياره المعلن في نطاقه.
- مطابقة الرموز ساكنًا (`design.tokens.static@packages/adapters`): غير منطبق — غير منطبق
- مطابقة الرموز ساكنًا (`design.tokens.static@packages/analyzers`): غير منطبق — غير منطبق
- مطابقة الرموز ساكنًا (`design.tokens.static@packages/catalog`): غير منطبق — غير منطبق
- مطابقة الرموز ساكنًا (`design.tokens.static@packages/engine`): غير منطبق — غير منطبق
- مطابقة الرموز ساكنًا (`design.tokens.static@packages/i18n`): غير منطبق — غير منطبق
- مطابقة الرموز ساكنًا (`design.tokens.static@packages/probe`): غير منطبق — غير منطبق
- مطابقة الرموز ساكنًا (`design.tokens.static@packages/protocol`): غير منطبق — غير منطبق
- مطابقة الرموز ساكنًا (`design.tokens.static@tools/cli`): غير منطبق — غير منطبق
- مطابقة القيم المحسوبة (`design.tokens.render@.`): غير منطبق — غير منطبق
- مطابقة القيم المحسوبة (`design.tokens.render@packages/adapters`): غير منطبق — غير منطبق
- مطابقة القيم المحسوبة (`design.tokens.render@packages/analyzers`): غير منطبق — غير منطبق
- مطابقة القيم المحسوبة (`design.tokens.render@packages/catalog`): غير منطبق — غير منطبق
- مطابقة القيم المحسوبة (`design.tokens.render@packages/engine`): غير منطبق — غير منطبق
- مطابقة القيم المحسوبة (`design.tokens.render@packages/i18n`): غير منطبق — غير منطبق
- مطابقة القيم المحسوبة (`design.tokens.render@packages/probe`): غير منطبق — غير منطبق
- مطابقة القيم المحسوبة (`design.tokens.render@packages/protocol`): غير منطبق — غير منطبق
- مطابقة القيم المحسوبة (`design.tokens.render@tools/cli`): غير منطبق — غير منطبق
- الخطوط ساكنًا (`design.fonts.static@packages/adapters`): غير منطبق — غير منطبق
- الخطوط ساكنًا (`design.fonts.static@packages/analyzers`): غير منطبق — غير منطبق
- الخطوط ساكنًا (`design.fonts.static@packages/catalog`): غير منطبق — غير منطبق
- الخطوط ساكنًا (`design.fonts.static@packages/engine`): غير منطبق — غير منطبق
- الخطوط ساكنًا (`design.fonts.static@packages/i18n`): غير منطبق — غير منطبق
- الخطوط ساكنًا (`design.fonts.static@packages/probe`): غير منطبق — غير منطبق
- الخطوط ساكنًا (`design.fonts.static@packages/protocol`): غير منطبق — غير منطبق
- الخطوط ساكنًا (`design.fonts.static@tools/cli`): غير منطبق — غير منطبق
- تحميل الخطوط فعليًا (`design.fonts.render@.`): غير منطبق — غير منطبق
- تحميل الخطوط فعليًا (`design.fonts.render@packages/adapters`): غير منطبق — غير منطبق
- تحميل الخطوط فعليًا (`design.fonts.render@packages/analyzers`): غير منطبق — غير منطبق
- تحميل الخطوط فعليًا (`design.fonts.render@packages/catalog`): غير منطبق — غير منطبق
- تحميل الخطوط فعليًا (`design.fonts.render@packages/engine`): غير منطبق — غير منطبق
- تحميل الخطوط فعليًا (`design.fonts.render@packages/i18n`): غير منطبق — غير منطبق
- تحميل الخطوط فعليًا (`design.fonts.render@packages/probe`): غير منطبق — غير منطبق
- تحميل الخطوط فعليًا (`design.fonts.render@packages/protocol`): غير منطبق — غير منطبق
- تحميل الخطوط فعليًا (`design.fonts.render@tools/cli`): غير منطبق — غير منطبق
- الإتاحة الآلية والتباين (`design.a11y@.`): غير منطبق — غير منطبق
- الإتاحة الآلية والتباين (`design.a11y@packages/adapters`): غير منطبق — غير منطبق
- الإتاحة الآلية والتباين (`design.a11y@packages/analyzers`): غير منطبق — غير منطبق
- الإتاحة الآلية والتباين (`design.a11y@packages/catalog`): غير منطبق — غير منطبق
- الإتاحة الآلية والتباين (`design.a11y@packages/engine`): غير منطبق — غير منطبق
- الإتاحة الآلية والتباين (`design.a11y@packages/i18n`): غير منطبق — غير منطبق
- الإتاحة الآلية والتباين (`design.a11y@packages/probe`): غير منطبق — غير منطبق
- الإتاحة الآلية والتباين (`design.a11y@packages/protocol`): غير منطبق — غير منطبق
- الإتاحة الآلية والتباين (`design.a11y@tools/cli`): غير منطبق — غير منطبق
- مراجعة الإتاحة البشرية (`design.a11y.review@.`): غير منطبق — غير منطبق
- مراجعة الإتاحة البشرية (`design.a11y.review@packages/adapters`): غير منطبق — غير منطبق
- مراجعة الإتاحة البشرية (`design.a11y.review@packages/analyzers`): غير منطبق — غير منطبق
- مراجعة الإتاحة البشرية (`design.a11y.review@packages/catalog`): غير منطبق — غير منطبق
- مراجعة الإتاحة البشرية (`design.a11y.review@packages/engine`): غير منطبق — غير منطبق
- مراجعة الإتاحة البشرية (`design.a11y.review@packages/i18n`): غير منطبق — غير منطبق
- مراجعة الإتاحة البشرية (`design.a11y.review@packages/probe`): غير منطبق — غير منطبق
- مراجعة الإتاحة البشرية (`design.a11y.review@packages/protocol`): غير منطبق — غير منطبق
- مراجعة الإتاحة البشرية (`design.a11y.review@tools/cli`): غير منطبق — غير منطبق
- الاتجاه ساكنًا (`design.rtl.static@apps/desktop`): غير منطبق — غير منطبق
- الاتجاه ساكنًا (`design.rtl.static@packages/adapters`): غير منطبق — غير منطبق
- الاتجاه ساكنًا (`design.rtl.static@packages/analyzers`): غير منطبق — غير منطبق
- الاتجاه ساكنًا (`design.rtl.static@packages/catalog`): غير منطبق — غير منطبق
- الاتجاه ساكنًا (`design.rtl.static@packages/engine`): غير منطبق — غير منطبق
- الاتجاه ساكنًا (`design.rtl.static@packages/i18n`): غير منطبق — غير منطبق
- الاتجاه ساكنًا (`design.rtl.static@packages/probe`): غير منطبق — غير منطبق
- الاتجاه ساكنًا (`design.rtl.static@packages/protocol`): غير منطبق — غير منطبق
- الاتجاه ساكنًا (`design.rtl.static@tools/cli`): غير منطبق — غير منطبق
- الاتجاه عند العرض (`design.rtl.render@.`): غير منطبق — غير منطبق
- الاتجاه عند العرض (`design.rtl.render@apps/desktop`): غير منطبق — غير منطبق
- الاتجاه عند العرض (`design.rtl.render@packages/adapters`): غير منطبق — غير منطبق
- الاتجاه عند العرض (`design.rtl.render@packages/analyzers`): غير منطبق — غير منطبق
- الاتجاه عند العرض (`design.rtl.render@packages/catalog`): غير منطبق — غير منطبق
- الاتجاه عند العرض (`design.rtl.render@packages/engine`): غير منطبق — غير منطبق
- الاتجاه عند العرض (`design.rtl.render@packages/i18n`): غير منطبق — غير منطبق
- الاتجاه عند العرض (`design.rtl.render@packages/probe`): غير منطبق — غير منطبق
- الاتجاه عند العرض (`design.rtl.render@packages/protocol`): غير منطبق — غير منطبق
- الاتجاه عند العرض (`design.rtl.render@tools/cli`): غير منطبق — غير منطبق
- حالات الواجهة (`design.states@.`): غير منطبق — غير منطبق
- حالات الواجهة (`design.states@packages/adapters`): غير منطبق — غير منطبق
- حالات الواجهة (`design.states@packages/analyzers`): غير منطبق — غير منطبق
- حالات الواجهة (`design.states@packages/catalog`): غير منطبق — غير منطبق
- حالات الواجهة (`design.states@packages/engine`): غير منطبق — غير منطبق
- حالات الواجهة (`design.states@packages/i18n`): غير منطبق — غير منطبق
- حالات الواجهة (`design.states@packages/probe`): غير منطبق — غير منطبق
- حالات الواجهة (`design.states@packages/protocol`): غير منطبق — غير منطبق
- حالات الواجهة (`design.states@tools/cli`): غير منطبق — غير منطبق
- المقارنة البصرية (`design.visual@.`): غير منطبق — غير منطبق
- المقارنة البصرية (`design.visual@packages/adapters`): غير منطبق — غير منطبق
- المقارنة البصرية (`design.visual@packages/analyzers`): غير منطبق — غير منطبق
- المقارنة البصرية (`design.visual@packages/catalog`): غير منطبق — غير منطبق
- المقارنة البصرية (`design.visual@packages/engine`): غير منطبق — غير منطبق
- المقارنة البصرية (`design.visual@packages/i18n`): غير منطبق — غير منطبق
- المقارنة البصرية (`design.visual@packages/probe`): غير منطبق — غير منطبق
- المقارنة البصرية (`design.visual@packages/protocol`): غير منطبق — غير منطبق
- المقارنة البصرية (`design.visual@tools/cli`): غير منطبق — غير منطبق
- الأسرار في الملفات (`sec.secrets.files@.`): اجتاز — اجتاز معياره المعلن في نطاقه.
- سلامة ملف البيان (`sec.ext.manifest@.`): غير منطبق — غير منطبق
- سلامة ملف البيان (`sec.ext.manifest@apps/desktop`): غير منطبق — غير منطبق
- سلامة ملف البيان (`sec.ext.manifest@packages/adapters`): غير منطبق — غير منطبق
- سلامة ملف البيان (`sec.ext.manifest@packages/analyzers`): غير منطبق — غير منطبق
- سلامة ملف البيان (`sec.ext.manifest@packages/catalog`): غير منطبق — غير منطبق
- سلامة ملف البيان (`sec.ext.manifest@packages/engine`): غير منطبق — غير منطبق
- سلامة ملف البيان (`sec.ext.manifest@packages/i18n`): غير منطبق — غير منطبق
- سلامة ملف البيان (`sec.ext.manifest@packages/probe`): غير منطبق — غير منطبق
- سلامة ملف البيان (`sec.ext.manifest@packages/protocol`): غير منطبق — غير منطبق
- سلامة ملف البيان (`sec.ext.manifest@tools/cli`): غير منطبق — غير منطبق
- الصلاحيات مقابل السياسة (`sec.ext.permissions@.`): غير منطبق — غير منطبق
- الصلاحيات مقابل السياسة (`sec.ext.permissions@apps/desktop`): غير منطبق — غير منطبق
- الصلاحيات مقابل السياسة (`sec.ext.permissions@packages/adapters`): غير منطبق — غير منطبق
- الصلاحيات مقابل السياسة (`sec.ext.permissions@packages/analyzers`): غير منطبق — غير منطبق
- الصلاحيات مقابل السياسة (`sec.ext.permissions@packages/catalog`): غير منطبق — غير منطبق
- الصلاحيات مقابل السياسة (`sec.ext.permissions@packages/engine`): غير منطبق — غير منطبق
- الصلاحيات مقابل السياسة (`sec.ext.permissions@packages/i18n`): غير منطبق — غير منطبق
- الصلاحيات مقابل السياسة (`sec.ext.permissions@packages/probe`): غير منطبق — غير منطبق
- الصلاحيات مقابل السياسة (`sec.ext.permissions@packages/protocol`): غير منطبق — غير منطبق
- الصلاحيات مقابل السياسة (`sec.ext.permissions@tools/cli`): غير منطبق — غير منطبق
- البناء (`code.build@.`): اجتاز — اجتاز معياره المعلن في نطاقه.
- البناء (`code.build@apps/desktop`): اجتاز — اجتاز معياره المعلن في نطاقه.
- البناء (`code.build@packages/adapters`): غير منطبق — غير منطبق
- البناء (`code.build@packages/analyzers`): غير منطبق — غير منطبق
- البناء (`code.build@packages/catalog`): اجتاز — اجتاز معياره المعلن في نطاقه.
- البناء (`code.build@packages/engine`): غير منطبق — غير منطبق
- البناء (`code.build@packages/i18n`): غير منطبق — غير منطبق
- البناء (`code.build@packages/probe`): غير منطبق — غير منطبق
- البناء (`code.build@packages/protocol`): غير منطبق — غير منطبق
- البناء (`code.build@tools/cli`): غير منطبق — غير منطبق
- الأنواع (`code.types@apps/desktop`): اجتاز — اجتاز معياره المعلن في نطاقه.
- قواعد الشيفرة (`code.lint@.`): اجتاز — اجتاز معياره المعلن في نطاقه.
- قواعد الشيفرة (`code.lint@apps/desktop`): غير منطبق — غير منطبق
- قواعد الشيفرة (`code.lint@packages/adapters`): غير منطبق — غير منطبق
- قواعد الشيفرة (`code.lint@packages/analyzers`): غير منطبق — غير منطبق
- قواعد الشيفرة (`code.lint@packages/catalog`): غير منطبق — غير منطبق
- قواعد الشيفرة (`code.lint@packages/engine`): غير منطبق — غير منطبق
- قواعد الشيفرة (`code.lint@packages/i18n`): غير منطبق — غير منطبق
- قواعد الشيفرة (`code.lint@packages/probe`): غير منطبق — غير منطبق
- قواعد الشيفرة (`code.lint@packages/protocol`): غير منطبق — غير منطبق
- قواعد الشيفرة (`code.lint@tools/cli`): غير منطبق — غير منطبق
- المراجع المحلية (`code.refs.local@.`): اجتاز — اجتاز معياره المعلن في نطاقه.
- المراجع المحلية (`code.refs.local@apps/desktop`): اجتاز — اجتاز معياره المعلن في نطاقه.
- المراجع المحلية (`code.refs.local@packages/adapters`): غير منطبق — غير منطبق
- المراجع المحلية (`code.refs.local@packages/analyzers`): غير منطبق — غير منطبق
- المراجع المحلية (`code.refs.local@packages/catalog`): غير منطبق — غير منطبق
- المراجع المحلية (`code.refs.local@packages/engine`): غير منطبق — غير منطبق
- المراجع المحلية (`code.refs.local@packages/i18n`): غير منطبق — غير منطبق
- المراجع المحلية (`code.refs.local@packages/probe`): غير منطبق — غير منطبق
- المراجع المحلية (`code.refs.local@packages/protocol`): اجتاز — اجتاز معياره المعلن في نطاقه.
- المراجع المحلية (`code.refs.local@tools/cli`): غير منطبق — غير منطبق
- الروابط الخارجية (`code.refs.external@packages/adapters`): غير منطبق — غير منطبق
- الروابط الخارجية (`code.refs.external@packages/analyzers`): غير منطبق — غير منطبق
- الروابط الخارجية (`code.refs.external@packages/catalog`): غير منطبق — غير منطبق
- الروابط الخارجية (`code.refs.external@packages/engine`): غير منطبق — غير منطبق
- الروابط الخارجية (`code.refs.external@packages/i18n`): غير منطبق — غير منطبق
- الروابط الخارجية (`code.refs.external@packages/probe`): غير منطبق — غير منطبق
- الروابط الخارجية (`code.refs.external@tools/cli`): غير منطبق — غير منطبق
- ميزانية الحجم (`code.size@packages/adapters`): غير منطبق — غير منطبق
- ميزانية الحجم (`code.size@packages/analyzers`): غير منطبق — غير منطبق
- ميزانية الحجم (`code.size@packages/engine`): غير منطبق — غير منطبق
- ميزانية الحجم (`code.size@packages/i18n`): غير منطبق — غير منطبق
- ميزانية الحجم (`code.size@packages/probe`): غير منطبق — غير منطبق
- ميزانية الحجم (`code.size@packages/protocol`): غير منطبق — غير منطبق
- ميزانية الحجم (`code.size@tools/cli`): غير منطبق — غير منطبق
- اختبارات الوحدة والانحدار (`beh.unit@.`): اجتاز — اجتاز معياره المعلن في نطاقه.
- التكامل وAPI (`beh.integration@.`): غير منطبق — غير منطبق
- التكامل وAPI (`beh.integration@apps/desktop`): غير منطبق — غير منطبق
- التكامل وAPI (`beh.integration@packages/adapters`): غير منطبق — غير منطبق
- التكامل وAPI (`beh.integration@packages/analyzers`): غير منطبق — غير منطبق
- التكامل وAPI (`beh.integration@packages/catalog`): غير منطبق — غير منطبق
- التكامل وAPI (`beh.integration@packages/engine`): غير منطبق — غير منطبق
- التكامل وAPI (`beh.integration@packages/i18n`): غير منطبق — غير منطبق
- التكامل وAPI (`beh.integration@packages/probe`): غير منطبق — غير منطبق
- التكامل وAPI (`beh.integration@packages/protocol`): غير منطبق — غير منطبق
- التكامل وAPI (`beh.integration@tools/cli`): غير منطبق — غير منطبق
- الرحلات (`beh.e2e@.`): غير منطبق — غير منطبق
- الرحلات (`beh.e2e@apps/desktop`): غير منطبق — غير منطبق
- الرحلات (`beh.e2e@packages/adapters`): غير منطبق — غير منطبق
- الرحلات (`beh.e2e@packages/analyzers`): غير منطبق — غير منطبق
- الرحلات (`beh.e2e@packages/catalog`): غير منطبق — غير منطبق
- الرحلات (`beh.e2e@packages/engine`): غير منطبق — غير منطبق
- الرحلات (`beh.e2e@packages/i18n`): غير منطبق — غير منطبق
- الرحلات (`beh.e2e@packages/probe`): غير منطبق — غير منطبق
- الرحلات (`beh.e2e@packages/protocol`): غير منطبق — غير منطبق
- الرحلات (`beh.e2e@tools/cli`): غير منطبق — غير منطبق
- العقود (`beh.contract@.`): غير منطبق — غير منطبق
- العقود (`beh.contract@apps/desktop`): غير منطبق — غير منطبق
- العقود (`beh.contract@packages/adapters`): غير منطبق — غير منطبق
- العقود (`beh.contract@packages/analyzers`): غير منطبق — غير منطبق
- العقود (`beh.contract@packages/catalog`): غير منطبق — غير منطبق
- العقود (`beh.contract@packages/engine`): غير منطبق — غير منطبق
- العقود (`beh.contract@packages/i18n`): غير منطبق — غير منطبق
- العقود (`beh.contract@packages/probe`): غير منطبق — غير منطبق
- العقود (`beh.contract@packages/protocol`): غير منطبق — غير منطبق
- العقود (`beh.contract@tools/cli`): غير منطبق — غير منطبق
- الإضافة داخل المضيف (`beh.ext.host@.`): غير منطبق — غير منطبق
- الإضافة داخل المضيف (`beh.ext.host@apps/desktop`): غير منطبق — غير منطبق
- الإضافة داخل المضيف (`beh.ext.host@packages/adapters`): غير منطبق — غير منطبق
- الإضافة داخل المضيف (`beh.ext.host@packages/analyzers`): غير منطبق — غير منطبق
- الإضافة داخل المضيف (`beh.ext.host@packages/catalog`): غير منطبق — غير منطبق
- الإضافة داخل المضيف (`beh.ext.host@packages/engine`): غير منطبق — غير منطبق
- الإضافة داخل المضيف (`beh.ext.host@packages/i18n`): غير منطبق — غير منطبق
- الإضافة داخل المضيف (`beh.ext.host@packages/probe`): غير منطبق — غير منطبق
- الإضافة داخل المضيف (`beh.ext.host@packages/protocol`): غير منطبق — غير منطبق
- الإضافة داخل المضيف (`beh.ext.host@tools/cli`): غير منطبق — غير منطبق
- مقاييس العرض المختبرية (`perf.web@.`): غير منطبق — غير منطبق
- مقاييس العرض المختبرية (`perf.web@packages/adapters`): غير منطبق — غير منطبق
- مقاييس العرض المختبرية (`perf.web@packages/analyzers`): غير منطبق — غير منطبق
- مقاييس العرض المختبرية (`perf.web@packages/catalog`): غير منطبق — غير منطبق
- مقاييس العرض المختبرية (`perf.web@packages/engine`): غير منطبق — غير منطبق
- مقاييس العرض المختبرية (`perf.web@packages/i18n`): غير منطبق — غير منطبق
- مقاييس العرض المختبرية (`perf.web@packages/probe`): غير منطبق — غير منطبق
- مقاييس العرض المختبرية (`perf.web@packages/protocol`): غير منطبق — غير منطبق
- مقاييس العرض المختبرية (`perf.web@tools/cli`): غير منطبق — غير منطبق
- الحمل (`perf.load@.`): غير منطبق — غير منطبق
- الحمل (`perf.load@apps/desktop`): غير منطبق — غير منطبق
- الحمل (`perf.load@packages/adapters`): غير منطبق — غير منطبق
- الحمل (`perf.load@packages/analyzers`): غير منطبق — غير منطبق
- الحمل (`perf.load@packages/catalog`): غير منطبق — غير منطبق
- الحمل (`perf.load@packages/engine`): غير منطبق — غير منطبق
- الحمل (`perf.load@packages/i18n`): غير منطبق — غير منطبق
- الحمل (`perf.load@packages/probe`): غير منطبق — غير منطبق
- الحمل (`perf.load@packages/protocol`): غير منطبق — غير منطبق
- الحمل (`perf.load@tools/cli`): غير منطبق — غير منطبق
- التعافي وسلامة البيانات (`perf.recovery@.`): غير منطبق — غير منطبق
- التعافي وسلامة البيانات (`perf.recovery@apps/desktop`): غير منطبق — غير منطبق
- التعافي وسلامة البيانات (`perf.recovery@packages/adapters`): غير منطبق — غير منطبق
- التعافي وسلامة البيانات (`perf.recovery@packages/analyzers`): غير منطبق — غير منطبق
- التعافي وسلامة البيانات (`perf.recovery@packages/catalog`): غير منطبق — غير منطبق
- التعافي وسلامة البيانات (`perf.recovery@packages/engine`): غير منطبق — غير منطبق
- التعافي وسلامة البيانات (`perf.recovery@packages/i18n`): غير منطبق — غير منطبق
- التعافي وسلامة البيانات (`perf.recovery@packages/probe`): غير منطبق — غير منطبق
- التعافي وسلامة البيانات (`perf.recovery@packages/protocol`): غير منطبق — غير منطبق
- التعافي وسلامة البيانات (`perf.recovery@tools/cli`): غير منطبق — غير منطبق
- التوافق (`perf.compat@.`): غير منطبق — غير منطبق
- التوافق (`perf.compat@apps/desktop`): غير منطبق — غير منطبق
- التوافق (`perf.compat@packages/adapters`): غير منطبق — غير منطبق
- التوافق (`perf.compat@packages/analyzers`): غير منطبق — غير منطبق
- التوافق (`perf.compat@packages/catalog`): غير منطبق — غير منطبق
- التوافق (`perf.compat@packages/engine`): غير منطبق — غير منطبق
- التوافق (`perf.compat@packages/i18n`): غير منطبق — غير منطبق
- التوافق (`perf.compat@packages/probe`): غير منطبق — غير منطبق
- التوافق (`perf.compat@packages/protocol`): غير منطبق — غير منطبق
- التوافق (`perf.compat@tools/cli`): غير منطبق — غير منطبق
- custom.typecheck (`custom.typecheck@.`): اجتاز — اجتاز معياره المعلن في نطاقه.

## حدود هذه النتيجة
- مطابقة الرموز ساكنًا (`design.tokens.static`): لا يرى القيم المولدة وقت التشغيل، ولا يقرأ إعداد Tailwind 3 المكتوب بـ JavaScript.
- الإتاحة الآلية والتباين (`design.a11y`): يكشف جزءًا فقط، وقد لا يحسم التباين فوق الصور والتدرجات، ولا يدّعي مطابقة WCAG.
- مراجعة الإتاحة البشرية (`design.a11y.review`): جودة المراجعة مسؤولية المراجع.
- الاتجاه ساكنًا (`design.rtl.static`): لا يحكم على التصميم، والخاصية الفيزيائية قد تكون مقصودة.
- الأسرار في الملفات (`sec.secrets.files`): الأنماط تخطئ وتفوت، ولا يشمل تاريخ Git.
- ثغرات التبعيات دون اتصال (`sec.deps`): لا يثبت قابلية الاستغلال، ومحدود بتاريخ القاعدة.
- الأنماط الأمنية (`sec.sast`): النمط لا يثبت الاستغلال، وغياب الإنذار لا يثبت غياب الثغرات. · ملاحظة: بقيت عملية خرجت من مجموعة الفحص وقد لا تكون أُنهيت
- البناء (`code.build`): قابلية البناء لا تثبت صحة السلوك. · ملاحظة: شغّل هذا الفحص أمرًا من المشروع نفسه، وعِيَار لا يمنع عنه الشبكة: ضمان العمل دون شبكة يشمل عِيَار وأدواته وحدها
- البناء (`code.build`): قابلية البناء لا تثبت صحة السلوك. · ملاحظة: السكربت مركّب؛ يُقترح استدعاء الأداة مباشرة ليصل عِيَار إلى تقريرها كاملًا · ملاحظة: شغّل هذا الفحص أمرًا من المشروع نفسه، وعِيَار لا يمنع عنه الشبكة: ضمان العمل دون شبكة يشمل عِيَار وأدواته وحدها
- البناء (`code.build`): قابلية البناء لا تثبت صحة السلوك. · ملاحظة: شغّل هذا الفحص أمرًا من المشروع نفسه، وعِيَار لا يمنع عنه الشبكة: ضمان العمل دون شبكة يشمل عِيَار وأدواته وحدها
- الأنواع (`code.types`): البرنامج السليم الأنواع قد يحسب نتيجة خاطئة.
- الأنواع (`code.types`): البرنامج السليم الأنواع قد يحسب نتيجة خاطئة. · ملاحظة: السكربت مركّب؛ يُقترح استدعاء الأداة مباشرة ليصل عِيَار إلى تقريرها كاملًا · ملاحظة: شغّل هذا الفحص أمرًا من المشروع نفسه، وعِيَار لا يمنع عنه الشبكة: ضمان العمل دون شبكة يشمل عِيَار وأدواته وحدها
- الأنواع (`code.types`): البرنامج السليم الأنواع قد يحسب نتيجة خاطئة.
- الأنواع (`code.types`): البرنامج السليم الأنواع قد يحسب نتيجة خاطئة.
- الأنواع (`code.types`): البرنامج السليم الأنواع قد يحسب نتيجة خاطئة.
- الأنواع (`code.types`): البرنامج السليم الأنواع قد يحسب نتيجة خاطئة.
- الأنواع (`code.types`): البرنامج السليم الأنواع قد يحسب نتيجة خاطئة.
- الأنواع (`code.types`): البرنامج السليم الأنواع قد يحسب نتيجة خاطئة.
- الأنواع (`code.types`): البرنامج السليم الأنواع قد يحسب نتيجة خاطئة.
- الأنواع (`code.types`): البرنامج السليم الأنواع قد يحسب نتيجة خاطئة.
- قواعد الشيفرة (`code.lint`): القواعد من اختيار المشروع وعِيَار لا يضيف قواعد، وخطأ الإعداد «تعذّر» لا إخفاق. · ملاحظة: بقيت عملية خرجت من مجموعة الفحص وقد لا تكون أُنهيت · ملاحظة: شغّل هذا الفحص أمرًا من المشروع نفسه، وعِيَار لا يمنع عنه الشبكة: ضمان العمل دون شبكة يشمل عِيَار وأدواته وحدها
- المراجع المحلية (`code.refs.local`): محلي فقط، ولا يفحص الروابط الخارجية.
- المراجع المحلية (`code.refs.local`): محلي فقط، ولا يفحص الروابط الخارجية.
- المراجع المحلية (`code.refs.local`): محلي فقط، ولا يفحص الروابط الخارجية.
- اختبارات الوحدة والانحدار (`beh.unit`): الإخفاق يثبت مخالفة توقع الاختبار وقد يكون التوقع خاطئًا، والنجاح لا يثبت غياب العيوب. · ملاحظة: بقيت عملية خرجت من مجموعة الفحص وقد لا تكون أُنهيت · ملاحظة: شغّل هذا الفحص أمرًا من المشروع نفسه، وعِيَار لا يمنع عنه الشبكة: ضمان العمل دون شبكة يشمل عِيَار وأدواته وحدها
- اختبارات الوحدة والانحدار (`beh.unit`): الإخفاق يثبت مخالفة توقع الاختبار وقد يكون التوقع خاطئًا، والنجاح لا يثبت غياب العيوب.
- اختبارات الوحدة والانحدار (`beh.unit`): الإخفاق يثبت مخالفة توقع الاختبار وقد يكون التوقع خاطئًا، والنجاح لا يثبت غياب العيوب.
- اختبارات الوحدة والانحدار (`beh.unit`): الإخفاق يثبت مخالفة توقع الاختبار وقد يكون التوقع خاطئًا، والنجاح لا يثبت غياب العيوب.
- اختبارات الوحدة والانحدار (`beh.unit`): الإخفاق يثبت مخالفة توقع الاختبار وقد يكون التوقع خاطئًا، والنجاح لا يثبت غياب العيوب.
- اختبارات الوحدة والانحدار (`beh.unit`): الإخفاق يثبت مخالفة توقع الاختبار وقد يكون التوقع خاطئًا، والنجاح لا يثبت غياب العيوب.
- اختبارات الوحدة والانحدار (`beh.unit`): الإخفاق يثبت مخالفة توقع الاختبار وقد يكون التوقع خاطئًا، والنجاح لا يثبت غياب العيوب.
- اختبارات الوحدة والانحدار (`beh.unit`): الإخفاق يثبت مخالفة توقع الاختبار وقد يكون التوقع خاطئًا، والنجاح لا يثبت غياب العيوب.
- اختبارات الوحدة والانحدار (`beh.unit`): الإخفاق يثبت مخالفة توقع الاختبار وقد يكون التوقع خاطئًا، والنجاح لا يثبت غياب العيوب.
- اختبارات الوحدة والانحدار (`beh.unit`): الإخفاق يثبت مخالفة توقع الاختبار وقد يكون التوقع خاطئًا، والنجاح لا يثبت غياب العيوب.
- custom.typecheck (`custom.typecheck`):  · ملاحظة: بقيت عملية خرجت من مجموعة الفحص وقد لا تكون أُنهيت · ملاحظة: شغّل هذا الفحص أمرًا من المشروع نفسه، وعِيَار لا يمنع عنه الشبكة: ضمان العمل دون شبكة يشمل عِيَار وأدواته وحدها

## ما اجتاز
- مطابقة الرموز ساكنًا (`design.tokens.static`): القيم في ملفات الأنماط كلها من سلم الرموز (2048 ملف) — النطاق: `.`
- الأسرار في الملفات (`sec.secrets.files`): لا أسرار في 2048 ملفًا مفحوصًا — النطاق: `.`
- البناء (`code.build`): البناء ينجح والمخرجات المعلنة موجودة — النطاق: `.`
- البناء (`code.build`): البناء ينجح والمخرجات المعلنة موجودة — النطاق: `apps/desktop`
- البناء (`code.build`): البناء ينجح والمخرجات المعلنة موجودة — النطاق: `packages/catalog`
- الأنواع (`code.types`): لا خطأ أنواع في الشيفرة (296 ملف) — النطاق: `apps/desktop`
- قواعد الشيفرة (`code.lint`): لا خطأ من قواعد المدقق (2048 ملف) — النطاق: `.`
- المراجع المحلية (`code.refs.local`): كل مرجع محلي (ملف أو مرساة) يشير إلى موجود (2048 ملف) — النطاق: `.`
- المراجع المحلية (`code.refs.local`): كل مرجع محلي (ملف أو مرساة) يشير إلى موجود (296 ملف) — النطاق: `apps/desktop`
- المراجع المحلية (`code.refs.local`): كل مرجع محلي (ملف أو مرساة) يشير إلى موجود (65 ملف) — النطاق: `packages/protocol`
- اختبارات الوحدة والانحدار (`beh.unit`): 835 من 846 اختبارًا نجحت، وتُخطّي 11 — النطاق: `.`
- custom.typecheck (`custom.typecheck`): تحقق معيار النجاح في 2048 ملفًا مفحوصًا — النطاق: `.`

## النزاهة (هل يمكن الوثوق بالنتائج والإصلاحات؟)
هل يمكن الوثوق بالنتائج والإصلاحات؟ أربعة فحوص خارج المؤشر تجيب، وأي بند منها غير مجتاز يمنع حكم «نقي»:
- حارس النزاهة (`integ.guard`): اجتاز — اجتاز: لا إسكات ولا تخطٍّ ولا تعديل مرجع في 0 ملفًا متغيرًا منذ الأساس
- ثبات الحالة أثناء الفحص (`integ.state`): اجتاز — اجتاز: لم يتغير ملف مصدر أثناء الفحص
- مطابقة ادعاءات النموذج (`integ.model-claims`): غير منطبق — غير منطبق
- صلاحية المراجعات البشرية (`integ.reviews`): ناقص — يحتاج اعتمادًا: لم يُعتمد أمره بعد
يمنع حكم «نقي»: بند واحد
- المراجعات المسجلة: 73، منها 73 سارية و0 انتهت صلاحيتها بتغيّر ملفات نطاقها.

