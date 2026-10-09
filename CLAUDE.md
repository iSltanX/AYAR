@AGENTS.md

# إضافات خاصة بـ Claude Code

القواعد المشتركة كلها في `AGENTS.md` (مستوردة أعلاه)، وهو المرجع عند أي تعارض. هذا الملف يضيف ما يخص أدوات Claude Code وحدها.

## الأدوات

- **Figma (مراحل التصميم، وDEV-10 إلى DEV-12):** الملف `UXkPakdqRuHDVTs78DO4uC`. استدعِ `create_session` بمفتاح الملف أولًا، ثم استخدم معرّف الجلسة في كل استدعاء. حمّل مهارة `figma:figma-use` قبل أي `use_figma`، ومهارة `figma:figma-design-to-code` قبل `get_design_context`، و`figma:figma-generate-library` عند بناء المتغيرات والمكونات. التفاصيل في `docs/design/README.md`.
- **صفحة المراحل:** بعد توليدها، أعد نشرها بأداة Artifact على الرابط المسجل في `docs/dashboard/README.md` (مرّر `url`، واقرأ الصفحة أولًا بـ `action: "read"` إن لم تُنشر في هذه الجلسة).
- **الوكلاء الفرعيون:** `code-reviewer` قبل إغلاق مرحلة برمجية، و`test-engineer` لبوابة الفحص، و`ui-ux-guardian` لمراجعة الواجهة والتصميم، و`debugger` عند فشل غامض. تقاريرهم مدخلات، والقرار والإصلاح في الجلسة الرئيسية.
- **التحكم بالشاشة:** لا تبدأ قبل أن يؤكد المالك تفعيل «Enable computer use»، كما في `AGENTS.md` القسم 3.3 وتعليماته العامة.

## التنفيذ

- Node: استخدم `/opt/homebrew/bin/node` بالمسار المطلق (`AGENTS.md` القسم 9).
- رسائل الـcommit تنتهي بسطر الإسناد الذي يحدده النظام للجلسة.
