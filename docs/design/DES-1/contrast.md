# جدول التباين — DES-1

> مولّد من `tokens.mjs`، لا يُحرَّر يدويًا. نسب WCAG 2.x محسوبة من القيم الست عشرية، والحد 4.5:1 للنص و3:1 للرموز والحدود وحلقة التركيز.

## الخلاصة

| البديل | الثنائيات | ناجحة | أدنى ΔE2000 عن العُرف `#A33D2F` |
|---|---|---|---|
| A — الهوية | 202 | 202 | 10.14 (`red/400` dark) |
| B — البرومبت | 202 | 202 | 10.14 (`red/400` dark) |

حد القرب من لون العُرف: ΔE2000 ≥ 10 لكل متغير واجهة في الوضعين (D-49).

## البديل A — الهوية

### السلم المحايد

| الدرجة | فاتح | داكن |
|---|---|---|
| neutral/0 | `#FFFCF4` | `#0B1116` |
| neutral/100 | `#F7F4EC` | `#141B20` |
| neutral/200 | `#EBEAE3` | `#1C2429` |
| neutral/300 | `#D9D9D4` | `#272F34` |
| neutral/400 | `#B8BCB9` | `#3B454B` |
| neutral/500 | `#7B8588` | `#515D62` |
| neutral/600 | `#59676C` | `#728085` |
| neutral/700 | `#434F54` | `#97A0A2` |
| neutral/800 | `#313B40` | `#BABFBD` |
| neutral/900 | `#21292E` | `#DADBD6` |
| neutral/1000 | `#141B20` | `#F7F4EC` |

### الثنائيات

| الوضع | المجموعة | المقدّم | الخلفية | النسبة | الحد | النتيجة |
|---|---|---|---|---|---|---|
| light | نص | `text/primary` #141B20 | `bg/canvas` #F7F4EC | 15.82:1 | 4.5:1 | نجح |
| light | نص | `text/primary` #141B20 | `bg/surface` #FFFCF4 | 16.96:1 | 4.5:1 | نجح |
| light | نص | `text/primary` #141B20 | `bg/sunken` #EBEAE3 | 14.42:1 | 4.5:1 | نجح |
| light | نص | `text/primary` #141B20 | `bg/elevated` #FFFCF4 | 16.96:1 | 4.5:1 | نجح |
| light | نص | `text/primary` #141B20 | `selection` #EBEAE3 | 14.42:1 | 4.5:1 | نجح |
| light | نص | `text/secondary` #434F54 | `bg/canvas` #F7F4EC | 7.69:1 | 4.5:1 | نجح |
| light | نص | `text/secondary` #434F54 | `bg/surface` #FFFCF4 | 8.24:1 | 4.5:1 | نجح |
| light | نص | `text/secondary` #434F54 | `bg/sunken` #EBEAE3 | 7.01:1 | 4.5:1 | نجح |
| light | نص | `text/secondary` #434F54 | `bg/elevated` #FFFCF4 | 8.24:1 | 4.5:1 | نجح |
| light | نص | `text/secondary` #434F54 | `selection` #EBEAE3 | 7.01:1 | 4.5:1 | نجح |
| light | نص | `text/tertiary` #59676C | `bg/canvas` #F7F4EC | 5.33:1 | 4.5:1 | نجح |
| light | نص | `text/tertiary` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 4.5:1 | نجح |
| light | نص | `text/tertiary` #59676C | `bg/sunken` #EBEAE3 | 4.86:1 | 4.5:1 | نجح |
| light | نص | `text/tertiary` #59676C | `bg/elevated` #FFFCF4 | 5.72:1 | 4.5:1 | نجح |
| light | نص | `text/tertiary` #59676C | `selection` #EBEAE3 | 4.86:1 | 4.5:1 | نجح |
| light | نص | `text/inverse` #F7F4EC | `text/primary (الزر الرئيسي)` #141B20 | 15.82:1 | 4.5:1 | نجح |
| light | حد وتركيز | `border/strong` #7B8588 | `bg/canvas` #F7F4EC | 3.44:1 | 3:1 | نجح |
| light | حد وتركيز | `border/strong` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح |
| light | حد وتركيز | `border/strong` #7B8588 | `bg/sunken` #EBEAE3 | 3.14:1 | 3:1 | نجح |
| light | حد وتركيز | `border/strong` #7B8588 | `bg/elevated` #FFFCF4 | 3.69:1 | 3:1 | نجح |
| light | حد وتركيز | `focus/ring` #141B20 | `bg/canvas` #F7F4EC | 15.82:1 | 3:1 | نجح |
| light | حد وتركيز | `focus/ring` #141B20 | `bg/surface` #FFFCF4 | 16.96:1 | 3:1 | نجح |
| light | حد وتركيز | `focus/ring` #141B20 | `bg/sunken` #EBEAE3 | 14.42:1 | 3:1 | نجح |
| light | حد وتركيز | `focus/ring` #141B20 | `bg/elevated` #FFFCF4 | 16.96:1 | 3:1 | نجح |
| light | حد وتركيز | `focus/ring` #141B20 | `selection` #EBEAE3 | 14.42:1 | 3:1 | نجح |
| light | حالة | `result/passed/fg` #025D35 | `result/passed/bg` #EDF6F0 | 7.27:1 | 4.5:1 | نجح |
| light | حالة | `result/passed/icon` #388F60 | `result/passed/bg` #EDF6F0 | 3.62:1 | 3:1 | نجح |
| light | حالة | `result/passed/icon` #388F60 | `bg/surface` #FFFCF4 | 3.89:1 | 3:1 | نجح |
| light | حالة | `result/passed/border` #388F60 | `bg/surface` #FFFCF4 | 3.89:1 | 3:1 | نجح |
| light | حالة | `result/failed/fg` #92002C | `result/failed/bg` #FFEFEF | 8.34:1 | 4.5:1 | نجح |
| light | حالة | `result/failed/icon` #D53954 | `result/failed/bg` #FFEFEF | 4.15:1 | 3:1 | نجح |
| light | حالة | `result/failed/icon` #D53954 | `bg/surface` #FFFCF4 | 4.51:1 | 3:1 | نجح |
| light | حالة | `result/failed/border` #D53954 | `bg/surface` #FFFCF4 | 4.51:1 | 3:1 | نجح |
| light | حالة | `result/warning/fg` #6F4100 | `result/warning/bg` #FBF2E9 | 7.80:1 | 4.5:1 | نجح |
| light | حالة | `result/warning/icon` #AD6A13 | `result/warning/bg` #FBF2E9 | 3.91:1 | 3:1 | نجح |
| light | حالة | `result/warning/icon` #AD6A13 | `bg/surface` #FFFCF4 | 4.23:1 | 3:1 | نجح |
| light | حالة | `result/warning/border` #AD6A13 | `bg/surface` #FFFCF4 | 4.23:1 | 3:1 | نجح |
| light | حالة | `result/needs-review/fg` #562BA3 | `result/needs-review/bg` #F4F1FF | 8.31:1 | 4.5:1 | نجح |
| light | حالة | `result/needs-review/icon` #855BE5 | `result/needs-review/bg` #F4F1FF | 4.08:1 | 3:1 | نجح |
| light | حالة | `result/needs-review/icon` #855BE5 | `bg/surface` #FFFCF4 | 4.43:1 | 3:1 | نجح |
| light | حالة | `result/needs-review/border` #855BE5 | `bg/surface` #FFFCF4 | 4.43:1 | 3:1 | نجح |
| light | حالة | `result/flaky/fg` #6F4100 | `result/flaky/bg` #FBF2E9 | 7.80:1 | 4.5:1 | نجح |
| light | حالة | `result/flaky/icon` #AD6A13 | `result/flaky/bg` #FBF2E9 | 3.91:1 | 3:1 | نجح |
| light | حالة | `result/flaky/icon` #AD6A13 | `bg/surface` #FFFCF4 | 4.23:1 | 3:1 | نجح |
| light | حالة | `result/flaky/border` #AD6A13 | `bg/surface` #FFFCF4 | 4.23:1 | 3:1 | نجح |
| light | حالة | `result/missing/fg` #21292E | `result/missing/bg` #EBEAE3 | 12.25:1 | 4.5:1 | نجح |
| light | حالة | `result/missing/icon` #59676C | `result/missing/bg` #EBEAE3 | 4.86:1 | 3:1 | نجح |
| light | حالة | `result/missing/icon` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 3:1 | نجح |
| light | حالة | `result/missing/border` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح |
| light | حالة | `result/unavailable/fg` #141B20 | `result/unavailable/bg` #B8BCB9 | 9.05:1 | 4.5:1 | نجح |
| light | حالة | `result/unavailable/icon` #313B40 | `result/unavailable/bg` #B8BCB9 | 5.97:1 | 3:1 | نجح |
| light | حالة | `result/unavailable/icon` #313B40 | `bg/surface` #FFFCF4 | 11.19:1 | 3:1 | نجح |
| light | حالة | `result/unavailable/border` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 3:1 | نجح |
| light | حالة | `result/timed-out/fg` #6F4100 | `result/timed-out/bg` #EBCAAB | 5.58:1 | 4.5:1 | نجح |
| light | حالة | `result/timed-out/icon` #8D5400 | `result/timed-out/bg` #EBCAAB | 3.99:1 | 3:1 | نجح |
| light | حالة | `result/timed-out/icon` #8D5400 | `bg/surface` #FFFCF4 | 6.02:1 | 3:1 | نجح |
| light | حالة | `result/timed-out/border` #8D5400 | `bg/surface` #FFFCF4 | 6.02:1 | 3:1 | نجح |
| light | حالة | `result/cancelled/fg` #141B20 | `result/cancelled/bg` #D9D9D4 | 12.28:1 | 4.5:1 | نجح |
| light | حالة | `result/cancelled/icon` #434F54 | `result/cancelled/bg` #D9D9D4 | 5.97:1 | 3:1 | نجح |
| light | حالة | `result/cancelled/icon` #434F54 | `bg/surface` #FFFCF4 | 8.24:1 | 3:1 | نجح |
| light | حالة | `result/cancelled/border` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح |
| light | حالة | `result/interrupted/fg` #141B20 | `result/interrupted/bg` #D9D9D4 | 12.28:1 | 4.5:1 | نجح |
| light | حالة | `result/interrupted/icon` #434F54 | `result/interrupted/bg` #D9D9D4 | 5.97:1 | 3:1 | نجح |
| light | حالة | `result/interrupted/icon` #434F54 | `bg/surface` #FFFCF4 | 8.24:1 | 3:1 | نجح |
| light | حالة | `result/interrupted/border` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح |
| light | حالة | `result/skipped/fg` #313B40 | `result/skipped/bg` #EBEAE3 | 9.51:1 | 4.5:1 | نجح |
| light | حالة | `result/skipped/icon` #59676C | `result/skipped/bg` #EBEAE3 | 4.86:1 | 3:1 | نجح |
| light | حالة | `result/skipped/icon` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 3:1 | نجح |
| light | حالة | `result/skipped/border` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح |
| light | حالة | `result/not-applicable/fg` #434F54 | `result/not-applicable/bg` #F7F4EC | 7.69:1 | 4.5:1 | نجح |
| light | حالة | `result/not-applicable/icon` #59676C | `result/not-applicable/bg` #F7F4EC | 5.33:1 | 3:1 | نجح |
| light | حالة | `result/not-applicable/icon` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 3:1 | نجح |
| light | حالة | `result/not-applicable/border` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح |
| light | حالة | `cycle/queued/fg` #313B40 | `cycle/queued/bg` #F7F4EC | 10.44:1 | 4.5:1 | نجح |
| light | حالة | `cycle/queued/icon` #59676C | `cycle/queued/bg` #F7F4EC | 5.33:1 | 3:1 | نجح |
| light | حالة | `cycle/queued/icon` #59676C | `bg/surface` #FFFCF4 | 5.72:1 | 3:1 | نجح |
| light | حالة | `cycle/queued/border` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح |
| light | حالة | `cycle/running/fg` #083EB4 | `cycle/running/bg` #EEF4FF | 8.06:1 | 4.5:1 | نجح |
| light | حالة | `cycle/running/icon` #3170F9 | `cycle/running/bg` #EEF4FF | 3.95:1 | 3:1 | نجح |
| light | حالة | `cycle/running/icon` #3170F9 | `bg/surface` #FFFCF4 | 4.25:1 | 3:1 | نجح |
| light | حالة | `cycle/running/border` #3170F9 | `bg/surface` #FFFCF4 | 4.25:1 | 3:1 | نجح |
| light | حالة | `cycle/cancelling/fg` #21292E | `cycle/cancelling/bg` #EBEAE3 | 12.25:1 | 4.5:1 | نجح |
| light | حالة | `cycle/cancelling/icon` #434F54 | `cycle/cancelling/bg` #EBEAE3 | 7.01:1 | 3:1 | نجح |
| light | حالة | `cycle/cancelling/icon` #434F54 | `bg/surface` #FFFCF4 | 8.24:1 | 3:1 | نجح |
| light | حالة | `cycle/cancelling/border` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح |
| light | حالة | `verdict/pure/fg` #025D35 | `verdict/pure/bg` #EDF6F0 | 7.27:1 | 4.5:1 | نجح |
| light | حالة | `verdict/pure/icon` #388F60 | `verdict/pure/bg` #EDF6F0 | 3.62:1 | 3:1 | نجح |
| light | حالة | `verdict/pure/icon` #388F60 | `bg/surface` #FFFCF4 | 3.89:1 | 3:1 | نجح |
| light | حالة | `verdict/pure/border` #388F60 | `bg/surface` #FFFCF4 | 3.89:1 | 3:1 | نجح |
| light | حالة | `verdict/incomplete/fg` #141B20 | `verdict/incomplete/bg` #FFFCF4 | 16.96:1 | 4.5:1 | نجح |
| light | حالة | `verdict/incomplete/icon` #434F54 | `verdict/incomplete/bg` #FFFCF4 | 8.24:1 | 3:1 | نجح |
| light | حالة | `verdict/incomplete/icon` #434F54 | `bg/surface` #FFFCF4 | 8.24:1 | 3:1 | نجح |
| light | حالة | `verdict/incomplete/border` #7B8588 | `bg/surface` #FFFCF4 | 3.69:1 | 3:1 | نجح |
| light | حالة | `verdict/blocked/fg` #92002C | `verdict/blocked/bg` #FFEFEF | 8.34:1 | 4.5:1 | نجح |
| light | حالة | `verdict/blocked/icon` #D53954 | `verdict/blocked/bg` #FFEFEF | 4.15:1 | 3:1 | نجح |
| light | حالة | `verdict/blocked/icon` #D53954 | `bg/surface` #FFFCF4 | 4.51:1 | 3:1 | نجح |
| light | حالة | `verdict/blocked/border` #D53954 | `bg/surface` #FFFCF4 | 4.51:1 | 3:1 | نجح |
| light | حالة | `tag/model-claim/fg` #562BA3 | `tag/model-claim/bg` #F4F1FF | 8.31:1 | 4.5:1 | نجح |
| light | حالة | `tag/model-claim/icon` #855BE5 | `tag/model-claim/bg` #F4F1FF | 4.08:1 | 3:1 | نجح |
| light | حالة | `tag/model-claim/icon` #855BE5 | `bg/surface` #FFFCF4 | 4.43:1 | 3:1 | نجح |
| light | حالة | `tag/model-claim/border` #855BE5 | `bg/surface` #FFFCF4 | 4.43:1 | 3:1 | نجح |
| dark | نص | `text/primary` #F7F4EC | `bg/canvas` #141B20 | 15.82:1 | 4.5:1 | نجح |
| dark | نص | `text/primary` #F7F4EC | `bg/surface` #1C2429 | 14.33:1 | 4.5:1 | نجح |
| dark | نص | `text/primary` #F7F4EC | `bg/sunken` #0B1116 | 17.28:1 | 4.5:1 | نجح |
| dark | نص | `text/primary` #F7F4EC | `bg/elevated` #272F34 | 12.39:1 | 4.5:1 | نجح |
| dark | نص | `text/primary` #F7F4EC | `selection` #272F34 | 12.39:1 | 4.5:1 | نجح |
| dark | نص | `text/secondary` #BABFBD | `bg/canvas` #141B20 | 9.34:1 | 4.5:1 | نجح |
| dark | نص | `text/secondary` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 4.5:1 | نجح |
| dark | نص | `text/secondary` #BABFBD | `bg/sunken` #0B1116 | 10.19:1 | 4.5:1 | نجح |
| dark | نص | `text/secondary` #BABFBD | `bg/elevated` #272F34 | 7.31:1 | 4.5:1 | نجح |
| dark | نص | `text/secondary` #BABFBD | `selection` #272F34 | 7.31:1 | 4.5:1 | نجح |
| dark | نص | `text/tertiary` #97A0A2 | `bg/canvas` #141B20 | 6.51:1 | 4.5:1 | نجح |
| dark | نص | `text/tertiary` #97A0A2 | `bg/surface` #1C2429 | 5.90:1 | 4.5:1 | نجح |
| dark | نص | `text/tertiary` #97A0A2 | `bg/sunken` #0B1116 | 7.11:1 | 4.5:1 | نجح |
| dark | نص | `text/tertiary` #97A0A2 | `bg/elevated` #272F34 | 5.10:1 | 4.5:1 | نجح |
| dark | نص | `text/tertiary` #97A0A2 | `selection` #272F34 | 5.10:1 | 4.5:1 | نجح |
| dark | نص | `text/inverse` #141B20 | `text/primary (الزر الرئيسي)` #F7F4EC | 15.82:1 | 4.5:1 | نجح |
| dark | حد وتركيز | `border/strong` #728085 | `bg/canvas` #141B20 | 4.26:1 | 3:1 | نجح |
| dark | حد وتركيز | `border/strong` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح |
| dark | حد وتركيز | `border/strong` #728085 | `bg/sunken` #0B1116 | 4.65:1 | 3:1 | نجح |
| dark | حد وتركيز | `border/strong` #728085 | `bg/elevated` #272F34 | 3.33:1 | 3:1 | نجح |
| dark | حد وتركيز | `focus/ring` #F7F4EC | `bg/canvas` #141B20 | 15.82:1 | 3:1 | نجح |
| dark | حد وتركيز | `focus/ring` #F7F4EC | `bg/surface` #1C2429 | 14.33:1 | 3:1 | نجح |
| dark | حد وتركيز | `focus/ring` #F7F4EC | `bg/sunken` #0B1116 | 17.28:1 | 3:1 | نجح |
| dark | حد وتركيز | `focus/ring` #F7F4EC | `bg/elevated` #272F34 | 12.39:1 | 3:1 | نجح |
| dark | حد وتركيز | `focus/ring` #F7F4EC | `selection` #272F34 | 12.39:1 | 3:1 | نجح |
| dark | حالة | `result/passed/fg` #A6E5C1 | `result/passed/bg` #162D21 | 10.20:1 | 4.5:1 | نجح |
| dark | حالة | `result/passed/icon` #3FB87F | `result/passed/bg` #162D21 | 5.85:1 | 3:1 | نجح |
| dark | حالة | `result/passed/icon` #3FB87F | `bg/surface` #1C2429 | 6.28:1 | 3:1 | نجح |
| dark | حالة | `result/passed/border` #3FB87F | `bg/surface` #1C2429 | 6.28:1 | 3:1 | نجح |
| dark | حالة | `result/failed/fg` #FFC2C5 | `result/failed/bg` #3C1D1F | 9.93:1 | 4.5:1 | نجح |
| dark | حالة | `result/failed/icon` #F66A79 | `result/failed/bg` #3C1D1F | 5.23:1 | 3:1 | نجح |
| dark | حالة | `result/failed/icon` #F66A79 | `bg/surface` #1C2429 | 5.44:1 | 3:1 | نجح |
| dark | حالة | `result/failed/border` #F66A79 | `bg/surface` #1C2429 | 5.44:1 | 3:1 | نجح |
| dark | حالة | `result/warning/fg` #F7CC96 | `result/warning/bg` #342410 | 9.98:1 | 4.5:1 | نجح |
| dark | حالة | `result/warning/icon` #D48E1F | `result/warning/bg` #342410 | 5.47:1 | 3:1 | نجح |
| dark | حالة | `result/warning/icon` #D48E1F | `bg/surface` #1C2429 | 5.76:1 | 3:1 | نجح |
| dark | حالة | `result/warning/border` #D48E1F | `bg/surface` #1C2429 | 5.76:1 | 3:1 | نجح |
| dark | حالة | `result/needs-review/fg` #D8CBFF | `result/needs-review/bg` #292438 | 9.91:1 | 4.5:1 | نجح |
| dark | حالة | `result/needs-review/icon` #A68CE6 | `result/needs-review/bg` #292438 | 5.35:1 | 3:1 | نجح |
| dark | حالة | `result/needs-review/icon` #A68CE6 | `bg/surface` #1C2429 | 5.63:1 | 3:1 | نجح |
| dark | حالة | `result/needs-review/border` #A68CE6 | `bg/surface` #1C2429 | 5.63:1 | 3:1 | نجح |
| dark | حالة | `result/flaky/fg` #F7CC96 | `result/flaky/bg` #342410 | 9.98:1 | 4.5:1 | نجح |
| dark | حالة | `result/flaky/icon` #D48E1F | `result/flaky/bg` #342410 | 5.47:1 | 3:1 | نجح |
| dark | حالة | `result/flaky/icon` #D48E1F | `bg/surface` #1C2429 | 5.76:1 | 3:1 | نجح |
| dark | حالة | `result/flaky/border` #D48E1F | `bg/surface` #1C2429 | 5.76:1 | 3:1 | نجح |
| dark | حالة | `result/missing/fg` #F7F4EC | `result/missing/bg` #3B454B | 8.93:1 | 4.5:1 | نجح |
| dark | حالة | `result/missing/icon` #BABFBD | `result/missing/bg` #3B454B | 5.27:1 | 3:1 | نجح |
| dark | حالة | `result/missing/icon` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 3:1 | نجح |
| dark | حالة | `result/missing/border` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح |
| dark | حالة | `result/unavailable/fg` #F7F4EC | `result/unavailable/bg` #515D62 | 6.18:1 | 4.5:1 | نجح |
| dark | حالة | `result/unavailable/icon` #DADBD6 | `result/unavailable/bg` #515D62 | 4.88:1 | 3:1 | نجح |
| dark | حالة | `result/unavailable/icon` #DADBD6 | `bg/surface` #1C2429 | 11.31:1 | 3:1 | نجح |
| dark | حالة | `result/unavailable/border` #97A0A2 | `bg/surface` #1C2429 | 5.90:1 | 3:1 | نجح |
| dark | حالة | `result/timed-out/fg` #F7CC96 | `result/timed-out/bg` #633F02 | 6.26:1 | 4.5:1 | نجح |
| dark | حالة | `result/timed-out/icon` #EAAD5E | `result/timed-out/bg` #633F02 | 4.74:1 | 3:1 | نجح |
| dark | حالة | `result/timed-out/icon` #EAAD5E | `bg/surface` #1C2429 | 7.98:1 | 3:1 | نجح |
| dark | حالة | `result/timed-out/border` #EAAD5E | `bg/surface` #1C2429 | 7.98:1 | 3:1 | نجح |
| dark | حالة | `result/cancelled/fg` #F7F4EC | `result/cancelled/bg` #3B454B | 8.93:1 | 4.5:1 | نجح |
| dark | حالة | `result/cancelled/icon` #BABFBD | `result/cancelled/bg` #3B454B | 5.27:1 | 3:1 | نجح |
| dark | حالة | `result/cancelled/icon` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 3:1 | نجح |
| dark | حالة | `result/cancelled/border` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح |
| dark | حالة | `result/interrupted/fg` #F7F4EC | `result/interrupted/bg` #3B454B | 8.93:1 | 4.5:1 | نجح |
| dark | حالة | `result/interrupted/icon` #BABFBD | `result/interrupted/bg` #3B454B | 5.27:1 | 3:1 | نجح |
| dark | حالة | `result/interrupted/icon` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 3:1 | نجح |
| dark | حالة | `result/interrupted/border` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح |
| dark | حالة | `result/skipped/fg` #DADBD6 | `result/skipped/bg` #272F34 | 9.78:1 | 4.5:1 | نجح |
| dark | حالة | `result/skipped/icon` #97A0A2 | `result/skipped/bg` #272F34 | 5.10:1 | 3:1 | نجح |
| dark | حالة | `result/skipped/icon` #97A0A2 | `bg/surface` #1C2429 | 5.90:1 | 3:1 | نجح |
| dark | حالة | `result/skipped/border` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح |
| dark | حالة | `result/not-applicable/fg` #BABFBD | `result/not-applicable/bg` #272F34 | 7.31:1 | 4.5:1 | نجح |
| dark | حالة | `result/not-applicable/icon` #97A0A2 | `result/not-applicable/bg` #272F34 | 5.10:1 | 3:1 | نجح |
| dark | حالة | `result/not-applicable/icon` #97A0A2 | `bg/surface` #1C2429 | 5.90:1 | 3:1 | نجح |
| dark | حالة | `result/not-applicable/border` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح |
| dark | حالة | `cycle/queued/fg` #BABFBD | `cycle/queued/bg` #272F34 | 7.31:1 | 4.5:1 | نجح |
| dark | حالة | `cycle/queued/icon` #97A0A2 | `cycle/queued/bg` #272F34 | 5.10:1 | 3:1 | نجح |
| dark | حالة | `cycle/queued/icon` #97A0A2 | `bg/surface` #1C2429 | 5.90:1 | 3:1 | نجح |
| dark | حالة | `cycle/queued/border` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح |
| dark | حالة | `cycle/running/fg` #BDD5FF | `cycle/running/bg` #1C283C | 9.96:1 | 4.5:1 | نجح |
| dark | حالة | `cycle/running/icon` #699DF9 | `cycle/running/bg` #1C283C | 5.49:1 | 3:1 | نجح |
| dark | حالة | `cycle/running/icon` #699DF9 | `bg/surface` #1C2429 | 5.84:1 | 3:1 | نجح |
| dark | حالة | `cycle/running/border` #699DF9 | `bg/surface` #1C2429 | 5.84:1 | 3:1 | نجح |
| dark | حالة | `cycle/cancelling/fg` #F7F4EC | `cycle/cancelling/bg` #3B454B | 8.93:1 | 4.5:1 | نجح |
| dark | حالة | `cycle/cancelling/icon` #BABFBD | `cycle/cancelling/bg` #3B454B | 5.27:1 | 3:1 | نجح |
| dark | حالة | `cycle/cancelling/icon` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 3:1 | نجح |
| dark | حالة | `cycle/cancelling/border` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح |
| dark | حالة | `verdict/pure/fg` #A6E5C1 | `verdict/pure/bg` #162D21 | 10.20:1 | 4.5:1 | نجح |
| dark | حالة | `verdict/pure/icon` #3FB87F | `verdict/pure/bg` #162D21 | 5.85:1 | 3:1 | نجح |
| dark | حالة | `verdict/pure/icon` #3FB87F | `bg/surface` #1C2429 | 6.28:1 | 3:1 | نجح |
| dark | حالة | `verdict/pure/border` #3FB87F | `bg/surface` #1C2429 | 6.28:1 | 3:1 | نجح |
| dark | حالة | `verdict/incomplete/fg` #F7F4EC | `verdict/incomplete/bg` #1C2429 | 14.33:1 | 4.5:1 | نجح |
| dark | حالة | `verdict/incomplete/icon` #BABFBD | `verdict/incomplete/bg` #1C2429 | 8.45:1 | 3:1 | نجح |
| dark | حالة | `verdict/incomplete/icon` #BABFBD | `bg/surface` #1C2429 | 8.45:1 | 3:1 | نجح |
| dark | حالة | `verdict/incomplete/border` #728085 | `bg/surface` #1C2429 | 3.86:1 | 3:1 | نجح |
| dark | حالة | `verdict/blocked/fg` #FFC2C5 | `verdict/blocked/bg` #3C1D1F | 9.93:1 | 4.5:1 | نجح |
| dark | حالة | `verdict/blocked/icon` #F66A79 | `verdict/blocked/bg` #3C1D1F | 5.23:1 | 3:1 | نجح |
| dark | حالة | `verdict/blocked/icon` #F66A79 | `bg/surface` #1C2429 | 5.44:1 | 3:1 | نجح |
| dark | حالة | `verdict/blocked/border` #F66A79 | `bg/surface` #1C2429 | 5.44:1 | 3:1 | نجح |
| dark | حالة | `tag/model-claim/fg` #D8CBFF | `tag/model-claim/bg` #292438 | 9.91:1 | 4.5:1 | نجح |
| dark | حالة | `tag/model-claim/icon` #A68CE6 | `tag/model-claim/bg` #292438 | 5.35:1 | 3:1 | نجح |
| dark | حالة | `tag/model-claim/icon` #A68CE6 | `bg/surface` #1C2429 | 5.63:1 | 3:1 | نجح |
| dark | حالة | `tag/model-claim/border` #A68CE6 | `bg/surface` #1C2429 | 5.63:1 | 3:1 | نجح |

### معلوماتي (غير ملزم، D-DES1-03)

| الوضع | الثنائية | النسبة |
|---|---|---|
| light | border/subtle ↔ bg/surface | 1.38:1 |
| light | selection ↔ bg/surface | 1.18:1 |
| dark | border/subtle ↔ bg/surface | 1.60:1 |
| dark | selection ↔ bg/surface | 1.16:1 |

## البديل B — البرومبت

### السلم المحايد

| الدرجة | فاتح | داكن |
|---|---|---|
| neutral/0 | `#FEFCF7` | `#0F1114` |
| neutral/100 | `#FAF8F3` | `#121418` |
| neutral/200 | `#EAE9E6` | `#202328` |
| neutral/300 | `#D9D9D8` | `#2B2E34` |
| neutral/400 | `#B8BBBE` | `#3F444C` |
| neutral/500 | `#7D848E` | `#555B65` |
| neutral/600 | `#5B6472` | `#767E8A` |
| neutral/700 | `#474D59` | `#969FAE` |
| neutral/800 | `#343942` | `#B9BEC6` |
| neutral/900 | `#24282E` | `#DADBDB` |
| neutral/1000 | `#14161A` | `#F3F1EC` |

### الثنائيات

| الوضع | المجموعة | المقدّم | الخلفية | النسبة | الحد | النتيجة |
|---|---|---|---|---|---|---|
| light | نص | `text/primary` #14161A | `bg/canvas` #FAF8F3 | 17.07:1 | 4.5:1 | نجح |
| light | نص | `text/primary` #14161A | `bg/surface` #FEFCF7 | 17.67:1 | 4.5:1 | نجح |
| light | نص | `text/primary` #14161A | `bg/sunken` #EAE9E6 | 14.92:1 | 4.5:1 | نجح |
| light | نص | `text/primary` #14161A | `bg/elevated` #FEFCF7 | 17.67:1 | 4.5:1 | نجح |
| light | نص | `text/primary` #14161A | `selection` #EAE9E6 | 14.92:1 | 4.5:1 | نجح |
| light | نص | `text/secondary` #474D59 | `bg/canvas` #FAF8F3 | 8.00:1 | 4.5:1 | نجح |
| light | نص | `text/secondary` #474D59 | `bg/surface` #FEFCF7 | 8.28:1 | 4.5:1 | نجح |
| light | نص | `text/secondary` #474D59 | `bg/sunken` #EAE9E6 | 6.99:1 | 4.5:1 | نجح |
| light | نص | `text/secondary` #474D59 | `bg/elevated` #FEFCF7 | 8.28:1 | 4.5:1 | نجح |
| light | نص | `text/secondary` #474D59 | `selection` #EAE9E6 | 6.99:1 | 4.5:1 | نجح |
| light | نص | `text/tertiary` #5B6472 | `bg/canvas` #FAF8F3 | 5.64:1 | 4.5:1 | نجح |
| light | نص | `text/tertiary` #5B6472 | `bg/surface` #FEFCF7 | 5.83:1 | 4.5:1 | نجح |
| light | نص | `text/tertiary` #5B6472 | `bg/sunken` #EAE9E6 | 4.93:1 | 4.5:1 | نجح |
| light | نص | `text/tertiary` #5B6472 | `bg/elevated` #FEFCF7 | 5.83:1 | 4.5:1 | نجح |
| light | نص | `text/tertiary` #5B6472 | `selection` #EAE9E6 | 4.93:1 | 4.5:1 | نجح |
| light | نص | `text/inverse` #FAF8F3 | `text/primary (الزر الرئيسي)` #14161A | 17.07:1 | 4.5:1 | نجح |
| light | حد وتركيز | `border/strong` #7D848E | `bg/canvas` #FAF8F3 | 3.56:1 | 3:1 | نجح |
| light | حد وتركيز | `border/strong` #7D848E | `bg/surface` #FEFCF7 | 3.68:1 | 3:1 | نجح |
| light | حد وتركيز | `border/strong` #7D848E | `bg/sunken` #EAE9E6 | 3.11:1 | 3:1 | نجح |
| light | حد وتركيز | `border/strong` #7D848E | `bg/elevated` #FEFCF7 | 3.68:1 | 3:1 | نجح |
| light | حد وتركيز | `focus/ring` #14161A | `bg/canvas` #FAF8F3 | 17.07:1 | 3:1 | نجح |
| light | حد وتركيز | `focus/ring` #14161A | `bg/surface` #FEFCF7 | 17.67:1 | 3:1 | نجح |
| light | حد وتركيز | `focus/ring` #14161A | `bg/sunken` #EAE9E6 | 14.92:1 | 3:1 | نجح |
| light | حد وتركيز | `focus/ring` #14161A | `bg/elevated` #FEFCF7 | 17.67:1 | 3:1 | نجح |
| light | حد وتركيز | `focus/ring` #14161A | `selection` #EAE9E6 | 14.92:1 | 3:1 | نجح |
| light | حالة | `result/passed/fg` #025D35 | `result/passed/bg` #EDF6F0 | 7.27:1 | 4.5:1 | نجح |
| light | حالة | `result/passed/icon` #388F60 | `result/passed/bg` #EDF6F0 | 3.62:1 | 3:1 | نجح |
| light | حالة | `result/passed/icon` #388F60 | `bg/surface` #FEFCF7 | 3.89:1 | 3:1 | نجح |
| light | حالة | `result/passed/border` #388F60 | `bg/surface` #FEFCF7 | 3.89:1 | 3:1 | نجح |
| light | حالة | `result/failed/fg` #92002C | `result/failed/bg` #FFEFEF | 8.34:1 | 4.5:1 | نجح |
| light | حالة | `result/failed/icon` #D53954 | `result/failed/bg` #FFEFEF | 4.15:1 | 3:1 | نجح |
| light | حالة | `result/failed/icon` #D53954 | `bg/surface` #FEFCF7 | 4.51:1 | 3:1 | نجح |
| light | حالة | `result/failed/border` #D53954 | `bg/surface` #FEFCF7 | 4.51:1 | 3:1 | نجح |
| light | حالة | `result/warning/fg` #6F4100 | `result/warning/bg` #FBF2E9 | 7.80:1 | 4.5:1 | نجح |
| light | حالة | `result/warning/icon` #AD6A13 | `result/warning/bg` #FBF2E9 | 3.91:1 | 3:1 | نجح |
| light | حالة | `result/warning/icon` #AD6A13 | `bg/surface` #FEFCF7 | 4.22:1 | 3:1 | نجح |
| light | حالة | `result/warning/border` #AD6A13 | `bg/surface` #FEFCF7 | 4.22:1 | 3:1 | نجح |
| light | حالة | `result/needs-review/fg` #562BA3 | `result/needs-review/bg` #F4F1FF | 8.31:1 | 4.5:1 | نجح |
| light | حالة | `result/needs-review/icon` #855BE5 | `result/needs-review/bg` #F4F1FF | 4.08:1 | 3:1 | نجح |
| light | حالة | `result/needs-review/icon` #855BE5 | `bg/surface` #FEFCF7 | 4.43:1 | 3:1 | نجح |
| light | حالة | `result/needs-review/border` #855BE5 | `bg/surface` #FEFCF7 | 4.43:1 | 3:1 | نجح |
| light | حالة | `result/flaky/fg` #6F4100 | `result/flaky/bg` #FBF2E9 | 7.80:1 | 4.5:1 | نجح |
| light | حالة | `result/flaky/icon` #AD6A13 | `result/flaky/bg` #FBF2E9 | 3.91:1 | 3:1 | نجح |
| light | حالة | `result/flaky/icon` #AD6A13 | `bg/surface` #FEFCF7 | 4.22:1 | 3:1 | نجح |
| light | حالة | `result/flaky/border` #AD6A13 | `bg/surface` #FEFCF7 | 4.22:1 | 3:1 | نجح |
| light | حالة | `result/missing/fg` #24282E | `result/missing/bg` #EAE9E6 | 12.20:1 | 4.5:1 | نجح |
| light | حالة | `result/missing/icon` #5B6472 | `result/missing/bg` #EAE9E6 | 4.93:1 | 3:1 | نجح |
| light | حالة | `result/missing/icon` #5B6472 | `bg/surface` #FEFCF7 | 5.83:1 | 3:1 | نجح |
| light | حالة | `result/missing/border` #7D848E | `bg/surface` #FEFCF7 | 3.68:1 | 3:1 | نجح |
| light | حالة | `result/unavailable/fg` #14161A | `result/unavailable/bg` #B8BBBE | 9.39:1 | 4.5:1 | نجح |
| light | حالة | `result/unavailable/icon` #343942 | `result/unavailable/bg` #B8BBBE | 6.02:1 | 3:1 | نجح |
| light | حالة | `result/unavailable/icon` #343942 | `bg/surface` #FEFCF7 | 11.32:1 | 3:1 | نجح |
| light | حالة | `result/unavailable/border` #5B6472 | `bg/surface` #FEFCF7 | 5.83:1 | 3:1 | نجح |
| light | حالة | `result/timed-out/fg` #6F4100 | `result/timed-out/bg` #EBCAAB | 5.58:1 | 4.5:1 | نجح |
| light | حالة | `result/timed-out/icon` #8D5400 | `result/timed-out/bg` #EBCAAB | 3.99:1 | 3:1 | نجح |
| light | حالة | `result/timed-out/icon` #8D5400 | `bg/surface` #FEFCF7 | 6.02:1 | 3:1 | نجح |
| light | حالة | `result/timed-out/border` #8D5400 | `bg/surface` #FEFCF7 | 6.02:1 | 3:1 | نجح |
| light | حالة | `result/cancelled/fg` #14161A | `result/cancelled/bg` #D9D9D8 | 12.82:1 | 4.5:1 | نجح |
| light | حالة | `result/cancelled/icon` #474D59 | `result/cancelled/bg` #D9D9D8 | 6.01:1 | 3:1 | نجح |
| light | حالة | `result/cancelled/icon` #474D59 | `bg/surface` #FEFCF7 | 8.28:1 | 3:1 | نجح |
| light | حالة | `result/cancelled/border` #7D848E | `bg/surface` #FEFCF7 | 3.68:1 | 3:1 | نجح |
| light | حالة | `result/interrupted/fg` #14161A | `result/interrupted/bg` #D9D9D8 | 12.82:1 | 4.5:1 | نجح |
| light | حالة | `result/interrupted/icon` #474D59 | `result/interrupted/bg` #D9D9D8 | 6.01:1 | 3:1 | نجح |
| light | حالة | `result/interrupted/icon` #474D59 | `bg/surface` #FEFCF7 | 8.28:1 | 3:1 | نجح |
| light | حالة | `result/interrupted/border` #7D848E | `bg/surface` #FEFCF7 | 3.68:1 | 3:1 | نجح |
| light | حالة | `result/skipped/fg` #343942 | `result/skipped/bg` #EAE9E6 | 9.56:1 | 4.5:1 | نجح |
| light | حالة | `result/skipped/icon` #5B6472 | `result/skipped/bg` #EAE9E6 | 4.93:1 | 3:1 | نجح |
| light | حالة | `result/skipped/icon` #5B6472 | `bg/surface` #FEFCF7 | 5.83:1 | 3:1 | نجح |
| light | حالة | `result/skipped/border` #7D848E | `bg/surface` #FEFCF7 | 3.68:1 | 3:1 | نجح |
| light | حالة | `result/not-applicable/fg` #474D59 | `result/not-applicable/bg` #FAF8F3 | 8.00:1 | 4.5:1 | نجح |
| light | حالة | `result/not-applicable/icon` #5B6472 | `result/not-applicable/bg` #FAF8F3 | 5.64:1 | 3:1 | نجح |
| light | حالة | `result/not-applicable/icon` #5B6472 | `bg/surface` #FEFCF7 | 5.83:1 | 3:1 | نجح |
| light | حالة | `result/not-applicable/border` #7D848E | `bg/surface` #FEFCF7 | 3.68:1 | 3:1 | نجح |
| light | حالة | `cycle/queued/fg` #343942 | `cycle/queued/bg` #FAF8F3 | 10.93:1 | 4.5:1 | نجح |
| light | حالة | `cycle/queued/icon` #5B6472 | `cycle/queued/bg` #FAF8F3 | 5.64:1 | 3:1 | نجح |
| light | حالة | `cycle/queued/icon` #5B6472 | `bg/surface` #FEFCF7 | 5.83:1 | 3:1 | نجح |
| light | حالة | `cycle/queued/border` #7D848E | `bg/surface` #FEFCF7 | 3.68:1 | 3:1 | نجح |
| light | حالة | `cycle/running/fg` #083EB4 | `cycle/running/bg` #EEF4FF | 8.06:1 | 4.5:1 | نجح |
| light | حالة | `cycle/running/icon` #3170F9 | `cycle/running/bg` #EEF4FF | 3.95:1 | 3:1 | نجح |
| light | حالة | `cycle/running/icon` #3170F9 | `bg/surface` #FEFCF7 | 4.25:1 | 3:1 | نجح |
| light | حالة | `cycle/running/border` #3170F9 | `bg/surface` #FEFCF7 | 4.25:1 | 3:1 | نجح |
| light | حالة | `cycle/cancelling/fg` #24282E | `cycle/cancelling/bg` #EAE9E6 | 12.20:1 | 4.5:1 | نجح |
| light | حالة | `cycle/cancelling/icon` #474D59 | `cycle/cancelling/bg` #EAE9E6 | 6.99:1 | 3:1 | نجح |
| light | حالة | `cycle/cancelling/icon` #474D59 | `bg/surface` #FEFCF7 | 8.28:1 | 3:1 | نجح |
| light | حالة | `cycle/cancelling/border` #7D848E | `bg/surface` #FEFCF7 | 3.68:1 | 3:1 | نجح |
| light | حالة | `verdict/pure/fg` #025D35 | `verdict/pure/bg` #EDF6F0 | 7.27:1 | 4.5:1 | نجح |
| light | حالة | `verdict/pure/icon` #388F60 | `verdict/pure/bg` #EDF6F0 | 3.62:1 | 3:1 | نجح |
| light | حالة | `verdict/pure/icon` #388F60 | `bg/surface` #FEFCF7 | 3.89:1 | 3:1 | نجح |
| light | حالة | `verdict/pure/border` #388F60 | `bg/surface` #FEFCF7 | 3.89:1 | 3:1 | نجح |
| light | حالة | `verdict/incomplete/fg` #14161A | `verdict/incomplete/bg` #FEFCF7 | 17.67:1 | 4.5:1 | نجح |
| light | حالة | `verdict/incomplete/icon` #474D59 | `verdict/incomplete/bg` #FEFCF7 | 8.28:1 | 3:1 | نجح |
| light | حالة | `verdict/incomplete/icon` #474D59 | `bg/surface` #FEFCF7 | 8.28:1 | 3:1 | نجح |
| light | حالة | `verdict/incomplete/border` #7D848E | `bg/surface` #FEFCF7 | 3.68:1 | 3:1 | نجح |
| light | حالة | `verdict/blocked/fg` #92002C | `verdict/blocked/bg` #FFEFEF | 8.34:1 | 4.5:1 | نجح |
| light | حالة | `verdict/blocked/icon` #D53954 | `verdict/blocked/bg` #FFEFEF | 4.15:1 | 3:1 | نجح |
| light | حالة | `verdict/blocked/icon` #D53954 | `bg/surface` #FEFCF7 | 4.51:1 | 3:1 | نجح |
| light | حالة | `verdict/blocked/border` #D53954 | `bg/surface` #FEFCF7 | 4.51:1 | 3:1 | نجح |
| light | حالة | `tag/model-claim/fg` #562BA3 | `tag/model-claim/bg` #F4F1FF | 8.31:1 | 4.5:1 | نجح |
| light | حالة | `tag/model-claim/icon` #855BE5 | `tag/model-claim/bg` #F4F1FF | 4.08:1 | 3:1 | نجح |
| light | حالة | `tag/model-claim/icon` #855BE5 | `bg/surface` #FEFCF7 | 4.43:1 | 3:1 | نجح |
| light | حالة | `tag/model-claim/border` #855BE5 | `bg/surface` #FEFCF7 | 4.43:1 | 3:1 | نجح |
| dark | نص | `text/primary` #F3F1EC | `bg/canvas` #121418 | 16.33:1 | 4.5:1 | نجح |
| dark | نص | `text/primary` #F3F1EC | `bg/surface` #202328 | 13.96:1 | 4.5:1 | نجح |
| dark | نص | `text/primary` #F3F1EC | `bg/sunken` #0F1114 | 16.75:1 | 4.5:1 | نجح |
| dark | نص | `text/primary` #F3F1EC | `bg/elevated` #2B2E34 | 12.06:1 | 4.5:1 | نجح |
| dark | نص | `text/primary` #F3F1EC | `selection` #2B2E34 | 12.06:1 | 4.5:1 | نجح |
| dark | نص | `text/secondary` #B9BEC6 | `bg/canvas` #121418 | 9.87:1 | 4.5:1 | نجح |
| dark | نص | `text/secondary` #B9BEC6 | `bg/surface` #202328 | 8.44:1 | 4.5:1 | نجح |
| dark | نص | `text/secondary` #B9BEC6 | `bg/sunken` #0F1114 | 10.12:1 | 4.5:1 | نجح |
| dark | نص | `text/secondary` #B9BEC6 | `bg/elevated` #2B2E34 | 7.29:1 | 4.5:1 | نجح |
| dark | نص | `text/secondary` #B9BEC6 | `selection` #2B2E34 | 7.29:1 | 4.5:1 | نجح |
| dark | نص | `text/tertiary` #969FAE | `bg/canvas` #121418 | 6.91:1 | 4.5:1 | نجح |
| dark | نص | `text/tertiary` #969FAE | `bg/surface` #202328 | 5.90:1 | 4.5:1 | نجح |
| dark | نص | `text/tertiary` #969FAE | `bg/sunken` #0F1114 | 7.08:1 | 4.5:1 | نجح |
| dark | نص | `text/tertiary` #969FAE | `bg/elevated` #2B2E34 | 5.10:1 | 4.5:1 | نجح |
| dark | نص | `text/tertiary` #969FAE | `selection` #2B2E34 | 5.10:1 | 4.5:1 | نجح |
| dark | نص | `text/inverse` #121418 | `text/primary (الزر الرئيسي)` #F3F1EC | 16.33:1 | 4.5:1 | نجح |
| dark | حد وتركيز | `border/strong` #767E8A | `bg/canvas` #121418 | 4.50:1 | 3:1 | نجح |
| dark | حد وتركيز | `border/strong` #767E8A | `bg/surface` #202328 | 3.84:1 | 3:1 | نجح |
| dark | حد وتركيز | `border/strong` #767E8A | `bg/sunken` #0F1114 | 4.61:1 | 3:1 | نجح |
| dark | حد وتركيز | `border/strong` #767E8A | `bg/elevated` #2B2E34 | 3.32:1 | 3:1 | نجح |
| dark | حد وتركيز | `focus/ring` #F3F1EC | `bg/canvas` #121418 | 16.33:1 | 3:1 | نجح |
| dark | حد وتركيز | `focus/ring` #F3F1EC | `bg/surface` #202328 | 13.96:1 | 3:1 | نجح |
| dark | حد وتركيز | `focus/ring` #F3F1EC | `bg/sunken` #0F1114 | 16.75:1 | 3:1 | نجح |
| dark | حد وتركيز | `focus/ring` #F3F1EC | `bg/elevated` #2B2E34 | 12.06:1 | 3:1 | نجح |
| dark | حد وتركيز | `focus/ring` #F3F1EC | `selection` #2B2E34 | 12.06:1 | 3:1 | نجح |
| dark | حالة | `result/passed/fg` #A6E5C1 | `result/passed/bg` #162D21 | 10.20:1 | 4.5:1 | نجح |
| dark | حالة | `result/passed/icon` #3FB87F | `result/passed/bg` #162D21 | 5.85:1 | 3:1 | نجح |
| dark | حالة | `result/passed/icon` #3FB87F | `bg/surface` #202328 | 6.28:1 | 3:1 | نجح |
| dark | حالة | `result/passed/border` #3FB87F | `bg/surface` #202328 | 6.28:1 | 3:1 | نجح |
| dark | حالة | `result/failed/fg` #FFC2C5 | `result/failed/bg` #3C1D1F | 9.93:1 | 4.5:1 | نجح |
| dark | حالة | `result/failed/icon` #F66A79 | `result/failed/bg` #3C1D1F | 5.23:1 | 3:1 | نجح |
| dark | حالة | `result/failed/icon` #F66A79 | `bg/surface` #202328 | 5.45:1 | 3:1 | نجح |
| dark | حالة | `result/failed/border` #F66A79 | `bg/surface` #202328 | 5.45:1 | 3:1 | نجح |
| dark | حالة | `result/warning/fg` #F7CC96 | `result/warning/bg` #342410 | 9.98:1 | 4.5:1 | نجح |
| dark | حالة | `result/warning/icon` #D48E1F | `result/warning/bg` #342410 | 5.47:1 | 3:1 | نجح |
| dark | حالة | `result/warning/icon` #D48E1F | `bg/surface` #202328 | 5.77:1 | 3:1 | نجح |
| dark | حالة | `result/warning/border` #D48E1F | `bg/surface` #202328 | 5.77:1 | 3:1 | نجح |
| dark | حالة | `result/needs-review/fg` #D8CBFF | `result/needs-review/bg` #292438 | 9.91:1 | 4.5:1 | نجح |
| dark | حالة | `result/needs-review/icon` #A68CE6 | `result/needs-review/bg` #292438 | 5.35:1 | 3:1 | نجح |
| dark | حالة | `result/needs-review/icon` #A68CE6 | `bg/surface` #202328 | 5.64:1 | 3:1 | نجح |
| dark | حالة | `result/needs-review/border` #A68CE6 | `bg/surface` #202328 | 5.64:1 | 3:1 | نجح |
| dark | حالة | `result/flaky/fg` #F7CC96 | `result/flaky/bg` #342410 | 9.98:1 | 4.5:1 | نجح |
| dark | حالة | `result/flaky/icon` #D48E1F | `result/flaky/bg` #342410 | 5.47:1 | 3:1 | نجح |
| dark | حالة | `result/flaky/icon` #D48E1F | `bg/surface` #202328 | 5.77:1 | 3:1 | نجح |
| dark | حالة | `result/flaky/border` #D48E1F | `bg/surface` #202328 | 5.77:1 | 3:1 | نجح |
| dark | حالة | `result/missing/fg` #F3F1EC | `result/missing/bg` #3F444C | 8.68:1 | 4.5:1 | نجح |
| dark | حالة | `result/missing/icon` #B9BEC6 | `result/missing/bg` #3F444C | 5.25:1 | 3:1 | نجح |
| dark | حالة | `result/missing/icon` #B9BEC6 | `bg/surface` #202328 | 8.44:1 | 3:1 | نجح |
| dark | حالة | `result/missing/border` #767E8A | `bg/surface` #202328 | 3.84:1 | 3:1 | نجح |
| dark | حالة | `result/unavailable/fg` #F3F1EC | `result/unavailable/bg` #555B65 | 6.06:1 | 4.5:1 | نجح |
| dark | حالة | `result/unavailable/icon` #DADBDB | `result/unavailable/bg` #555B65 | 4.93:1 | 3:1 | نجح |
| dark | حالة | `result/unavailable/icon` #DADBDB | `bg/surface` #202328 | 11.36:1 | 3:1 | نجح |
| dark | حالة | `result/unavailable/border` #969FAE | `bg/surface` #202328 | 5.90:1 | 3:1 | نجح |
| dark | حالة | `result/timed-out/fg` #F7CC96 | `result/timed-out/bg` #633F02 | 6.26:1 | 4.5:1 | نجح |
| dark | حالة | `result/timed-out/icon` #EAAD5E | `result/timed-out/bg` #633F02 | 4.74:1 | 3:1 | نجح |
| dark | حالة | `result/timed-out/icon` #EAAD5E | `bg/surface` #202328 | 7.98:1 | 3:1 | نجح |
| dark | حالة | `result/timed-out/border` #EAAD5E | `bg/surface` #202328 | 7.98:1 | 3:1 | نجح |
| dark | حالة | `result/cancelled/fg` #F3F1EC | `result/cancelled/bg` #3F444C | 8.68:1 | 4.5:1 | نجح |
| dark | حالة | `result/cancelled/icon` #B9BEC6 | `result/cancelled/bg` #3F444C | 5.25:1 | 3:1 | نجح |
| dark | حالة | `result/cancelled/icon` #B9BEC6 | `bg/surface` #202328 | 8.44:1 | 3:1 | نجح |
| dark | حالة | `result/cancelled/border` #767E8A | `bg/surface` #202328 | 3.84:1 | 3:1 | نجح |
| dark | حالة | `result/interrupted/fg` #F3F1EC | `result/interrupted/bg` #3F444C | 8.68:1 | 4.5:1 | نجح |
| dark | حالة | `result/interrupted/icon` #B9BEC6 | `result/interrupted/bg` #3F444C | 5.25:1 | 3:1 | نجح |
| dark | حالة | `result/interrupted/icon` #B9BEC6 | `bg/surface` #202328 | 8.44:1 | 3:1 | نجح |
| dark | حالة | `result/interrupted/border` #767E8A | `bg/surface` #202328 | 3.84:1 | 3:1 | نجح |
| dark | حالة | `result/skipped/fg` #DADBDB | `result/skipped/bg` #2B2E34 | 9.81:1 | 4.5:1 | نجح |
| dark | حالة | `result/skipped/icon` #969FAE | `result/skipped/bg` #2B2E34 | 5.10:1 | 3:1 | نجح |
| dark | حالة | `result/skipped/icon` #969FAE | `bg/surface` #202328 | 5.90:1 | 3:1 | نجح |
| dark | حالة | `result/skipped/border` #767E8A | `bg/surface` #202328 | 3.84:1 | 3:1 | نجح |
| dark | حالة | `result/not-applicable/fg` #B9BEC6 | `result/not-applicable/bg` #2B2E34 | 7.29:1 | 4.5:1 | نجح |
| dark | حالة | `result/not-applicable/icon` #969FAE | `result/not-applicable/bg` #2B2E34 | 5.10:1 | 3:1 | نجح |
| dark | حالة | `result/not-applicable/icon` #969FAE | `bg/surface` #202328 | 5.90:1 | 3:1 | نجح |
| dark | حالة | `result/not-applicable/border` #767E8A | `bg/surface` #202328 | 3.84:1 | 3:1 | نجح |
| dark | حالة | `cycle/queued/fg` #B9BEC6 | `cycle/queued/bg` #2B2E34 | 7.29:1 | 4.5:1 | نجح |
| dark | حالة | `cycle/queued/icon` #969FAE | `cycle/queued/bg` #2B2E34 | 5.10:1 | 3:1 | نجح |
| dark | حالة | `cycle/queued/icon` #969FAE | `bg/surface` #202328 | 5.90:1 | 3:1 | نجح |
| dark | حالة | `cycle/queued/border` #767E8A | `bg/surface` #202328 | 3.84:1 | 3:1 | نجح |
| dark | حالة | `cycle/running/fg` #BDD5FF | `cycle/running/bg` #1C283C | 9.96:1 | 4.5:1 | نجح |
| dark | حالة | `cycle/running/icon` #699DF9 | `cycle/running/bg` #1C283C | 5.49:1 | 3:1 | نجح |
| dark | حالة | `cycle/running/icon` #699DF9 | `bg/surface` #202328 | 5.85:1 | 3:1 | نجح |
| dark | حالة | `cycle/running/border` #699DF9 | `bg/surface` #202328 | 5.85:1 | 3:1 | نجح |
| dark | حالة | `cycle/cancelling/fg` #F3F1EC | `cycle/cancelling/bg` #3F444C | 8.68:1 | 4.5:1 | نجح |
| dark | حالة | `cycle/cancelling/icon` #B9BEC6 | `cycle/cancelling/bg` #3F444C | 5.25:1 | 3:1 | نجح |
| dark | حالة | `cycle/cancelling/icon` #B9BEC6 | `bg/surface` #202328 | 8.44:1 | 3:1 | نجح |
| dark | حالة | `cycle/cancelling/border` #767E8A | `bg/surface` #202328 | 3.84:1 | 3:1 | نجح |
| dark | حالة | `verdict/pure/fg` #A6E5C1 | `verdict/pure/bg` #162D21 | 10.20:1 | 4.5:1 | نجح |
| dark | حالة | `verdict/pure/icon` #3FB87F | `verdict/pure/bg` #162D21 | 5.85:1 | 3:1 | نجح |
| dark | حالة | `verdict/pure/icon` #3FB87F | `bg/surface` #202328 | 6.28:1 | 3:1 | نجح |
| dark | حالة | `verdict/pure/border` #3FB87F | `bg/surface` #202328 | 6.28:1 | 3:1 | نجح |
| dark | حالة | `verdict/incomplete/fg` #F3F1EC | `verdict/incomplete/bg` #202328 | 13.96:1 | 4.5:1 | نجح |
| dark | حالة | `verdict/incomplete/icon` #B9BEC6 | `verdict/incomplete/bg` #202328 | 8.44:1 | 3:1 | نجح |
| dark | حالة | `verdict/incomplete/icon` #B9BEC6 | `bg/surface` #202328 | 8.44:1 | 3:1 | نجح |
| dark | حالة | `verdict/incomplete/border` #767E8A | `bg/surface` #202328 | 3.84:1 | 3:1 | نجح |
| dark | حالة | `verdict/blocked/fg` #FFC2C5 | `verdict/blocked/bg` #3C1D1F | 9.93:1 | 4.5:1 | نجح |
| dark | حالة | `verdict/blocked/icon` #F66A79 | `verdict/blocked/bg` #3C1D1F | 5.23:1 | 3:1 | نجح |
| dark | حالة | `verdict/blocked/icon` #F66A79 | `bg/surface` #202328 | 5.45:1 | 3:1 | نجح |
| dark | حالة | `verdict/blocked/border` #F66A79 | `bg/surface` #202328 | 5.45:1 | 3:1 | نجح |
| dark | حالة | `tag/model-claim/fg` #D8CBFF | `tag/model-claim/bg` #292438 | 9.91:1 | 4.5:1 | نجح |
| dark | حالة | `tag/model-claim/icon` #A68CE6 | `tag/model-claim/bg` #292438 | 5.35:1 | 3:1 | نجح |
| dark | حالة | `tag/model-claim/icon` #A68CE6 | `bg/surface` #202328 | 5.64:1 | 3:1 | نجح |
| dark | حالة | `tag/model-claim/border` #A68CE6 | `bg/surface` #202328 | 5.64:1 | 3:1 | نجح |

### معلوماتي (غير ملزم، D-DES1-03)

| الوضع | الثنائية | النسبة |
|---|---|---|
| light | border/subtle ↔ bg/surface | 1.38:1 |
| light | selection ↔ bg/surface | 1.18:1 |
| dark | border/subtle ↔ bg/surface | 1.61:1 |
| dark | selection ↔ bg/surface | 1.16:1 |

## سلالم الدلالة (مشتركة بين البديلين)

| الدرجة | فاتح | داكن |
|---|---|---|
| green/100 | `#EDF6F0` | `#162D21` |
| green/200 | `#D9ECDF` | `#183B29` |
| green/300 | `#B7DBC4` | `#135537` |
| green/400 | `#7EBB95` | `#048454` |
| green/500 | `#388F60` | `#3FB87F` |
| green/600 | `#177648` | `#73D1A0` |
| green/700 | `#025D35` | `#A6E5C1` |
| red/100 | `#FFEFEF` | `#3C1D1F` |
| red/200 | `#FFDDDD` | `#4F2327` |
| red/300 | `#FFBDC0` | `#752C34` |
| red/400 | `#F8828C` | `#B73F4F` |
| red/500 | `#D53954` | `#F66A79` |
| red/600 | `#B6123C` | `#FF99A0` |
| red/700 | `#92002C` | `#FFC2C5` |
| blue/100 | `#EEF4FF` | `#1C283C` |
| blue/200 | `#DAE7FF` | `#22334F` |
| blue/300 | `#B9D2FF` | `#2C4777` |
| blue/400 | `#7DA9FF` | `#416CBB` |
| blue/500 | `#3170F9` | `#699DF9` |
| blue/600 | `#1754DB` | `#94BBFF` |
| blue/700 | `#083EB4` | `#BDD5FF` |
| amber/100 | `#FBF2E9` | `#342410` |
| amber/200 | `#F5E3D2` | `#442E10` |
| amber/300 | `#EBCAAB` | `#633F02` |
| amber/400 | `#D39F6A` | `#976200` |
| amber/500 | `#AD6A13` | `#D48E1F` |
| amber/600 | `#8D5400` | `#EAAD5E` |
| amber/700 | `#6F4100` | `#F7CC96` |
| purple/100 | `#F4F1FF` | `#292438` |
| purple/200 | `#E7E2FF` | `#352D49` |
| purple/300 | `#D2C8FF` | `#4C3E6D` |
| purple/400 | `#AF97FF` | `#765EAB` |
| purple/500 | `#855BE5` | `#A68CE6` |
| purple/600 | `#6D3FC8` | `#C1ACFA` |
| purple/700 | `#562BA3` | `#D8CBFF` |
