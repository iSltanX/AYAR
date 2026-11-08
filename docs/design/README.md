# قيم التصميم المعتمدة

تصميم عِيَار في ملف Figma (المفتاح `UXkPakdqRuHDVTs78DO4uC`)، والملف غير منشور للعموم. وما تحتاجه الشيفرة منه محفوظ في المستودع:

| المسار | ما فيه | من يستخدمه |
|---|---|---|
| `apps/desktop/src/renderer/design/figma/` | تفريغ متغيرات Figma (`variables.txt`) ورموز الحالات بأحجامها الثلاثة | مولّد `tokens.css` و`icons.generated.ts`: `npm run design:generate -w @ayar/desktop` |
| [DES-1/tokens.mjs](DES-1/tokens.mjs) | مولّد سلالم الألوان وفاحص تباينها، ويكتب `tokens.json` و`contrast.md` | يُشغَّل يدويًا عند تغيير الألوان: `node docs/design/DES-1/tokens.mjs` |
| [DES-1/tokens.json](DES-1/tokens.json) | قيم الألوان المعتمدة (البديل A) وجدول تباينها | `apps/desktop/test/design/tokens.test.ts` (التفريغ يطابقها) و`contrast.test.ts` |
| [DES-1/contrast.md](DES-1/contrast.md) | جدول التباين مقروءًا | للمراجعة |
| `DES-2/checks.json` | ثنائيات التباين لمكوّنات الحالات المعتمدة | `apps/desktop/test/design/contrast.test.ts` |
| `DES-3/checks.json` | ثنائيات التباين لمكوّنات الواجهة المعتمدة | `apps/desktop/test/design/contrast.test.ts` |

اختبار التباين يعيد حساب كل ثنائية من `tokens.css` المولّد في الوضعين: 4.5:1 للنص، و3:1 لبقية عناصر الواجهة.
