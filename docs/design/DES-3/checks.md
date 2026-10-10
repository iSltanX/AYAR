# DES-3 — تباين المكوّنات في الوضعين

ناتج `component-check.mjs` على `figma-pairs.json`. الثنائيات: 121 (×2 وضعين = 242). الملزمة: 198، نجح منها 198. والمستثناة المعروضة: 44.

أدنى نص ملزم: 4.86:1. وأدنى غير نص ملزم: 3.14:1.

| الوضع | النوع | الأمامي | الخلفية | النسبة | الحد | ملزم | النتيجة | السبب | أمثلة |
|---|---|---|---|---|---|---|---|---|---|
| light | text | `text/inverse` #F7F4EC | `text/primary` #141B20 | 15.82 | 4.5 | نعم | نجح | نص | Button، Title bar |
| dark | text | `text/inverse` #141B20 | `text/primary` #F7F4EC | 15.82 | 4.5 | نعم | نجح | نص | Button، Title bar |
| light | text | `text/inverse` #F7F4EC | `text/secondary` #434F54 | 7.69 | 4.5 | نعم | نجح | نص | Button، Copy for model button |
| dark | text | `text/inverse` #141B20 | `text/secondary` #BABFBD | 9.34 | 4.5 | نعم | نجح | نص | Button، Copy for model button |
| light | text | `text/inverse` #F7F4EC | `text/tertiary` #59676C | 5.33 | 4.5 | نعم | نجح | نص | Button، Copy for model button |
| dark | text | `text/inverse` #141B20 | `text/tertiary` #97A0A2 | 6.51 | 4.5 | نعم | نجح | نص | Button، Copy for model button |
| light | focus-ring | `focus/ring` #141B20 | `bg/canvas` #F7F4EC | 15.82 | 3 | نعم | نجح | حلقة تركيز | Button، Icon button |
| dark | focus-ring | `focus/ring` #F7F4EC | `bg/canvas` #141B20 | 15.82 | 3 | نعم | نجح | حلقة تركيز | Button، Icon button |
| light | focus-ring | `focus/ring` #141B20 | `bg/surface` #FFFCF4 | 16.96 | 3 | نعم | نجح | حلقة تركيز | Button، Icon button |
| dark | focus-ring | `focus/ring` #F7F4EC | `bg/surface` #1C2429 | 14.33 | 3 | نعم | نجح | حلقة تركيز | Button، Icon button |
| light | text-disabled | `text/tertiary` #59676C | `bg/sunken` #EBEAE3 | 4.86 | 4.5 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Button، Search field |
| dark | text-disabled | `text/tertiary` #97A0A2 | `bg/sunken` #0B1116 | 7.11 | 4.5 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Button، Search field |
| light | text | `text/primary` #141B20 | `bg/surface` #FFFCF4 | 16.96 | 4.5 | نعم | نجح | نص | Button، Search field |
| dark | text | `text/primary` #F7F4EC | `bg/surface` #1C2429 | 14.33 | 4.5 | نعم | نجح | نص | Button، Search field |
| light | text | `text/primary` #141B20 | `bg/sunken` #EBEAE3 | 14.42 | 4.5 | نعم | نجح | نص | Button، Select |
| dark | text | `text/primary` #F7F4EC | `bg/sunken` #0B1116 | 17.28 | 4.5 | نعم | نجح | نص | Button، Select |
| light | text | `text/primary` #141B20 | `border/subtle` #D9D9D4 | 12.28 | 4.5 | نعم | نجح | نص | Button، Select |
| dark | text | `text/primary` #F7F4EC | `border/subtle` #3B454B | 8.93 | 4.5 | نعم | نجح | نص | Button، Select |
| light | text | `text/primary` #141B20 | `bg/canvas` #F7F4EC | 15.82 | 4.5 | نعم | نجح | نص | Button، Switch |
| dark | text | `text/primary` #F7F4EC | `bg/canvas` #141B20 | 15.82 | 4.5 | نعم | نجح | نص | Button، Switch |
| light | text-disabled | `text/tertiary` #59676C | `bg/canvas` #F7F4EC | 5.33 | 4.5 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Button، Switch |
| dark | text-disabled | `text/tertiary` #97A0A2 | `bg/canvas` #141B20 | 6.51 | 4.5 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Button، Switch |
| light | text-disabled | `text/tertiary` #59676C | `bg/surface` #FFFCF4 | 5.72 | 4.5 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Button، Switch |
| dark | text-disabled | `text/tertiary` #97A0A2 | `bg/surface` #1C2429 | 5.9 | 4.5 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Button، Switch |
| light | icon | `text/primary` #141B20 | `bg/surface` #FFFCF4 | 16.96 | 3 | نعم | نجح | رمز | Button، Icon button |
| dark | icon | `text/primary` #F7F4EC | `bg/surface` #1C2429 | 14.33 | 3 | نعم | نجح | رمز | Button، Icon button |
| light | icon | `text/primary` #141B20 | `bg/sunken` #EBEAE3 | 14.42 | 3 | نعم | نجح | رمز | Button، Icon button |
| dark | icon | `text/primary` #F7F4EC | `bg/sunken` #0B1116 | 17.28 | 3 | نعم | نجح | رمز | Button، Icon button |
| light | icon | `text/primary` #141B20 | `border/subtle` #D9D9D4 | 12.28 | 3 | نعم | نجح | رمز | Button، Icon button |
| dark | icon | `text/primary` #F7F4EC | `border/subtle` #3B454B | 8.93 | 3 | نعم | نجح | رمز | Button، Icon button |
| light | icon-disabled | `text/tertiary` #59676C | `bg/sunken` #EBEAE3 | 4.86 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Button، Search field |
| dark | icon-disabled | `text/tertiary` #97A0A2 | `bg/sunken` #0B1116 | 7.11 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Button، Search field |
| light | icon | `text/primary` #141B20 | `bg/canvas` #F7F4EC | 15.82 | 3 | نعم | نجح | رمز | Icon button، Nav item |
| dark | icon | `text/primary` #F7F4EC | `bg/canvas` #141B20 | 15.82 | 3 | نعم | نجح | رمز | Icon button، Nav item |
| light | icon-disabled | `text/tertiary` #59676C | `bg/canvas` #F7F4EC | 5.33 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Icon button، Nav item |
| dark | icon-disabled | `text/tertiary` #97A0A2 | `bg/canvas` #141B20 | 6.51 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Icon button، Nav item |
| light | icon-disabled | `text/tertiary` #59676C | `bg/surface` #FFFCF4 | 5.72 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Icon button، Nav item |
| dark | icon-disabled | `text/tertiary` #97A0A2 | `bg/surface` #1C2429 | 5.9 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Icon button، Nav item |
| light | text | `text/tertiary` #59676C | `bg/surface` #FFFCF4 | 5.72 | 4.5 | نعم | نجح | نص | Search field، Text field |
| dark | text | `text/tertiary` #97A0A2 | `bg/surface` #1C2429 | 5.9 | 4.5 | نعم | نجح | نص | Search field، Text field |
| light | icon | `text/secondary` #434F54 | `bg/surface` #FFFCF4 | 8.24 | 3 | نعم | نجح | رمز | Search field، Select |
| dark | icon | `text/secondary` #BABFBD | `bg/surface` #1C2429 | 8.45 | 3 | نعم | نجح | رمز | Search field، Select |
| light | text | `text/tertiary` #59676C | `bg/sunken` #EBEAE3 | 4.86 | 4.5 | نعم | نجح | نص | Search field، Text field |
| dark | text | `text/tertiary` #97A0A2 | `bg/sunken` #0B1116 | 7.11 | 4.5 | نعم | نجح | نص | Search field، Text field |
| light | icon | `text/secondary` #434F54 | `bg/sunken` #EBEAE3 | 7.01 | 3 | نعم | نجح | رمز | Search field، Select |
| dark | icon | `text/secondary` #BABFBD | `bg/sunken` #0B1116 | 10.19 | 3 | نعم | نجح | رمز | Search field، Select |
| light | icon | `text/secondary` #434F54 | `border/subtle` #D9D9D4 | 5.97 | 3 | نعم | نجح | رمز | Select، Project switcher |
| dark | icon | `text/secondary` #BABFBD | `border/subtle` #3B454B | 5.27 | 3 | نعم | نجح | رمز | Select، Project switcher |
| light | border | `border/strong` #7B8588 | `bg/canvas` #F7F4EC | 3.44 | 3 | نعم | نجح | حد | Switch، Checkbox |
| dark | border | `border/strong` #728085 | `bg/canvas` #141B20 | 4.26 | 3 | نعم | نجح | حد | Switch، Checkbox |
| light | border | `border/strong` #7B8588 | `bg/surface` #FFFCF4 | 3.69 | 3 | نعم | نجح | حد | Switch، Checkbox |
| dark | border | `border/strong` #728085 | `bg/surface` #1C2429 | 3.86 | 3 | نعم | نجح | حد | Switch، Checkbox |
| light | fill-boundary | `bg/sunken` #EBEAE3 | `bg/canvas` #F7F4EC | 1.1 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Switch، Checkbox |
| dark | fill-boundary | `bg/sunken` #0B1116 | `bg/canvas` #141B20 | 1.09 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Switch، Checkbox |
| light | fill-boundary | `bg/sunken` #EBEAE3 | `bg/surface` #FFFCF4 | 1.18 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Switch، Checkbox |
| dark | fill-boundary | `bg/sunken` #0B1116 | `bg/surface` #1C2429 | 1.21 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Switch، Checkbox |
| light | icon | `border/strong` #7B8588 | `bg/sunken` #EBEAE3 | 3.14 | 3 | نعم | نجح | رمز | Switch |
| dark | icon | `border/strong` #728085 | `bg/sunken` #0B1116 | 4.65 | 3 | نعم | نجح | رمز | Switch |
| light | border | `text/secondary` #434F54 | `bg/canvas` #F7F4EC | 7.69 | 3 | نعم | نجح | حد | Switch |
| dark | border | `text/secondary` #BABFBD | `bg/canvas` #141B20 | 9.34 | 3 | نعم | نجح | حد | Switch |
| light | border | `text/secondary` #434F54 | `bg/surface` #FFFCF4 | 8.24 | 3 | نعم | نجح | حد | Switch |
| dark | border | `text/secondary` #BABFBD | `bg/surface` #1C2429 | 8.45 | 3 | نعم | نجح | حد | Switch |
| light | fill-boundary-disabled | `bg/sunken` #EBEAE3 | `bg/canvas` #F7F4EC | 1.1 | 3 | لا | دون الحد (مستثنى) | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch، Checkbox |
| dark | fill-boundary-disabled | `bg/sunken` #0B1116 | `bg/canvas` #141B20 | 1.09 | 3 | لا | دون الحد (مستثنى) | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch، Checkbox |
| light | fill-boundary-disabled | `bg/sunken` #EBEAE3 | `bg/surface` #FFFCF4 | 1.18 | 3 | لا | دون الحد (مستثنى) | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch، Checkbox |
| dark | fill-boundary-disabled | `bg/sunken` #0B1116 | `bg/surface` #1C2429 | 1.21 | 3 | لا | دون الحد (مستثنى) | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch، Checkbox |
| light | icon-disabled | `border/subtle` #D9D9D4 | `bg/sunken` #EBEAE3 | 1.17 | 3 | لا | دون الحد (مستثنى) | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch |
| dark | icon-disabled | `border/subtle` #3B454B | `bg/sunken` #0B1116 | 1.93 | 3 | لا | دون الحد (مستثنى) | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch |
| light | fill-boundary | `text/primary` #141B20 | `bg/canvas` #F7F4EC | 15.82 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Switch، Checkbox |
| dark | fill-boundary | `text/primary` #F7F4EC | `bg/canvas` #141B20 | 15.82 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Switch، Checkbox |
| light | fill-boundary | `text/primary` #141B20 | `bg/surface` #FFFCF4 | 16.96 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Switch، Checkbox |
| dark | fill-boundary | `text/primary` #F7F4EC | `bg/surface` #1C2429 | 14.33 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Switch، Checkbox |
| light | icon | `bg/surface` #FFFCF4 | `text/primary` #141B20 | 16.96 | 3 | نعم | نجح | رمز | Switch |
| dark | icon | `bg/surface` #1C2429 | `text/primary` #F7F4EC | 14.33 | 3 | نعم | نجح | رمز | Switch |
| light | fill-boundary | `text/secondary` #434F54 | `bg/canvas` #F7F4EC | 7.69 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Switch، Checkbox |
| dark | fill-boundary | `text/secondary` #BABFBD | `bg/canvas` #141B20 | 9.34 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Switch، Checkbox |
| light | fill-boundary | `text/secondary` #434F54 | `bg/surface` #FFFCF4 | 8.24 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Switch، Checkbox |
| dark | fill-boundary | `text/secondary` #BABFBD | `bg/surface` #1C2429 | 8.45 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Switch، Checkbox |
| light | icon | `bg/surface` #FFFCF4 | `text/secondary` #434F54 | 8.24 | 3 | نعم | نجح | رمز | Switch |
| dark | icon | `bg/surface` #1C2429 | `text/secondary` #BABFBD | 8.45 | 3 | نعم | نجح | رمز | Switch |
| light | fill-boundary-disabled | `border/strong` #7B8588 | `bg/canvas` #F7F4EC | 3.44 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch، Checkbox |
| dark | fill-boundary-disabled | `border/strong` #728085 | `bg/canvas` #141B20 | 4.26 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch، Checkbox |
| light | fill-boundary-disabled | `border/strong` #7B8588 | `bg/surface` #FFFCF4 | 3.69 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch، Checkbox |
| dark | fill-boundary-disabled | `border/strong` #728085 | `bg/surface` #1C2429 | 3.86 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch، Checkbox |
| light | icon-disabled | `bg/sunken` #EBEAE3 | `border/strong` #7B8588 | 3.14 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch |
| dark | icon-disabled | `bg/sunken` #0B1116 | `border/strong` #728085 | 4.65 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Switch |
| light | fill-boundary | `bg/surface` #FFFCF4 | `bg/canvas` #F7F4EC | 1.07 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Checkbox، Check row |
| dark | fill-boundary | `bg/surface` #1C2429 | `bg/canvas` #141B20 | 1.1 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Checkbox، Check row |
| light | fill-boundary | `bg/surface` #FFFCF4 | `bg/surface` #FFFCF4 | 1 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Checkbox، Check row |
| dark | fill-boundary | `bg/surface` #1C2429 | `bg/surface` #1C2429 | 1 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Checkbox، Check row |
| light | fill-boundary | `border/subtle` #D9D9D4 | `bg/canvas` #F7F4EC | 1.29 | 3 | لا | دون الحد (مستثنى) | زخرفي (D-DES1-03، D-DES2-13) | Checkbox، Progress |
| dark | fill-boundary | `border/subtle` #3B454B | `bg/canvas` #141B20 | 1.77 | 3 | لا | دون الحد (مستثنى) | زخرفي (D-DES1-03، D-DES2-13) | Checkbox، Progress |
| light | fill-boundary | `border/subtle` #D9D9D4 | `bg/surface` #FFFCF4 | 1.38 | 3 | لا | دون الحد (مستثنى) | زخرفي (D-DES1-03، D-DES2-13) | Checkbox، Progress |
| dark | fill-boundary | `border/subtle` #3B454B | `bg/surface` #1C2429 | 1.6 | 3 | لا | دون الحد (مستثنى) | زخرفي (D-DES1-03، D-DES2-13) | Checkbox، Progress |
| light | icon | `text/inverse` #F7F4EC | `text/primary` #141B20 | 15.82 | 3 | نعم | نجح | رمز | Checkbox، Check row |
| dark | icon | `text/inverse` #141B20 | `text/primary` #F7F4EC | 15.82 | 3 | نعم | نجح | رمز | Checkbox، Check row |
| light | icon | `text/inverse` #F7F4EC | `text/secondary` #434F54 | 7.69 | 3 | نعم | نجح | رمز | Checkbox، Copy for model button |
| dark | icon | `text/inverse` #141B20 | `text/secondary` #BABFBD | 9.34 | 3 | نعم | نجح | رمز | Checkbox، Copy for model button |
| light | fill-boundary | `text/tertiary` #59676C | `bg/canvas` #F7F4EC | 5.33 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Checkbox |
| dark | fill-boundary | `text/tertiary` #97A0A2 | `bg/canvas` #141B20 | 6.51 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Checkbox |
| light | fill-boundary | `text/tertiary` #59676C | `bg/surface` #FFFCF4 | 5.72 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Checkbox |
| dark | fill-boundary | `text/tertiary` #97A0A2 | `bg/surface` #1C2429 | 5.9 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Checkbox |
| light | icon | `text/inverse` #F7F4EC | `text/tertiary` #59676C | 5.33 | 3 | نعم | نجح | رمز | Checkbox، Copy for model button |
| dark | icon | `text/inverse` #141B20 | `text/tertiary` #97A0A2 | 6.51 | 3 | نعم | نجح | رمز | Checkbox، Copy for model button |
| light | icon-disabled | `text/inverse` #F7F4EC | `border/strong` #7B8588 | 3.44 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Checkbox، Radio |
| dark | icon-disabled | `text/inverse` #141B20 | `border/strong` #728085 | 4.26 | 3 | لا | نجح | معطل (مستثنى، WCAG 1.4.3/1.4.11) | Checkbox، Radio |
| light | text | `text/secondary` #434F54 | `bg/canvas` #F7F4EC | 7.69 | 4.5 | نعم | نجح | نص | Segment، Tab |
| dark | text | `text/secondary` #BABFBD | `bg/canvas` #141B20 | 9.34 | 4.5 | نعم | نجح | نص | Segment، Tab |
| light | text | `text/secondary` #434F54 | `bg/surface` #FFFCF4 | 8.24 | 4.5 | نعم | نجح | نص | Segment، Tab |
| dark | text | `text/secondary` #BABFBD | `bg/surface` #1C2429 | 8.45 | 4.5 | نعم | نجح | نص | Segment، Tab |
| light | text | `text/secondary` #434F54 | `bg/sunken` #EBEAE3 | 7.01 | 4.5 | نعم | نجح | نص | Segmented control، Project switcher |
| dark | text | `text/secondary` #BABFBD | `bg/sunken` #0B1116 | 10.19 | 4.5 | نعم | نجح | نص | Segmented control، Project switcher |
| light | border | `border/strong` #7B8588 | `bg/sunken` #EBEAE3 | 3.14 | 3 | نعم | نجح | حد | Segmented control، Check row |
| dark | border | `border/strong` #728085 | `bg/sunken` #0B1116 | 4.65 | 3 | نعم | نجح | حد | Segmented control، Check row |
| light | icon | `text/tertiary` #59676C | `bg/surface` #FFFCF4 | 5.72 | 3 | نعم | نجح | رمز | Argument editor |
| dark | icon | `text/tertiary` #97A0A2 | `bg/surface` #1C2429 | 5.9 | 3 | نعم | نجح | رمز | Argument editor |
| light | text | `result/failed/fg` #92002C | `result/failed/bg` #FFEFEF | 8.34 | 4.5 | نعم | نجح | نص | Nav badge، Sidebar |
| dark | text | `result/failed/fg` #FFC2C5 | `result/failed/bg` #3C1D1F | 9.93 | 4.5 | نعم | نجح | نص | Nav badge، Sidebar |
| light | icon | `result/missing/icon` #59676C | `bg/canvas` #F7F4EC | 5.33 | 3 | نعم | نجح | رمز | Nav badge، Sidebar |
| dark | icon | `result/missing/icon` #BABFBD | `bg/canvas` #141B20 | 9.34 | 3 | نعم | نجح | رمز | Nav badge، Sidebar |
| light | icon | `result/missing/icon` #59676C | `bg/surface` #FFFCF4 | 5.72 | 3 | نعم | نجح | رمز | Nav badge، Section card |
| dark | icon | `result/missing/icon` #BABFBD | `bg/surface` #1C2429 | 8.45 | 3 | نعم | نجح | رمز | Nav badge، Section card |
| light | text | `text/primary` #141B20 | `selection` #EBEAE3 | 14.42 | 4.5 | نعم | نجح | نص | Nav item، Sidebar |
| dark | text | `text/primary` #F7F4EC | `selection` #272F34 | 12.39 | 4.5 | نعم | نجح | نص | Nav item، Sidebar |
| light | icon | `text/primary` #141B20 | `selection` #EBEAE3 | 14.42 | 3 | نعم | نجح | رمز | Nav item، Sidebar |
| dark | icon | `text/primary` #F7F4EC | `selection` #272F34 | 12.39 | 3 | نعم | نجح | رمز | Nav item، Sidebar |
| light | indicator | `border/strong` #7B8588 | `selection` #EBEAE3 | 3.14 | 3 | نعم | نجح | مؤشر تحديد | Nav item، Sidebar |
| dark | indicator | `border/strong` #728085 | `selection` #272F34 | 3.33 | 3 | نعم | نجح | مؤشر تحديد | Nav item، Sidebar |
| light | text | `text/tertiary` #59676C | `bg/canvas` #F7F4EC | 5.33 | 4.5 | نعم | نجح | نص | Nav group header، Sidebar |
| dark | text | `text/tertiary` #97A0A2 | `bg/canvas` #141B20 | 6.51 | 4.5 | نعم | نجح | نص | Nav group header، Sidebar |
| light | icon | `text/secondary` #434F54 | `bg/canvas` #F7F4EC | 7.69 | 3 | نعم | نجح | رمز | Project switcher، Sidebar |
| dark | icon | `text/secondary` #BABFBD | `bg/canvas` #141B20 | 9.34 | 3 | نعم | نجح | رمز | Project switcher، Sidebar |
| light | border | `result/failed/border` #D53954 | `bg/canvas` #F7F4EC | 4.21 | 3 | نعم | نجح | حد | Sidebar، Window frame |
| dark | border | `result/failed/border` #F66A79 | `bg/canvas` #141B20 | 6.01 | 3 | نعم | نجح | حد | Sidebar، Window frame |
| light | icon | `result/warning/icon` #AD6A13 | `bg/surface` #FFFCF4 | 4.23 | 3 | نعم | نجح | رمز | Run bar، Section card |
| dark | icon | `result/warning/icon` #D48E1F | `bg/surface` #1C2429 | 5.76 | 3 | نعم | نجح | رمز | Run bar، Section card |
| light | icon | `result/failed/icon` #D53954 | `bg/surface` #FFFCF4 | 4.51 | 3 | نعم | نجح | رمز | Run bar، Section card |
| dark | icon | `result/failed/icon` #F66A79 | `bg/surface` #1C2429 | 5.44 | 3 | نعم | نجح | رمز | Run bar، Section card |
| light | icon | `result/passed/icon` #388F60 | `bg/surface` #FFFCF4 | 3.89 | 3 | نعم | نجح | رمز | Run bar، Section card |
| dark | icon | `result/passed/icon` #3FB87F | `bg/surface` #1C2429 | 6.28 | 3 | نعم | نجح | رمز | Run bar، Section card |
| light | text | `cycle/running/fg` #083EB4 | `bg/surface` #FFFCF4 | 8.68 | 4.5 | نعم | نجح | نص | Run bar، Check row |
| dark | text | `cycle/running/fg` #BDD5FF | `bg/surface` #1C2429 | 10.59 | 4.5 | نعم | نجح | نص | Run bar، Check row |
| light | icon | `cycle/running/icon` #3170F9 | `bg/surface` #FFFCF4 | 4.25 | 3 | نعم | نجح | رمز | Run bar، Check row |
| dark | icon | `cycle/running/icon` #699DF9 | `bg/surface` #1C2429 | 5.84 | 3 | نعم | نجح | رمز | Run bar، Check row |
| light | text | `cycle/cancelling/fg` #21292E | `bg/surface` #FFFCF4 | 14.41 | 4.5 | نعم | نجح | نص | Run bar |
| dark | text | `cycle/cancelling/fg` #F7F4EC | `bg/surface` #1C2429 | 14.33 | 4.5 | نعم | نجح | نص | Run bar |
| light | icon | `cycle/cancelling/icon` #434F54 | `bg/surface` #FFFCF4 | 8.24 | 3 | نعم | نجح | رمز | Run bar |
| dark | icon | `cycle/cancelling/icon` #BABFBD | `bg/surface` #1C2429 | 8.45 | 3 | نعم | نجح | رمز | Run bar |
| light | icon | `text/tertiary` #59676C | `bg/canvas` #F7F4EC | 5.33 | 3 | نعم | نجح | رمز | Title bar، Window frame |
| dark | icon | `text/tertiary` #97A0A2 | `bg/canvas` #141B20 | 6.51 | 3 | نعم | نجح | رمز | Title bar، Window frame |
| light | text | `cycle/queued/fg` #313B40 | `bg/canvas` #F7F4EC | 10.44 | 4.5 | نعم | نجح | نص | Check row |
| dark | text | `cycle/queued/fg` #BABFBD | `bg/canvas` #141B20 | 9.34 | 4.5 | نعم | نجح | نص | Check row |
| light | text | `cycle/queued/fg` #313B40 | `bg/surface` #FFFCF4 | 11.19 | 4.5 | نعم | نجح | نص | Check row |
| dark | text | `cycle/queued/fg` #BABFBD | `bg/surface` #1C2429 | 8.45 | 4.5 | نعم | نجح | نص | Check row |
| light | icon | `cycle/queued/icon` #59676C | `bg/canvas` #F7F4EC | 5.33 | 3 | نعم | نجح | رمز | Check row |
| dark | icon | `cycle/queued/icon` #97A0A2 | `bg/canvas` #141B20 | 6.51 | 3 | نعم | نجح | رمز | Check row |
| light | icon | `cycle/queued/icon` #59676C | `bg/surface` #FFFCF4 | 5.72 | 3 | نعم | نجح | رمز | Check row |
| dark | icon | `cycle/queued/icon` #97A0A2 | `bg/surface` #1C2429 | 5.9 | 3 | نعم | نجح | رمز | Check row |
| light | text | `cycle/queued/fg` #313B40 | `bg/sunken` #EBEAE3 | 9.51 | 4.5 | نعم | نجح | نص | Check row |
| dark | text | `cycle/queued/fg` #BABFBD | `bg/sunken` #0B1116 | 10.19 | 4.5 | نعم | نجح | نص | Check row |
| light | icon | `cycle/queued/icon` #59676C | `bg/sunken` #EBEAE3 | 4.86 | 3 | نعم | نجح | رمز | Check row |
| dark | icon | `cycle/queued/icon` #97A0A2 | `bg/sunken` #0B1116 | 7.11 | 3 | نعم | نجح | رمز | Check row |
| light | fill-boundary | `bg/surface` #FFFCF4 | `bg/sunken` #EBEAE3 | 1.18 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Check row، Finding row |
| dark | fill-boundary | `bg/surface` #1C2429 | `bg/sunken` #0B1116 | 1.21 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Check row، Finding row |
| light | text | `text/tertiary` #59676C | `selection` #EBEAE3 | 4.86 | 4.5 | نعم | نجح | نص | Check row، Finding row |
| dark | text | `text/tertiary` #97A0A2 | `selection` #272F34 | 5.1 | 4.5 | نعم | نجح | نص | Check row، Finding row |
| light | text | `cycle/queued/fg` #313B40 | `selection` #EBEAE3 | 9.51 | 4.5 | نعم | نجح | نص | Check row |
| dark | text | `cycle/queued/fg` #BABFBD | `selection` #272F34 | 7.31 | 4.5 | نعم | نجح | نص | Check row |
| light | icon | `cycle/queued/icon` #59676C | `selection` #EBEAE3 | 4.86 | 3 | نعم | نجح | رمز | Check row |
| dark | icon | `cycle/queued/icon` #97A0A2 | `selection` #272F34 | 5.1 | 3 | نعم | نجح | رمز | Check row |
| light | fill-boundary | `text/primary` #141B20 | `selection` #EBEAE3 | 14.42 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Check row، Finding row |
| dark | fill-boundary | `text/primary` #F7F4EC | `selection` #272F34 | 12.39 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Check row، Finding row |
| light | icon | `border/subtle` #D9D9D4 | `bg/surface` #FFFCF4 | 1.38 | 3 | لا | دون الحد (مستثنى) | زخرفي (D-DES1-03، D-DES2-13) | Check row |
| dark | icon | `border/subtle` #3B454B | `bg/surface` #1C2429 | 1.6 | 3 | لا | دون الحد (مستثنى) | زخرفي (D-DES1-03، D-DES2-13) | Check row |
| light | text | `cycle/running/fg` #083EB4 | `bg/canvas` #F7F4EC | 8.1 | 4.5 | نعم | نجح | نص | Check row |
| dark | text | `cycle/running/fg` #BDD5FF | `bg/canvas` #141B20 | 11.7 | 4.5 | نعم | نجح | نص | Check row |
| light | icon | `cycle/running/icon` #3170F9 | `bg/canvas` #F7F4EC | 3.97 | 3 | نعم | نجح | رمز | Check row |
| dark | icon | `cycle/running/icon` #699DF9 | `bg/canvas` #141B20 | 6.45 | 3 | نعم | نجح | رمز | Check row |
| light | text | `cycle/running/fg` #083EB4 | `bg/sunken` #EBEAE3 | 7.38 | 4.5 | نعم | نجح | نص | Check row |
| dark | text | `cycle/running/fg` #BDD5FF | `bg/sunken` #0B1116 | 12.77 | 4.5 | نعم | نجح | نص | Check row |
| light | icon | `cycle/running/icon` #3170F9 | `bg/sunken` #EBEAE3 | 3.62 | 3 | نعم | نجح | رمز | Check row، Sheet/Setup panel |
| dark | icon | `cycle/running/icon` #699DF9 | `bg/sunken` #0B1116 | 7.04 | 3 | نعم | نجح | رمز | Check row، Sheet/Setup panel |
| light | text | `text/secondary` #434F54 | `selection` #EBEAE3 | 7.01 | 4.5 | نعم | نجح | نص | Check row، Finding row |
| dark | text | `text/secondary` #BABFBD | `selection` #272F34 | 7.31 | 4.5 | نعم | نجح | نص | Check row، Finding row |
| light | icon | `text/secondary` #434F54 | `selection` #EBEAE3 | 7.01 | 3 | نعم | نجح | رمز | Check row |
| dark | icon | `text/secondary` #BABFBD | `selection` #272F34 | 7.31 | 3 | نعم | نجح | رمز | Check row |
| light | text | `cycle/running/fg` #083EB4 | `selection` #EBEAE3 | 7.38 | 4.5 | نعم | نجح | نص | Check row |
| dark | text | `cycle/running/fg` #BDD5FF | `selection` #272F34 | 9.16 | 4.5 | نعم | نجح | نص | Check row |
| light | icon | `cycle/running/icon` #3170F9 | `selection` #EBEAE3 | 3.62 | 3 | نعم | نجح | رمز | Check row |
| dark | icon | `cycle/running/icon` #699DF9 | `selection` #272F34 | 5.05 | 3 | نعم | نجح | رمز | Check row |
| light | icon | `result/failed/icon` #D53954 | `result/failed/bg` #FFEFEF | 4.15 | 3 | نعم | نجح | رمز | Check row، Inspector |
| dark | icon | `result/failed/icon` #F66A79 | `result/failed/bg` #3C1D1F | 5.23 | 3 | نعم | نجح | رمز | Check row، Inspector |
| light | icon | `border/strong` #7B8588 | `bg/surface` #FFFCF4 | 3.69 | 3 | نعم | نجح | رمز | Section card |
| dark | icon | `border/strong` #728085 | `bg/surface` #1C2429 | 3.86 | 3 | نعم | نجح | رمز | Section card |
| light | icon | `result/needs-review/icon` #855BE5 | `bg/surface` #FFFCF4 | 4.43 | 3 | نعم | نجح | رمز | Section card |
| dark | icon | `result/needs-review/icon` #A68CE6 | `bg/surface` #1C2429 | 5.63 | 3 | نعم | نجح | رمز | Section card |
| light | focus-ring | `focus/ring` #141B20 | `bg/sunken` #EBEAE3 | 14.42 | 3 | نعم | نجح | حلقة تركيز | Command block |
| dark | focus-ring | `focus/ring` #F7F4EC | `bg/sunken` #0B1116 | 17.28 | 3 | نعم | نجح | حلقة تركيز | Command block |
| light | text | `result/needs-review/fg` #562BA3 | `result/needs-review/bg` #F4F1FF | 8.31 | 4.5 | نعم | نجح | نص | Image diff viewer، Inspector |
| dark | text | `result/needs-review/fg` #D8CBFF | `result/needs-review/bg` #292438 | 9.91 | 4.5 | نعم | نجح | نص | Image diff viewer، Inspector |
| light | icon | `result/needs-review/icon` #855BE5 | `result/needs-review/bg` #F4F1FF | 4.08 | 3 | نعم | نجح | رمز | Image diff viewer، Inspector |
| dark | icon | `result/needs-review/icon` #A68CE6 | `result/needs-review/bg` #292438 | 5.35 | 3 | نعم | نجح | رمز | Image diff viewer، Inspector |
| light | border | `text/primary` #141B20 | `bg/surface` #FFFCF4 | 16.96 | 3 | نعم | نجح | حد | Image diff viewer |
| dark | border | `text/primary` #F7F4EC | `bg/surface` #1C2429 | 14.33 | 3 | نعم | نجح | حد | Image diff viewer |
| light | text | `result/passed/fg` #025D35 | `result/passed/bg` #EDF6F0 | 7.27 | 4.5 | نعم | نجح | نص | Capture tile، Inspector |
| dark | text | `result/passed/fg` #A6E5C1 | `result/passed/bg` #162D21 | 10.2 | 4.5 | نعم | نجح | نص | Capture tile، Inspector |
| light | icon | `result/passed/icon` #388F60 | `result/passed/bg` #EDF6F0 | 3.62 | 3 | نعم | نجح | رمز | Capture tile، Inspector |
| dark | icon | `result/passed/icon` #3FB87F | `result/passed/bg` #162D21 | 5.85 | 3 | نعم | نجح | رمز | Capture tile، Inspector |
| light | text | `result/skipped/fg` #313B40 | `result/skipped/bg` #EBEAE3 | 9.51 | 4.5 | نعم | نجح | نص | Capture tile |
| dark | text | `result/skipped/fg` #DADBD6 | `result/skipped/bg` #272F34 | 9.78 | 4.5 | نعم | نجح | نص | Capture tile |
| light | icon | `result/skipped/icon` #59676C | `result/skipped/bg` #EBEAE3 | 4.86 | 3 | نعم | نجح | رمز | Capture tile |
| dark | icon | `result/skipped/icon` #97A0A2 | `result/skipped/bg` #272F34 | 5.1 | 3 | نعم | نجح | رمز | Capture tile |
| light | icon | `text/tertiary` #59676C | `bg/sunken` #EBEAE3 | 4.86 | 3 | نعم | نجح | رمز | Table header cell |
| dark | icon | `text/tertiary` #97A0A2 | `bg/sunken` #0B1116 | 7.11 | 3 | نعم | نجح | رمز | Table header cell |
| light | text | `text/primary` #141B20 | `bg/elevated` #FFFCF4 | 16.96 | 4.5 | نعم | نجح | نص | Selection bar، Context menu |
| dark | text | `text/primary` #F7F4EC | `bg/elevated` #272F34 | 12.39 | 4.5 | نعم | نجح | نص | Selection bar، Context menu |
| light | border | `border/strong` #7B8588 | `bg/elevated` #FFFCF4 | 3.69 | 3 | نعم | نجح | حد | Selection bar، Sheet/Setup preview |
| dark | border | `border/strong` #728085 | `bg/elevated` #272F34 | 3.33 | 3 | نعم | نجح | حد | Selection bar، Sheet/Setup preview |
| light | text | `text/secondary` #434F54 | `bg/elevated` #FFFCF4 | 8.24 | 4.5 | نعم | نجح | نص | Selection bar، Term tooltip |
| dark | text | `text/secondary` #BABFBD | `bg/elevated` #272F34 | 7.31 | 4.5 | نعم | نجح | نص | Selection bar، Term tooltip |
| light | text | `text/tertiary` #59676C | `bg/elevated` #FFFCF4 | 5.72 | 4.5 | نعم | نجح | نص | Run menu، Sheet/Approval diff |
| dark | text | `text/tertiary` #97A0A2 | `bg/elevated` #272F34 | 5.1 | 4.5 | نعم | نجح | نص | Run menu، Sheet/Approval diff |
| light | icon | `text/secondary` #434F54 | `bg/elevated` #FFFCF4 | 8.24 | 3 | نعم | نجح | رمز | Sheet/Setup preview، Sheet/Export report |
| dark | icon | `text/secondary` #BABFBD | `bg/elevated` #272F34 | 7.31 | 3 | نعم | نجح | رمز | Sheet/Setup preview، Sheet/Export report |
| light | fill-boundary | `bg/surface` #FFFCF4 | `bg/elevated` #FFFCF4 | 1 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Sheet/Setup preview، Sheet/Re-run |
| dark | fill-boundary | `bg/surface` #1C2429 | `bg/elevated` #272F34 | 1.16 | 3 | لا | دون الحد (مستثنى) | تعبئة تحكم بإطار border/strong (الإطار يحمل الحد) | Sheet/Setup preview، Sheet/Re-run |
| light | fill-boundary | `text/primary` #141B20 | `bg/elevated` #FFFCF4 | 16.96 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Sheet/Approval diff، Sheet/Export report |
| dark | fill-boundary | `text/primary` #F7F4EC | `bg/elevated` #272F34 | 12.39 | 3 | نعم | نجح | تعبئة تحكم بلا إطار | Sheet/Approval diff، Sheet/Export report |
| light | text | `text/secondary` #434F54 | `border/subtle` #D9D9D4 | 5.97 | 4.5 | نعم | نجح | نص | Sheet/Approval diff |
| dark | text | `text/secondary` #BABFBD | `border/subtle` #3B454B | 5.27 | 4.5 | نعم | نجح | نص | Sheet/Approval diff |
| light | icon | `text/primary` #141B20 | `bg/elevated` #FFFCF4 | 16.96 | 3 | نعم | نجح | رمز | Sheet/Permission explanation، Toast |
| dark | icon | `text/primary` #F7F4EC | `bg/elevated` #272F34 | 12.39 | 3 | نعم | نجح | رمز | Sheet/Permission explanation، Toast |
| light | icon | `result/failed/icon` #D53954 | `bg/elevated` #FFFCF4 | 4.51 | 3 | نعم | نجح | رمز | Sheet/Scoring details |
| dark | icon | `result/failed/icon` #F66A79 | `bg/elevated` #272F34 | 4.7 | 3 | نعم | نجح | رمز | Sheet/Scoring details |
| light | icon | `result/passed/icon` #388F60 | `bg/elevated` #FFFCF4 | 3.89 | 3 | نعم | نجح | رمز | Sheet/Scoring details |
| dark | icon | `result/passed/icon` #3FB87F | `bg/elevated` #272F34 | 5.43 | 3 | نعم | نجح | رمز | Sheet/Scoring details |
| light | icon | `result/needs-review/icon` #855BE5 | `bg/elevated` #FFFCF4 | 4.43 | 3 | نعم | نجح | رمز | Sheet/Scoring details |
| dark | icon | `result/needs-review/icon` #A68CE6 | `bg/elevated` #272F34 | 4.87 | 3 | نعم | نجح | رمز | Sheet/Scoring details |
| light | text | `tag/model-claim/fg` #562BA3 | `tag/model-claim/bg` #F4F1FF | 8.31 | 4.5 | نعم | نجح | نص | Sheet/Human review، Model claim row |
| dark | text | `tag/model-claim/fg` #D8CBFF | `tag/model-claim/bg` #292438 | 9.91 | 4.5 | نعم | نجح | نص | Sheet/Human review، Model claim row |
| light | icon | `tag/model-claim/icon` #855BE5 | `tag/model-claim/bg` #F4F1FF | 4.08 | 3 | نعم | نجح | رمز | Sheet/Human review، Model claim row |
| dark | icon | `tag/model-claim/icon` #A68CE6 | `tag/model-claim/bg` #292438 | 5.35 | 3 | نعم | نجح | رمز | Sheet/Human review، Model claim row |
