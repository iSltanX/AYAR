# سوق الأجهزة (FX-WEB-DESIGN)

تطبيق ويب صغير مشروعُ اختبار لعِيَار: رموز تصميم بصيغة DTCG، وثيمان (فاتح وداكن)، ولغتان (عربية وإنجليزية)، وحالات تحميل وخطأ وفراغ معلنة بمحاكاة شبكة، وحالة «حساسة».

- التشغيل: `node server.mjs` ثم افتح `http://127.0.0.1:4173`.
- الرموز: [design/tokens.json](design/tokens.json) ← `node tools/build-tokens.mjs` ← `styles/tokens.css`.
- الحالات: [design/states.json](design/states.json). الإعداد: [design/design.config.json](design/design.config.json).
- الخط Cairo مستضاف محليًّا (ترخيص OFL، انظر [fonts/OFL.txt](fonts/OFL.txt)).
- لا صور مرجعية معتمدة (`design/references/` غير موجود) حتى يعتمدها AT-17.
