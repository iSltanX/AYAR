// DES-2 — فاحص التباين ومحاكاة عمى الألوان لنظام الحالات.
// يقرأ قيم DES-1 المعتمدة (../DES-1/tokens.json، البديل A) ويحسب الثنائيات التي أضافتها DES-2:
// رموز الحالات منفردة على الأسطح، ونصوص الدورة بلا حاوية، والوسوم وخطوطها، والشدة والدائرة،
// وبطاقة «قديم» الباهتة. ثم يحاكي عمى الألوان (Machado 2009، شدة 1.0) ليُظهر أي النتائج
// تتقارب ألوانها فتحتاج الرمز وحده للتمييز. يكتب checks.md وchecks.json ويخرج برمز 1 إن فشلت ثنائية ملزمة.
// التشغيل: /opt/homebrew/bin/node docs/design/DES-2/status-check.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOK = JSON.parse(readFileSync(join(HERE, '../DES-1/tokens.json'), 'utf8')).alternatives.A;
const MODES = ['light', 'dark'];

// ---------- رياضيات اللون ----------
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const rgb2hex = c => '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const toLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const lum = hex => { const [r, g, b] = hex2rgb(hex).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
// CIEDE2000
function hex2lab(hex) {
  const [r, g, b] = hex2rgb(hex).map(toLin);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b, Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function de2000(h1, h2) {
  const [L1, a1, b1] = hex2lab(h1), [L2, a2, b2] = hex2lab(h2);
  const rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G), Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, a) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2), dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = hp2 - hp1; if (Cp1 * Cp2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad), Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2; if (Cp1 * Cp2 !== 0) hb = Math.abs(hp1 - hp2) > 180 ? (hb + 360) / 2 : hb / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), RC = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T, RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
// محاكاة عمى الألوان: مصفوفات Machado وOliveira وFernandes (2009) بشدة 1.0 في RGB الخطي
const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const simulate = (hex, m) => { const l = hex2rgb(hex).map(toLin); return rgb2hex(m.map(r => fromLin(Math.min(1, Math.max(0, r[0] * l[0] + r[1] * l[1] + r[2] * l[2]))))); };

// ---------- الثنائيات ----------
const RESULTS = ['passed', 'failed', 'warning', 'needs-review', 'flaky', 'missing', 'unavailable', 'timed-out', 'cancelled', 'interrupted', 'skipped', 'not-applicable'];
const CYCLES = ['queued', 'running', 'cancelling'];
const VERDICTS = ['pure', 'incomplete', 'blocked'];
const SURF = ['bg/canvas', 'bg/surface', 'bg/elevated', 'bg/sunken', 'selection'];
const rows = [];
for (const m of MODES) {
  const s = TOK.semantic[m], st = TOK.status[m];
  const v = n => s[n] ?? st[n];
  const add = (group, fgName, bgName, fg, bg, min, note = '') => { const r = contrast(fg, bg); rows.push({ mode: m, group, fgName, bgName, fg, bg, ratio: r, min, pass: r >= min, note }); };
  // 1) شارة النتيجة: النص والرمز على تعبئتها (والقطع المفرّغ في الرمز يُظهر التعبئة نفسها)
  for (const id of RESULTS) {
    add('شارة النتيجة', `result/${id}/fg`, `result/${id}/bg`, v(`result/${id}/fg`), v(`result/${id}/bg`), 4.5, 'نص الشارة');
    add('شارة النتيجة', `result/${id}/icon`, `result/${id}/bg`, v(`result/${id}/icon`), v(`result/${id}/bg`), 3, 'الرمز وقطعه المفرّغ');
  }
  // 2) رمز الحالة منفردًا (العدّادات والصفوف): الرمز على الأسطح، والقطع المفرّغ يُظهر السطح نفسه
  for (const id of RESULTS) for (const b of SURF) add('الرمز منفردًا', `result/${id}/icon`, b, v(`result/${id}/icon`), v(b), 3, b === 'selection' ? 'صف محدد' : '');
  // 3) مؤشر الدورة: رمز ونص بلا حاوية، فيُقرأ على السطح مباشرة
  for (const id of CYCLES) for (const b of SURF) {
    add('مؤشر الدورة', `cycle/${id}/fg`, b, v(`cycle/${id}/fg`), v(b), 4.5, 'النص');
    add('مؤشر الدورة', `cycle/${id}/icon`, b, v(`cycle/${id}/icon`), v(b), 3, 'الرمز');
  }
  // 4) شارة الجاهزية: نص وحد على السطح (بلا تعبئة)
  for (const b of SURF) { add('شارة الجاهزية', 'text/secondary', b, v('text/secondary'), v(b), 4.5, 'النص'); add('شارة الجاهزية', 'border/strong', b, v('border/strong'), v(b), 3, 'الحد'); }
  // 5) شارة الحكم
  for (const id of VERDICTS) { add('شارة الحكم', `verdict/${id}/fg`, `verdict/${id}/bg`, v(`verdict/${id}/fg`), v(`verdict/${id}/bg`), 4.5, 'النص'); add('شارة الحكم', `verdict/${id}/icon`, `verdict/${id}/bg`, v(`verdict/${id}/icon`), v(`verdict/${id}/bg`), 3, 'رمز Lucide'); }
  for (const b of ['bg/canvas', 'bg/surface']) add('شارة الحكم', 'verdict/incomplete/border', b, v('verdict/incomplete/border'), v(b), 3, 'حد «غير مكتمل»');
  // 6) الوسوم
  add('الوسم المحايد', 'text/secondary', 'bg/sunken', v('text/secondary'), v('bg/sunken'), 4.5, 'النص');
  add('الوسم المحايد', 'text/secondary (icon)', 'bg/sunken', v('text/secondary'), v('bg/sunken'), 3, 'رمز Lucide بلون النص');
  add('وسم «ادعاء نموذج»', 'tag/model-claim/fg', 'tag/model-claim/bg', v('tag/model-claim/fg'), v('tag/model-claim/bg'), 4.5, 'النص');
  add('وسم «ادعاء نموذج»', 'tag/model-claim/icon', 'tag/model-claim/bg', v('tag/model-claim/icon'), v('tag/model-claim/bg'), 3, 'فقاعة الكلام');
  add('وسم «مبدئي»', 'text/secondary', 'border/subtle (خط)', v('text/secondary'), v('border/subtle'), 4.5, 'النص فوق الخط المائل');
  add('وسم «مبدئي»', 'text/secondary', 'bg/sunken', v('text/secondary'), v('bg/sunken'), 4.5, 'النص بين الخطوط');
  add('«جارٍ» في التجهيز', 'cycle/running/icon', 'bg/sunken', v('cycle/running/icon'), v('bg/sunken'), 3, 'المؤشر الأزرق داخل الوسم');
  // 7) الشدة ودائرة التدريج
  for (const b of ['bg/surface', 'bg/canvas']) {
    add('الشدة والدائرة', 'text/primary', b, v('text/primary'), v(b), 3, 'عمود أو قطعة مملوءة');
    add('الشدة والدائرة', 'border/strong', b, v('border/strong'), v(b), 3, 'عمود أو قطعة فارغة');
  }
  add('الشدة والدائرة', 'text/primary', 'border/strong', v('text/primary'), v('border/strong'), 3, 'المملوء مقابل الفارغ');
  // 8) بطاقة «قديم»: «باهتة» بلا شفافية (الشفافية 0.6 أسقطت 9 ثنائيات تحت الحد): الرقم text/secondary، و«من 24» text/tertiary،
  //    والدائرة Tone=muted: المملوء text/tertiary والفارغ border/subtle. والحكم والعدّادات كما هي (مغطاة أعلاه).
  add('بطاقة «قديم»', 'text/secondary', 'bg/surface', v('text/secondary'), v('bg/surface'), 3, 'رقم العيار 48 (نص كبير)');
  add('بطاقة «قديم»', 'text/tertiary', 'bg/surface', v('text/tertiary'), v('bg/surface'), 4.5, '«من 24»');
  add('بطاقة «قديم»', 'text/tertiary', 'bg/surface', v('text/tertiary'), v('bg/surface'), 3, 'الدائرة الباهتة: قطعة مملوءة');
  add('بطاقة «قديم»', 'text/tertiary', 'border/subtle', v('text/tertiary'), v('border/subtle'), 3, 'الدائرة الباهتة: المملوء مقابل الفارغ');
}
// معلوماتي: الخط المائل في «مبدئي»، وحالة «لا نطاق» في الدائرة (عنصر غير حامل لمعلومة وحده: يرافقه نص)
const info = [];
for (const m of MODES) {
  const s = TOK.semantic[m];
  info.push({ mode: m, name: 'border/subtle (خط «مبدئي») ↔ bg/sunken', ratio: contrast(s['border/subtle'], s['bg/sunken']) });
  info.push({ mode: m, name: 'border/subtle (دائرة «لا نطاق») ↔ bg/surface', ratio: contrast(s['border/subtle'], s['bg/surface']) });
}

// ---------- محاكاة عمى الألوان ----------
// لكل وضع ونوع: أزواج النتائج التي يقل فرق لون رمزها (ΔE2000) عن 10 بعد المحاكاة، فيصير الرمز وحده المميز.
const cvd = [];
for (const m of MODES) for (const [kind, M] of Object.entries(CVD)) {
  const sim = Object.fromEntries(RESULTS.map(id => [id, simulate(TOK.status[m][`result/${id}/icon`], M)]));
  const close = [];
  for (let i = 0; i < RESULTS.length; i++) for (let j = i + 1; j < RESULTS.length; j++) { const d = de2000(sim[RESULTS[i]], sim[RESULTS[j]]); if (d < 10) close.push([RESULTS[i], RESULTS[j], +d.toFixed(1)]); }
  const pf = de2000(sim.passed, sim.failed);
  cvd.push({ mode: m, kind, passedVsFailed: +pf.toFixed(1), closePairs: close, simulated: sim });
}
// الرموز: كل رمز نتيجة بشكل داخلي مختلف (S-08 يعرضها بالحبر وحده)، فالتمييز لا يعتمد على اللون.
const GLYPHS = { passed: 'علامة صح', failed: 'علامة ×', warning: 'مثلث مصمت', 'needs-review': 'عين', flaky: 'موجة', missing: 'علامة زائد', unavailable: 'مفتاح ربط مائل', 'timed-out': 'ساعة رملية', cancelled: 'مربع إيقاف', interrupted: 'وصلة مكسورة', skipped: 'سهم التفاف', 'not-applicable': 'شرطة' };
const uniqueGlyphs = new Set(Object.values(GLYPHS)).size === RESULTS.length;

// ---------- المطابقة مع Figma (اختيارية) ----------
// figma-values.json: القيم المحلولة لكل متغير Semantic وStatus في الوضعين، يصدّرها سكربت use_figma (تسليم DES-2).
let figmaMatch = null;
const fv = join(HERE, 'figma-values.json');
if (existsSync(fv)) {
  const F = JSON.parse(readFileSync(fv, 'utf8')); const mism = []; let n = 0;
  for (const m of MODES) for (const [k, hex] of Object.entries({ ...TOK.semantic[m], ...TOK.status[m] })) { if (k === 'overlay') continue; n++; const got = F[m]?.[k]; if (!got || got.toUpperCase() !== hex.toUpperCase()) mism.push([m, k, hex, got]); }
  figmaMatch = { compared: n, mismatches: mism };
}

// ---------- الإخراج ----------
const failed = rows.filter(r => !r.pass);
const fmt = r => r.toFixed(2);
console.log(`ثنائيات DES-2: ${rows.length}، فشل: ${failed.length}`);
for (const r of failed) console.log(`  FAIL ${r.mode} ${r.group}: ${r.fgName} على ${r.bgName} = ${fmt(r.ratio)} < ${r.min}`);
for (const g of [...new Set(rows.map(r => r.group))]) for (const m of MODES) { const rs = rows.filter(r => r.group === g && r.mode === m); const mn = rs.reduce((a, b) => (a.ratio < b.ratio ? a : b)); console.log(`  ${m} ${g}: أدنى ${fmt(mn.ratio)} (${mn.fgName} على ${mn.bgName}، الحد ${mn.min})`); }
for (const c of cvd) console.log(`CVD ${c.mode} ${c.kind}: اجتاز↔أخفق ΔE=${c.passedVsFailed}، أزواج متقاربة (ΔE<10): ${c.closePairs.length}`);
console.log(`رموز النتائج فريدة الشكل: ${uniqueGlyphs ? 'نعم' : 'لا'} (${Object.keys(GLYPHS).length})`);
if (figmaMatch) console.log(`مطابقة Figma: ${figmaMatch.compared} قيمة، اختلاف: ${figmaMatch.mismatches.length}`);

writeFileSync(join(HERE, 'checks.json'), JSON.stringify({ generatedBy: 'docs/design/DES-2/status-check.mjs', source: 'docs/design/DES-1/tokens.json (alternative A)', pairs: rows.map(r => [r.mode, r.group, r.fgName, r.bgName, r.fg, r.bg, +r.ratio.toFixed(2), r.min, r.pass, r.note]), informational: info.map(x => [x.mode, x.name, +x.ratio.toFixed(2)]), cvd, glyphs: GLYPHS, uniqueGlyphs, figmaMatch }, null, 2) + '\n');

let md = '# فحوص نظام الحالات — DES-2\n\n> مولّد من `status-check.mjs`، لا يُحرَّر يدويًا. القيم من `docs/design/DES-1/tokens.json` (البديل A المعتمد). نسب WCAG 2.x، والحد 4.5:1 للنص و3:1 للرموز والحدود وعناصر القياس، و3:1 لرقم العيار لأنه نص كبير (48).\n\n';
md += `## الخلاصة\n\n| البند | النتيجة |\n|---|---|\n| ثنائيات التباين الملزمة | ${rows.length - failed.length} من ${rows.length} نجحت |\n| رموز النتائج فريدة الشكل | ${uniqueGlyphs ? 'نعم' : 'لا'}: ${Object.keys(GLYPHS).length} رمزًا بـ ${new Set(Object.values(GLYPHS)).size} شكلًا داخليًا |\n`;
if (figmaMatch) md += `| مطابقة القيم مع Figma | ${figmaMatch.compared - figmaMatch.mismatches.length} من ${figmaMatch.compared} |\n`;
md += '\n### أدنى نسبة في كل مجموعة\n\n| المجموعة | الوضع | الثنائية | النسبة | الحد |\n|---|---|---|---|---|\n';
for (const g of [...new Set(rows.map(r => r.group))]) for (const m of MODES) { const rs = rows.filter(r => r.group === g && r.mode === m); const mn = rs.reduce((a, b) => (a.ratio < b.ratio ? a : b)); md += `| ${g} | ${m} | \`${mn.fgName}\` على \`${mn.bgName}\` | ${fmt(mn.ratio)}:1 | ${mn.min}:1 |\n`; }
md += '\n## محاكاة عمى الألوان (Machado 2009، شدة 1.0)\n\nلون رمز كل نتيجة بعد المحاكاة، والأزواج التي يقل فرقها عن ΔE2000 = 10 فلا يميزها اللون: يميزها شكل الرمز الداخلي والنص وحدهما.\n\n| الوضع | النوع | اجتاز ↔ أخفق (ΔE) | أزواج متقاربة اللون |\n|---|---|---|---|\n';
for (const c of cvd) md += `| ${c.mode} | ${c.kind} | ${c.passedVsFailed} | ${c.closePairs.map(p => `${p[0]}↔${p[1]} (${p[2]})`).join('، ') || '—'} |\n`;
md += '\n### الأشكال الداخلية لرموز النتائج\n\n| النتيجة | الشكل |\n|---|---|\n';
for (const [k, g] of Object.entries(GLYPHS)) md += `| ${k} | ${g} |\n`;
md += '\n## الثنائيات كاملة\n\n| الوضع | المجموعة | المقدّم | الخلفية | النسبة | الحد | النتيجة | ملاحظة |\n|---|---|---|---|---|---|---|---|\n';
for (const r of rows) md += `| ${r.mode} | ${r.group} | \`${r.fgName}\` ${r.fg} | \`${r.bgName}\` ${r.bg} | ${fmt(r.ratio)}:1 | ${r.min}:1 | ${r.pass ? 'نجح' : '**فشل**'} | ${r.note} |\n`;
md += '\n## معلوماتي (غير ملزم)\n\nالخط المائل في «مبدئي» زخرفة خفيفة يرافقها النص دائمًا، و«لا نطاق» في الدائرة يرافقه سطر «لا يوجد نطاق قابل للقياس» ولا رقم.\n\n| الوضع | الثنائية | النسبة |\n|---|---|---|\n';
for (const x of info) md += `| ${x.mode} | ${x.name} | ${fmt(x.ratio)}:1 |\n`;
if (figmaMatch && figmaMatch.mismatches.length) { md += '\n## اختلافات Figma\n\n| الوضع | المتغير | tokens.json | Figma |\n|---|---|---|---|\n'; for (const x of figmaMatch.mismatches) md += `| ${x.join(' | ')} |\n`; }
writeFileSync(join(HERE, 'checks.md'), md);
process.exit(failed.length || !uniqueGlyphs || (figmaMatch && figmaMatch.mismatches.length) ? 1 : 0);
