# فحوص نظام الحالات — DES-2

> مولّد من `status-check.mjs`، لا يُحرَّر يدويًا. القيم من `docs/design/DES-1/tokens.json` (البديل A المعتمد). نسب WCAG 2.x، والحد 4.5:1 للنص و3:1 للرموز والحدود وعناصر القياس، و3:1 لرقم العيار لأنه نص كبير (48).

## الخلاصة

| البند | النتيجة |
|---|---|
| ثنائيات التباين الملزمة | 296 من 296 نجحت |
| رموز النتائج فريدة الشكل | نعم: 12 رمزًا بـ 12 شكلًا داخليًا |
| مطابقة القيم مع Figma | 176 من 176 |

### أدنى نسبة في كل مجموعة

| المجموعة | الوضع | الثنائية | النسبة | الحد |
|---|---|---|---|---|
| شارة النتيجة | light | `result/passed/icon` على `result/passed/bg` | 3.62:1 | 3:1 |
| شارة النتيجة | dark | `result/timed-out/icon` على `result/timed-out/bg` | 4.74:1 | 3:1 |
| الرمز منفردًا | light | `result/passed/icon` على `selection` | 3.31:1 | 3:1 |
| الرمز منفردًا | dark | `result/failed/icon` على `selection` | 4.70:1 | 3:1 |
| مؤشر الدورة | light | `cycle/running/icon` على `selection` | 3.62:1 | 3:1 |
| مؤشر الدورة | dark | `cycle/running/icon` على `selection` | 5.05:1 | 3:1 |
| شارة الجاهزية | light | `border/strong` على `selection` | 3.14:1 | 3:1 |
| شارة الجاهزية | dark | `border/strong` على `selection` | 3.33:1 | 3:1 |
| شارة الحكم | light | `verdict/incomplete/border` على `bg/canvas` | 3.44:1 | 3:1 |
| شارة الحكم | dark | `verdict/incomplete/border` على `bg/surface` | 3.86:1 | 3:1 |
| الوسم المحايد | light | `text/secondary (icon)` على `bg/sunken` | 7.01:1 | 3:1 |
| الوسم المحايد | dark | `text/secondary (icon)` على `bg/sunken` | 10.19:1 | 3:1 |
| وسم «ادعاء نموذج» | light | `tag/model-claim/icon` على `tag/model-claim/bg` | 4.08:1 | 3:1 |
| وسم «ادعاء نموذج» | dark | `tag/model-claim/icon` على `tag/model-claim/bg` | 5.35:1 | 3:1 |
| وسم «مبدئي» | light | `text/secondary` على `border/subtle (خط)` | 5.97:1 | 4.5:1 |
| وسم «مبدئي» | dark | `text/secondary` على `border/subtle (خط)` | 5.27:1 | 4.5:1 |
| «جارٍ» في التجهيز | light | `cycle/running/icon` على `bg/sunken` | 3.62:1 | 3:1 |
| «جارٍ» في التجهيز | dark | `cycle/running/icon` على `bg/sunken` | 7.04:1 | 3:1 |
| الشدة والدائرة | light | `border/strong` على `bg/canvas` | 3.44:1 | 3:1 |
| الشدة والدائرة | dark | `text/primary` على `border/strong` | 3.72:1 | 3:1 |
| بطاقة «قديم» | light | `text/tertiary` على `border/subtle` | 4.14:1 | 3:1 |
| بطاقة «قديم» | dark | `text/tertiary` على `border/subtle` | 3.68:1 | 3:1 |

## محاكاة عمى الألوان (Machado 2009، شدة 1.0)

لون رمز كل نتيجة بعد المحاكاة، والأزواج التي يقل فرقها عن ΔE2000 = 10 فلا يميزها اللون: يميزها شكل الرمز الداخلي والنص وحدهما.

| الوضع | النوع | اجتاز ↔ أخفق (ΔE) | أزواج متقاربة اللون |
|---|---|---|---|
| light | protanopia | 16.8 | warning↔flaky (0)، warning↔timed-out (8.8)، flaky↔timed-out (8.8)، missing↔cancelled (8.6)، missing↔interrupted (8.6)، missing↔skipped (0)، missing↔not-applicable (0)، unavailable↔cancelled (6.7)، unavailable↔interrupted (6.7)، cancelled↔interrupted (0)، cancelled↔skipped (8.6)، cancelled↔not-applicable (8.6)، interrupted↔skipped (8.6)، interrupted↔not-applicable (8.6)، skipped↔not-applicable (0) |
| light | deuteranopia | 7.1 | passed↔failed (7.1)، failed↔warning (9.2)، failed↔flaky (9.2)، warning↔flaky (0)، missing↔cancelled (8.5)، missing↔interrupted (8.5)، missing↔skipped (0)، missing↔not-applicable (0)، unavailable↔cancelled (6.5)، unavailable↔interrupted (6.5)، cancelled↔interrupted (0)، cancelled↔skipped (8.5)، cancelled↔not-applicable (8.5)، interrupted↔skipped (8.5)، interrupted↔not-applicable (8.5)، skipped↔not-applicable (0) |
| light | tritanopia | 63.5 | warning↔flaky (0)، warning↔timed-out (9.6)، flaky↔timed-out (9.6)، missing↔cancelled (8.4)، missing↔interrupted (8.4)، missing↔skipped (0)، missing↔not-applicable (0)، unavailable↔cancelled (6.9)، unavailable↔interrupted (6.9)، cancelled↔interrupted (0)، cancelled↔skipped (8.4)، cancelled↔not-applicable (8.4)، interrupted↔skipped (8.4)، interrupted↔not-applicable (8.4)، skipped↔not-applicable (0) |
| dark | protanopia | 15.5 | passed↔timed-out (8.5)، warning↔flaky (0)، missing↔unavailable (7)، missing↔cancelled (0)، missing↔interrupted (0)، missing↔skipped (9.1)، missing↔not-applicable (9.1)، unavailable↔cancelled (7)، unavailable↔interrupted (7)، cancelled↔interrupted (0)، cancelled↔skipped (9.1)، cancelled↔not-applicable (9.1)، interrupted↔skipped (9.1)، interrupted↔not-applicable (9.1)، skipped↔not-applicable (0) |
| dark | deuteranopia | 5 | passed↔failed (5)، warning↔flaky (0)، warning↔timed-out (8.5)، flaky↔timed-out (8.5)، missing↔unavailable (7.1)، missing↔cancelled (0)، missing↔interrupted (0)، missing↔skipped (9.5)، missing↔not-applicable (9.5)، unavailable↔cancelled (7.1)، unavailable↔interrupted (7.1)، cancelled↔interrupted (0)، cancelled↔skipped (9.5)، cancelled↔not-applicable (9.5)، interrupted↔skipped (9.5)، interrupted↔not-applicable (9.5)، skipped↔not-applicable (0) |
| dark | tritanopia | 66.7 | failed↔warning (8.3)، failed↔flaky (8.3)، warning↔flaky (0)، warning↔timed-out (8.6)، flaky↔timed-out (8.6)، missing↔unavailable (7.8)، missing↔cancelled (0)، missing↔interrupted (0)، missing↔skipped (9.4)، missing↔not-applicable (9.4)، unavailable↔cancelled (7.8)، unavailable↔interrupted (7.8)، cancelled↔interrupted (0)، cancelled↔skipped (9.4)، cancelled↔not-applicable (9.4)، interrupted↔skipped (9.4)، interrupted↔not-applicable (9.4)، skipped↔not-applicable (0) |

### الأشكال الداخلية لرموز النتائج

| النتيجة | الشكل |
|---|---|
| passed | علامة صح |
| failed | علامة × |
| warning | مثلث مصمت |
| needs-review | عين |
| flaky | موجة |
| missing | علامة زائد |
| unavailable | مفتاح ربط مائل |
| timed-out | ساعة رملية |
| cancelled | مربع إيقاف |
| interrupted | وصلة مكسورة |
| skipped | سهم التفاف |
| not-applicable | شرطة |

## الثنائيات كاملة

| الوضع | المجموعة | المقدّم | الخلفية | النسبة | الحد | النتيجة | ملاحظة |
|---|---|---|---|---|---|---|---|
| light | شارة النتيجة | `result/passed/fg` #025D35 | `result/passed/bg` #EDF6F0 | 7.27:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/passed/icon` #388F60 | `result/passed/bg` #EDF6F0 | 3.62:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/failed/fg` #92002C | `result/failed/bg` #FFEFEF | 8.34:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/failed/icon` #D53954 | `result/failed/bg` #FFEFEF | 4.15:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/warning/fg` #6F4100 | `result/warning/bg` #FBF2E9 | 7.80:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/warning/icon` #AD6A13 | `result/warning/bg` #FBF2E9 | 3.91:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/needs-review/fg` #562BA3 | `result/needs-review/bg` #F4F1FF | 8.31:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/needs-review/icon` #855BE5 | `result/needs-review/bg` #F4F1FF | 4.08:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/flaky/fg` #6F4100 | `result/flaky/bg` #FBF2E9 | 7.80:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/flaky/icon` #AD6A13 | `result/flaky/bg` #FBF2E9 | 3.91:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/missing/fg` #21292E | `result/missing/bg` #EBEAE3 | 12.25:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/missing/icon` #59676C | `result/missing/bg` #EBEAE3 | 4.86:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/unavailable/fg` #141B20 | `result/unavailable/bg` #B8BCB9 | 9.05:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/unavailable/icon` #313B40 | `result/unavailable/bg` #B8BCB9 | 5.97:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/timed-out/fg` #6F4100 | `result/timed-out/bg` #EBCAAB | 5.58:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/timed-out/icon` #8D5400 | `result/timed-out/bg` #EBCAAB | 3.99:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/cancelled/fg` #141B20 | `result/cancelled/bg` #D9D9D4 | 12.28:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/cancelled/icon` #434F54 | `result/cancelled/bg` #D9D9D4 | 5.97:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/interrupted/fg` #141B20 | `result/interrupted/bg` #D9D9D4 | 12.28:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/interrupted/icon` #434F54 | `result/interrupted/bg` #D9D9D4 | 5.97:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/skipped/fg` #313B40 | `result/skipped/bg` #EBEAE3 | 9.51:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/skipped/icon` #59676C | `result/skipped/bg` #EBEAE3 | 4.86:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | شارة النتيجة | `result/not-applicable/fg` #434F54 | `result/not-applicable/bg` #F7F4EC | 7.69:1 | 4.5:1 | نجح | نص الشارة |
| light | شارة النتيجة | `result/not-applicable/icon` #59676C | `result/not-applicable/bg` #F7F4EC | 5.33:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| light | الرمز منفردًا | `result/passed/icon` #388F60 | `bg/canvas` #F7F4EC | 3.63:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/passed/icon` #388F60 | `bg/surface` #FFFCF4 | 3.89:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/passed/icon` #388F60 | `bg/elevated` #FFFCF4 | 3.89:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/passed/icon` #388F60 | `bg/sunken` #EBEAE3 | 3.31:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/passed/icon` #388F60 | `selection` #EBEAE3 | 3.31:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/failed/icon` #D53954 | `bg/canvas` #F7F4EC | 4.21:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/failed/icon` #D53954 | `bg/surface` #FFFCF4 | 4.51:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/failed/icon` #D53954 | `bg/elevated` #FFFCF4 | 4.51:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/failed/icon` #D53954 | `bg/sunken` #EBEAE3 | 3.83:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/failed/icon` #D53954 | `selection` #EBEAE3 | 3.83:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/warning/icon` #AD6A13 | `bg/canvas` #F7F4EC | 3.94:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/warning/icon` #AD6A13 | `bg/surface` #FFFCF4 | 4.23:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/warning/icon` #AD6A13 | `bg/elevated` #FFFCF4 | 4.23:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/warning/icon` #AD6A13 | `bg/sunken` #EBEAE3 | 3.59:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/warning/icon` #AD6A13 | `selection` #EBEAE3 | 3.59:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/needs-review/icon` #855BE5 | `bg/canvas` #F7F4EC | 4.13:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/needs-review/icon` #855BE5 | `bg/surface` #FFFCF4 | 4.43:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/needs-review/icon` #855BE5 | `bg/elevated` #FFFCF4 | 4.43:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/needs-review/icon` #855BE5 | `bg/sunken` #EBEAE3 | 3.76:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/needs-review/icon` #855BE5 | `selection` #EBEAE3 | 3.76:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/flaky/icon` #AD6A13 | `bg/canvas` #F7F4EC | 3.94:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/flaky/icon` #AD6A13 | `bg/surface` #FFFCF4 | 4.23:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/flaky/icon` #AD6A13 | `bg/elevated` #FFFCF4 | 4.23:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/flaky/icon` #AD6A13 | `bg/sunken` #EBEAE3 | 3.59:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/flaky/icon` #AD6A13 | `selection` #EBEAE3 | 3.59:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/missing/icon` #59676C | `bg/canvas` #F7F4EC | 5.33:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/missing/icon` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/missing/icon` #59676C | `bg/elevated` #FFFCF4 | 5.72:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/missing/icon` #59676C | `bg/sunken` #EBEAE3 | 4.86:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/missing/icon` #59676C | `selection` #EBEAE3 | 4.86:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/unavailable/icon` #313B40 | `bg/canvas` #F7F4EC | 10.44:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/unavailable/icon` #313B40 | `bg/surface` #FFFCF4 | 11.19:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/unavailable/icon` #313B40 | `bg/elevated` #FFFCF4 | 11.19:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/unavailable/icon` #313B40 | `bg/sunken` #EBEAE3 | 9.51:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/unavailable/icon` #313B40 | `selection` #EBEAE3 | 9.51:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/timed-out/icon` #8D5400 | `bg/canvas` #F7F4EC | 5.62:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/timed-out/icon` #8D5400 | `bg/surface` #FFFCF4 | 6.02:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/timed-out/icon` #8D5400 | `bg/elevated` #FFFCF4 | 6.02:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/timed-out/icon` #8D5400 | `bg/sunken` #EBEAE3 | 5.12:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/timed-out/icon` #8D5400 | `selection` #EBEAE3 | 5.12:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/cancelled/icon` #434F54 | `bg/canvas` #F7F4EC | 7.69:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/cancelled/icon` #434F54 | `bg/surface` #FFFCF4 | 8.24:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/cancelled/icon` #434F54 | `bg/elevated` #FFFCF4 | 8.24:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/cancelled/icon` #434F54 | `bg/sunken` #EBEAE3 | 7.01:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/cancelled/icon` #434F54 | `selection` #EBEAE3 | 7.01:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/interrupted/icon` #434F54 | `bg/canvas` #F7F4EC | 7.69:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/interrupted/icon` #434F54 | `bg/surface` #FFFCF4 | 8.24:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/interrupted/icon` #434F54 | `bg/elevated` #FFFCF4 | 8.24:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/interrupted/icon` #434F54 | `bg/sunken` #EBEAE3 | 7.01:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/interrupted/icon` #434F54 | `selection` #EBEAE3 | 7.01:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/skipped/icon` #59676C | `bg/canvas` #F7F4EC | 5.33:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/skipped/icon` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/skipped/icon` #59676C | `bg/elevated` #FFFCF4 | 5.72:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/skipped/icon` #59676C | `bg/sunken` #EBEAE3 | 4.86:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/skipped/icon` #59676C | `selection` #EBEAE3 | 4.86:1 | 3:1 | نجح | صف محدد |
| light | الرمز منفردًا | `result/not-applicable/icon` #59676C | `bg/canvas` #F7F4EC | 5.33:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/not-applicable/icon` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/not-applicable/icon` #59676C | `bg/elevated` #FFFCF4 | 5.72:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/not-applicable/icon` #59676C | `bg/sunken` #EBEAE3 | 4.86:1 | 3:1 | نجح |  |
| light | الرمز منفردًا | `result/not-applicable/icon` #59676C | `selection` #EBEAE3 | 4.86:1 | 3:1 | نجح | صف محدد |
| light | مؤشر الدورة | `cycle/queued/fg` #313B40 | `bg/canvas` #F7F4EC | 10.44:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/queued/icon` #59676C | `bg/canvas` #F7F4EC | 5.33:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/queued/fg` #313B40 | `bg/surface` #FFFCF4 | 11.19:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/queued/icon` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/queued/fg` #313B40 | `bg/elevated` #FFFCF4 | 11.19:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/queued/icon` #59676C | `bg/elevated` #FFFCF4 | 5.72:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/queued/fg` #313B40 | `bg/sunken` #EBEAE3 | 9.51:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/queued/icon` #59676C | `bg/sunken` #EBEAE3 | 4.86:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/queued/fg` #313B40 | `selection` #EBEAE3 | 9.51:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/queued/icon` #59676C | `selection` #EBEAE3 | 4.86:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/running/fg` #083EB4 | `bg/canvas` #F7F4EC | 8.10:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/running/icon` #3170F9 | `bg/canvas` #F7F4EC | 3.97:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/running/fg` #083EB4 | `bg/surface` #FFFCF4 | 8.68:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/running/icon` #3170F9 | `bg/surface` #FFFCF4 | 4.25:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/running/fg` #083EB4 | `bg/elevated` #FFFCF4 | 8.68:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/running/icon` #3170F9 | `bg/elevated` #FFFCF4 | 4.25:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/running/fg` #083EB4 | `bg/sunken` #EBEAE3 | 7.38:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/running/icon` #3170F9 | `bg/sunken` #EBEAE3 | 3.62:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/running/fg` #083EB4 | `selection` #EBEAE3 | 7.38:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/running/icon` #3170F9 | `selection` #EBEAE3 | 3.62:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/cancelling/fg` #21292E | `bg/canvas` #F7F4EC | 13.44:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/cancelling/icon` #434F54 | `bg/canvas` #F7F4EC | 7.69:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/cancelling/fg` #21292E | `bg/surface` #FFFCF4 | 14.41:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/cancelling/icon` #434F54 | `bg/surface` #FFFCF4 | 8.24:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/cancelling/fg` #21292E | `bg/elevated` #FFFCF4 | 14.41:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/cancelling/icon` #434F54 | `bg/elevated` #FFFCF4 | 8.24:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/cancelling/fg` #21292E | `bg/sunken` #EBEAE3 | 12.25:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/cancelling/icon` #434F54 | `bg/sunken` #EBEAE3 | 7.01:1 | 3:1 | نجح | الرمز |
| light | مؤشر الدورة | `cycle/cancelling/fg` #21292E | `selection` #EBEAE3 | 12.25:1 | 4.5:1 | نجح | النص |
| light | مؤشر الدورة | `cycle/cancelling/icon` #434F54 | `selection` #EBEAE3 | 7.01:1 | 3:1 | نجح | الرمز |
| light | شارة الجاهزية | `text/secondary` #434F54 | `bg/canvas` #F7F4EC | 7.69:1 | 4.5:1 | نجح | النص |
| light | شارة الجاهزية | `border/strong` #7B8588 | `bg/canvas` #F7F4EC | 3.44:1 | 3:1 | نجح | الحد |
| light | شارة الجاهزية | `text/secondary` #434F54 | `bg/surface` #FFFCF4 | 8.24:1 | 4.5:1 | نجح | النص |
| light | شارة الجاهزية | `border/strong` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح | الحد |
| light | شارة الجاهزية | `text/secondary` #434F54 | `bg/elevated` #FFFCF4 | 8.24:1 | 4.5:1 | نجح | النص |
| light | شارة الجاهزية | `border/strong` #7B8588 | `bg/elevated` #FFFCF4 | 3.69:1 | 3:1 | نجح | الحد |
| light | شارة الجاهزية | `text/secondary` #434F54 | `bg/sunken` #EBEAE3 | 7.01:1 | 4.5:1 | نجح | النص |
| light | شارة الجاهزية | `border/strong` #7B8588 | `bg/sunken` #EBEAE3 | 3.14:1 | 3:1 | نجح | الحد |
| light | شارة الجاهزية | `text/secondary` #434F54 | `selection` #EBEAE3 | 7.01:1 | 4.5:1 | نجح | النص |
| light | شارة الجاهزية | `border/strong` #7B8588 | `selection` #EBEAE3 | 3.14:1 | 3:1 | نجح | الحد |
| light | شارة الحكم | `verdict/pure/fg` #025D35 | `verdict/pure/bg` #EDF6F0 | 7.27:1 | 4.5:1 | نجح | النص |
| light | شارة الحكم | `verdict/pure/icon` #388F60 | `verdict/pure/bg` #EDF6F0 | 3.62:1 | 3:1 | نجح | رمز Lucide |
| light | شارة الحكم | `verdict/incomplete/fg` #141B20 | `verdict/incomplete/bg` #FFFCF4 | 16.96:1 | 4.5:1 | نجح | النص |
| light | شارة الحكم | `verdict/incomplete/icon` #434F54 | `verdict/incomplete/bg` #FFFCF4 | 8.24:1 | 3:1 | نجح | رمز Lucide |
| light | شارة الحكم | `verdict/blocked/fg` #92002C | `verdict/blocked/bg` #FFEFEF | 8.34:1 | 4.5:1 | نجح | النص |
| light | شارة الحكم | `verdict/blocked/icon` #D53954 | `verdict/blocked/bg` #FFEFEF | 4.15:1 | 3:1 | نجح | رمز Lucide |
| light | شارة الحكم | `verdict/incomplete/border` #7B8588 | `bg/canvas` #F7F4EC | 3.44:1 | 3:1 | نجح | حد «غير مكتمل» |
| light | شارة الحكم | `verdict/incomplete/border` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح | حد «غير مكتمل» |
| light | الوسم المحايد | `text/secondary` #434F54 | `bg/sunken` #EBEAE3 | 7.01:1 | 4.5:1 | نجح | النص |
| light | الوسم المحايد | `text/secondary (icon)` #434F54 | `bg/sunken` #EBEAE3 | 7.01:1 | 3:1 | نجح | رمز Lucide بلون النص |
| light | وسم «ادعاء نموذج» | `tag/model-claim/fg` #562BA3 | `tag/model-claim/bg` #F4F1FF | 8.31:1 | 4.5:1 | نجح | النص |
| light | وسم «ادعاء نموذج» | `tag/model-claim/icon` #855BE5 | `tag/model-claim/bg` #F4F1FF | 4.08:1 | 3:1 | نجح | فقاعة الكلام |
| light | وسم «مبدئي» | `text/secondary` #434F54 | `border/subtle (خط)` #D9D9D4 | 5.97:1 | 4.5:1 | نجح | النص فوق الخط المائل |
| light | وسم «مبدئي» | `text/secondary` #434F54 | `bg/sunken` #EBEAE3 | 7.01:1 | 4.5:1 | نجح | النص بين الخطوط |
| light | «جارٍ» في التجهيز | `cycle/running/icon` #3170F9 | `bg/sunken` #EBEAE3 | 3.62:1 | 3:1 | نجح | المؤشر الأزرق داخل الوسم |
| light | الشدة والدائرة | `text/primary` #141B20 | `bg/surface` #FFFCF4 | 16.96:1 | 3:1 | نجح | عمود أو قطعة مملوءة |
| light | الشدة والدائرة | `border/strong` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح | عمود أو قطعة فارغة |
| light | الشدة والدائرة | `text/primary` #141B20 | `bg/canvas` #F7F4EC | 15.82:1 | 3:1 | نجح | عمود أو قطعة مملوءة |
| light | الشدة والدائرة | `border/strong` #7B8588 | `bg/canvas` #F7F4EC | 3.44:1 | 3:1 | نجح | عمود أو قطعة فارغة |
| light | الشدة والدائرة | `text/primary` #141B20 | `border/strong` #7B8588 | 4.60:1 | 3:1 | نجح | المملوء مقابل الفارغ |
| light | بطاقة «قديم» | `text/secondary` #434F54 | `bg/surface` #FFFCF4 | 8.24:1 | 3:1 | نجح | رقم العيار 48 (نص كبير) |
| light | بطاقة «قديم» | `text/tertiary` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 4.5:1 | نجح | «من 24» |
| light | بطاقة «قديم» | `text/tertiary` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 3:1 | نجح | الدائرة الباهتة: قطعة مملوءة |
| light | بطاقة «قديم» | `text/tertiary` #59676C | `border/subtle` #D9D9D4 | 4.14:1 | 3:1 | نجح | الدائرة الباهتة: المملوء مقابل الفارغ |
| dark | شارة النتيجة | `result/passed/fg` #A6E5C1 | `result/passed/bg` #162D21 | 10.20:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/passed/icon` #3FB87F | `result/passed/bg` #162D21 | 5.85:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/failed/fg` #FFC2C5 | `result/failed/bg` #3C1D1F | 9.93:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/failed/icon` #F66A79 | `result/failed/bg` #3C1D1F | 5.23:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/warning/fg` #F7CC96 | `result/warning/bg` #342410 | 9.98:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/warning/icon` #D48E1F | `result/warning/bg` #342410 | 5.47:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/needs-review/fg` #D8CBFF | `result/needs-review/bg` #292438 | 9.91:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/needs-review/icon` #A68CE6 | `result/needs-review/bg` #292438 | 5.35:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/flaky/fg` #F7CC96 | `result/flaky/bg` #342410 | 9.98:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/flaky/icon` #D48E1F | `result/flaky/bg` #342410 | 5.47:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/missing/fg` #F7F4EC | `result/missing/bg` #3B454B | 8.93:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/missing/icon` #BABFBD | `result/missing/bg` #3B454B | 5.27:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/unavailable/fg` #F7F4EC | `result/unavailable/bg` #515D62 | 6.18:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/unavailable/icon` #DADBD6 | `result/unavailable/bg` #515D62 | 4.88:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/timed-out/fg` #F7CC96 | `result/timed-out/bg` #633F02 | 6.26:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/timed-out/icon` #EAAD5E | `result/timed-out/bg` #633F02 | 4.74:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/cancelled/fg` #F7F4EC | `result/cancelled/bg` #3B454B | 8.93:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/cancelled/icon` #BABFBD | `result/cancelled/bg` #3B454B | 5.27:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/interrupted/fg` #F7F4EC | `result/interrupted/bg` #3B454B | 8.93:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/interrupted/icon` #BABFBD | `result/interrupted/bg` #3B454B | 5.27:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/skipped/fg` #DADBD6 | `result/skipped/bg` #272F34 | 9.78:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/skipped/icon` #97A0A2 | `result/skipped/bg` #272F34 | 5.10:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | شارة النتيجة | `result/not-applicable/fg` #BABFBD | `result/not-applicable/bg` #272F34 | 7.31:1 | 4.5:1 | نجح | نص الشارة |
| dark | شارة النتيجة | `result/not-applicable/icon` #97A0A2 | `result/not-applicable/bg` #272F34 | 5.10:1 | 3:1 | نجح | الرمز وقطعه المفرّغ |
| dark | الرمز منفردًا | `result/passed/icon` #3FB87F | `bg/canvas` #141B20 | 6.94:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/passed/icon` #3FB87F | `bg/surface` #1C2429 | 6.28:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/passed/icon` #3FB87F | `bg/elevated` #272F34 | 5.43:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/passed/icon` #3FB87F | `bg/sunken` #0B1116 | 7.57:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/passed/icon` #3FB87F | `selection` #272F34 | 5.43:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/failed/icon` #F66A79 | `bg/canvas` #141B20 | 6.01:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/failed/icon` #F66A79 | `bg/surface` #1C2429 | 5.44:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/failed/icon` #F66A79 | `bg/elevated` #272F34 | 4.70:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/failed/icon` #F66A79 | `bg/sunken` #0B1116 | 6.56:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/failed/icon` #F66A79 | `selection` #272F34 | 4.70:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/warning/icon` #D48E1F | `bg/canvas` #141B20 | 6.37:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/warning/icon` #D48E1F | `bg/surface` #1C2429 | 5.76:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/warning/icon` #D48E1F | `bg/elevated` #272F34 | 4.98:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/warning/icon` #D48E1F | `bg/sunken` #0B1116 | 6.95:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/warning/icon` #D48E1F | `selection` #272F34 | 4.98:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/needs-review/icon` #A68CE6 | `bg/canvas` #141B20 | 6.22:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/needs-review/icon` #A68CE6 | `bg/surface` #1C2429 | 5.63:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/needs-review/icon` #A68CE6 | `bg/elevated` #272F34 | 4.87:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/needs-review/icon` #A68CE6 | `bg/sunken` #0B1116 | 6.80:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/needs-review/icon` #A68CE6 | `selection` #272F34 | 4.87:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/flaky/icon` #D48E1F | `bg/canvas` #141B20 | 6.37:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/flaky/icon` #D48E1F | `bg/surface` #1C2429 | 5.76:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/flaky/icon` #D48E1F | `bg/elevated` #272F34 | 4.98:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/flaky/icon` #D48E1F | `bg/sunken` #0B1116 | 6.95:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/flaky/icon` #D48E1F | `selection` #272F34 | 4.98:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/missing/icon` #BABFBD | `bg/canvas` #141B20 | 9.34:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/missing/icon` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/missing/icon` #BABFBD | `bg/elevated` #272F34 | 7.31:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/missing/icon` #BABFBD | `bg/sunken` #0B1116 | 10.19:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/missing/icon` #BABFBD | `selection` #272F34 | 7.31:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/unavailable/icon` #DADBD6 | `bg/canvas` #141B20 | 12.49:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/unavailable/icon` #DADBD6 | `bg/surface` #1C2429 | 11.31:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/unavailable/icon` #DADBD6 | `bg/elevated` #272F34 | 9.78:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/unavailable/icon` #DADBD6 | `bg/sunken` #0B1116 | 13.64:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/unavailable/icon` #DADBD6 | `selection` #272F34 | 9.78:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/timed-out/icon` #EAAD5E | `bg/canvas` #141B20 | 8.81:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/timed-out/icon` #EAAD5E | `bg/surface` #1C2429 | 7.98:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/timed-out/icon` #EAAD5E | `bg/elevated` #272F34 | 6.90:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/timed-out/icon` #EAAD5E | `bg/sunken` #0B1116 | 9.62:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/timed-out/icon` #EAAD5E | `selection` #272F34 | 6.90:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/cancelled/icon` #BABFBD | `bg/canvas` #141B20 | 9.34:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/cancelled/icon` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/cancelled/icon` #BABFBD | `bg/elevated` #272F34 | 7.31:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/cancelled/icon` #BABFBD | `bg/sunken` #0B1116 | 10.19:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/cancelled/icon` #BABFBD | `selection` #272F34 | 7.31:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/interrupted/icon` #BABFBD | `bg/canvas` #141B20 | 9.34:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/interrupted/icon` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/interrupted/icon` #BABFBD | `bg/elevated` #272F34 | 7.31:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/interrupted/icon` #BABFBD | `bg/sunken` #0B1116 | 10.19:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/interrupted/icon` #BABFBD | `selection` #272F34 | 7.31:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/skipped/icon` #97A0A2 | `bg/canvas` #141B20 | 6.51:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/skipped/icon` #97A0A2 | `bg/surface` #1C2429 | 5.90:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/skipped/icon` #97A0A2 | `bg/elevated` #272F34 | 5.10:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/skipped/icon` #97A0A2 | `bg/sunken` #0B1116 | 7.11:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/skipped/icon` #97A0A2 | `selection` #272F34 | 5.10:1 | 3:1 | نجح | صف محدد |
| dark | الرمز منفردًا | `result/not-applicable/icon` #97A0A2 | `bg/canvas` #141B20 | 6.51:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/not-applicable/icon` #97A0A2 | `bg/surface` #1C2429 | 5.90:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/not-applicable/icon` #97A0A2 | `bg/elevated` #272F34 | 5.10:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/not-applicable/icon` #97A0A2 | `bg/sunken` #0B1116 | 7.11:1 | 3:1 | نجح |  |
| dark | الرمز منفردًا | `result/not-applicable/icon` #97A0A2 | `selection` #272F34 | 5.10:1 | 3:1 | نجح | صف محدد |
| dark | مؤشر الدورة | `cycle/queued/fg` #BABFBD | `bg/canvas` #141B20 | 9.34:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/queued/icon` #97A0A2 | `bg/canvas` #141B20 | 6.51:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/queued/fg` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/queued/icon` #97A0A2 | `bg/surface` #1C2429 | 5.90:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/queued/fg` #BABFBD | `bg/elevated` #272F34 | 7.31:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/queued/icon` #97A0A2 | `bg/elevated` #272F34 | 5.10:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/queued/fg` #BABFBD | `bg/sunken` #0B1116 | 10.19:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/queued/icon` #97A0A2 | `bg/sunken` #0B1116 | 7.11:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/queued/fg` #BABFBD | `selection` #272F34 | 7.31:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/queued/icon` #97A0A2 | `selection` #272F34 | 5.10:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/running/fg` #BDD5FF | `bg/canvas` #141B20 | 11.70:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/running/icon` #699DF9 | `bg/canvas` #141B20 | 6.45:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/running/fg` #BDD5FF | `bg/surface` #1C2429 | 10.59:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/running/icon` #699DF9 | `bg/surface` #1C2429 | 5.84:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/running/fg` #BDD5FF | `bg/elevated` #272F34 | 9.16:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/running/icon` #699DF9 | `bg/elevated` #272F34 | 5.05:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/running/fg` #BDD5FF | `bg/sunken` #0B1116 | 12.77:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/running/icon` #699DF9 | `bg/sunken` #0B1116 | 7.04:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/running/fg` #BDD5FF | `selection` #272F34 | 9.16:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/running/icon` #699DF9 | `selection` #272F34 | 5.05:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/cancelling/fg` #F7F4EC | `bg/canvas` #141B20 | 15.82:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/cancelling/icon` #BABFBD | `bg/canvas` #141B20 | 9.34:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/cancelling/fg` #F7F4EC | `bg/surface` #1C2429 | 14.33:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/cancelling/icon` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/cancelling/fg` #F7F4EC | `bg/elevated` #272F34 | 12.39:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/cancelling/icon` #BABFBD | `bg/elevated` #272F34 | 7.31:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/cancelling/fg` #F7F4EC | `bg/sunken` #0B1116 | 17.28:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/cancelling/icon` #BABFBD | `bg/sunken` #0B1116 | 10.19:1 | 3:1 | نجح | الرمز |
| dark | مؤشر الدورة | `cycle/cancelling/fg` #F7F4EC | `selection` #272F34 | 12.39:1 | 4.5:1 | نجح | النص |
| dark | مؤشر الدورة | `cycle/cancelling/icon` #BABFBD | `selection` #272F34 | 7.31:1 | 3:1 | نجح | الرمز |
| dark | شارة الجاهزية | `text/secondary` #BABFBD | `bg/canvas` #141B20 | 9.34:1 | 4.5:1 | نجح | النص |
| dark | شارة الجاهزية | `border/strong` #728085 | `bg/canvas` #141B20 | 4.26:1 | 3:1 | نجح | الحد |
| dark | شارة الجاهزية | `text/secondary` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 4.5:1 | نجح | النص |
| dark | شارة الجاهزية | `border/strong` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح | الحد |
| dark | شارة الجاهزية | `text/secondary` #BABFBD | `bg/elevated` #272F34 | 7.31:1 | 4.5:1 | نجح | النص |
| dark | شارة الجاهزية | `border/strong` #728085 | `bg/elevated` #272F34 | 3.33:1 | 3:1 | نجح | الحد |
| dark | شارة الجاهزية | `text/secondary` #BABFBD | `bg/sunken` #0B1116 | 10.19:1 | 4.5:1 | نجح | النص |
| dark | شارة الجاهزية | `border/strong` #728085 | `bg/sunken` #0B1116 | 4.65:1 | 3:1 | نجح | الحد |
| dark | شارة الجاهزية | `text/secondary` #BABFBD | `selection` #272F34 | 7.31:1 | 4.5:1 | نجح | النص |
| dark | شارة الجاهزية | `border/strong` #728085 | `selection` #272F34 | 3.33:1 | 3:1 | نجح | الحد |
| dark | شارة الحكم | `verdict/pure/fg` #A6E5C1 | `verdict/pure/bg` #162D21 | 10.20:1 | 4.5:1 | نجح | النص |
| dark | شارة الحكم | `verdict/pure/icon` #3FB87F | `verdict/pure/bg` #162D21 | 5.85:1 | 3:1 | نجح | رمز Lucide |
| dark | شارة الحكم | `verdict/incomplete/fg` #F7F4EC | `verdict/incomplete/bg` #1C2429 | 14.33:1 | 4.5:1 | نجح | النص |
| dark | شارة الحكم | `verdict/incomplete/icon` #BABFBD | `verdict/incomplete/bg` #1C2429 | 8.45:1 | 3:1 | نجح | رمز Lucide |
| dark | شارة الحكم | `verdict/blocked/fg` #FFC2C5 | `verdict/blocked/bg` #3C1D1F | 9.93:1 | 4.5:1 | نجح | النص |
| dark | شارة الحكم | `verdict/blocked/icon` #F66A79 | `verdict/blocked/bg` #3C1D1F | 5.23:1 | 3:1 | نجح | رمز Lucide |
| dark | شارة الحكم | `verdict/incomplete/border` #728085 | `bg/canvas` #141B20 | 4.26:1 | 3:1 | نجح | حد «غير مكتمل» |
| dark | شارة الحكم | `verdict/incomplete/border` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح | حد «غير مكتمل» |
| dark | الوسم المحايد | `text/secondary` #BABFBD | `bg/sunken` #0B1116 | 10.19:1 | 4.5:1 | نجح | النص |
| dark | الوسم المحايد | `text/secondary (icon)` #BABFBD | `bg/sunken` #0B1116 | 10.19:1 | 3:1 | نجح | رمز Lucide بلون النص |
| dark | وسم «ادعاء نموذج» | `tag/model-claim/fg` #D8CBFF | `tag/model-claim/bg` #292438 | 9.91:1 | 4.5:1 | نجح | النص |
| dark | وسم «ادعاء نموذج» | `tag/model-claim/icon` #A68CE6 | `tag/model-claim/bg` #292438 | 5.35:1 | 3:1 | نجح | فقاعة الكلام |
| dark | وسم «مبدئي» | `text/secondary` #BABFBD | `border/subtle (خط)` #3B454B | 5.27:1 | 4.5:1 | نجح | النص فوق الخط المائل |
| dark | وسم «مبدئي» | `text/secondary` #BABFBD | `bg/sunken` #0B1116 | 10.19:1 | 4.5:1 | نجح | النص بين الخطوط |
| dark | «جارٍ» في التجهيز | `cycle/running/icon` #699DF9 | `bg/sunken` #0B1116 | 7.04:1 | 3:1 | نجح | المؤشر الأزرق داخل الوسم |
| dark | الشدة والدائرة | `text/primary` #F7F4EC | `bg/surface` #1C2429 | 14.33:1 | 3:1 | نجح | عمود أو قطعة مملوءة |
| dark | الشدة والدائرة | `border/strong` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح | عمود أو قطعة فارغة |
| dark | الشدة والدائرة | `text/primary` #F7F4EC | `bg/canvas` #141B20 | 15.82:1 | 3:1 | نجح | عمود أو قطعة مملوءة |
| dark | الشدة والدائرة | `border/strong` #728085 | `bg/canvas` #141B20 | 4.26:1 | 3:1 | نجح | عمود أو قطعة فارغة |
| dark | الشدة والدائرة | `text/primary` #F7F4EC | `border/strong` #728085 | 3.72:1 | 3:1 | نجح | المملوء مقابل الفارغ |
| dark | بطاقة «قديم» | `text/secondary` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 3:1 | نجح | رقم العيار 48 (نص كبير) |
| dark | بطاقة «قديم» | `text/tertiary` #97A0A2 | `bg/surface` #1C2429 | 5.90:1 | 4.5:1 | نجح | «من 24» |
| dark | بطاقة «قديم» | `text/tertiary` #97A0A2 | `bg/surface` #1C2429 | 5.90:1 | 3:1 | نجح | الدائرة الباهتة: قطعة مملوءة |
| dark | بطاقة «قديم» | `text/tertiary` #97A0A2 | `border/subtle` #3B454B | 3.68:1 | 3:1 | نجح | الدائرة الباهتة: المملوء مقابل الفارغ |

## معلوماتي (غير ملزم)

الخط المائل في «مبدئي» زخرفة خفيفة يرافقها النص دائمًا، و«لا نطاق» في الدائرة يرافقه سطر «لا يوجد نطاق قابل للقياس» ولا رقم.

| الوضع | الثنائية | النسبة |
|---|---|---|
| light | border/subtle (خط «مبدئي») ↔ bg/sunken | 1.17:1 |
| light | border/subtle (دائرة «لا نطاق») ↔ bg/surface | 1.38:1 |
| dark | border/subtle (خط «مبدئي») ↔ bg/sunken | 1.93:1 |
| dark | border/subtle (دائرة «لا نطاق») ↔ bg/surface | 1.60:1 |
