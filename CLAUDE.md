@AGENTS.md

# إضافات خاصة بـ Claude Code

القواعد المشتركة كلها في `AGENTS.md` (مستوردة أعلاه)، وهو المرجع عند أي تعارض.

- **Node:** استخدم `/opt/homebrew/bin/node` و`/opt/homebrew/bin/npm` بالمسار المطلق (`AGENTS.md` القسم 2).
- **Figma:** ملف التصميم `UXkPakdqRuHDVTs78DO4uC`. استدعِ `create_session` بمفتاح الملف أولًا، ثم استخدم معرّف الجلسة في كل استدعاء. وحمّل مهارة `figma:figma-use` قبل أي `use_figma`، ومهارة `figma:figma-design-to-code` قبل `get_design_context`. وما تحتاجه الشيفرة من التصميم موصوف في `docs/design/README.md`.
- **التحكم بالشاشة:** لا يبدأ قبل أن يؤكد المالك تفعيل «Enable computer use»، بعد أن تعرض عليه التطبيقات والمدة وعدد الخطوات. وعند الانتهاء أبلغه أنه يستطيع إطفاءه.
- **رسائل الالتزام** تنتهي بسطر الإسناد الذي يحدده النظام للجلسة.
