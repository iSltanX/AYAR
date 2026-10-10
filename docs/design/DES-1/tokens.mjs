// DES-1 — مولّد قيم الألوان وفاحص التباين لعِيَار.
// يشتق السلالم في فضاء OKLab، ويحسب نسب تباين WCAG 2.x وفرق CIEDE2000 عن لون العُرف،
// ويكتب tokens.json (مصدر متغيرات Figma) وcontrast.md (جدول التباين). ويخرج برمز 1 إن فشلت ثنائية.
// التشغيل: /opt/homebrew/bin/node docs/design/DES-1/tokens.mjs [--alt A|B]
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CREST = '#A33D2F';          // لون العُرف (D-49): خارج متغيرات الواجهة
const CREST_MIN_DE = 10;          // أدنى فرق CIEDE2000 مسموح بين أي متغير واجهة ولون العُرف

// ---------- رياضيات اللون ----------
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const toLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgb2oklab(rgb) {
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklab2linrgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = lin => lin.every(c => c >= -1e-6 && c <= 1 + 1e-6);
const lin2hex = lin => '#' + lin.map(c => Math.round(Math.min(1, Math.max(0, fromLin(c))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
function oklch2hex(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  let lo = 0, hi = C;
  if (!inGamut(oklab2linrgb([L, C * Math.cos(h), C * Math.sin(h)]))) {
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; inGamut(oklab2linrgb([L, mid * Math.cos(h), mid * Math.sin(h)])) ? (lo = mid) : (hi = mid); }
    C = lo;
  }
  return lin2hex(oklab2linrgb([L, C * Math.cos(h), C * Math.sin(h)]));
}
const lab2hex = ([L, a, b]) => lin2hex(oklab2linrgb([L, a, b]));
const oklch = hex => { const [L, a, b] = rgb2oklab(hex2rgb(hex)); return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }; };

// WCAG 2.x
const lum = hex => { const [r, g, b] = hex2rgb(hex).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
// مزج لون شفاف فوق خلفية (للـoverlay)
const over = (hex, alpha, bg) => '#' + hex2rgb(hex).map((c, i) => Math.round((c * alpha + hex2rgb(bg)[i] * (1 - alpha)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

// CIEDE2000 (D65)
function hex2lab(hex) {
  const [r, g, b] = hex2rgb(hex).map(toLin);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function de2000(h1, h2) {
  const [L1, a1, b1] = hex2lab(h1), [L2, a2, b2] = hex2lab(h2);
  const rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G), Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, a) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = hp2 - hp1; if (Cp1 * Cp2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2; if (Cp1 * Cp2 !== 0) hb = Math.abs(hp1 - hp2) > 180 ? (hb + 360) / 2 : hb / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// ---------- السلالم ----------
const NSTEPS = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
// سلم الحبر والرمادي: أهداف L في OKLab لكل درجة، ومراسٍ تمر بها السلسلة (a,b تُستكمل خطيًا بين المراسي حسب L)
const NEUTRAL_L = {
  light: [0.99, null, 0.935, 0.885, 0.79, 0.61, null, 0.42, 0.345, 0.275, null],
  dark: [0.175, null, 0.255, 0.3, 0.385, 0.47, 0.59, 0.7, 0.8, 0.89, null],
};
const ALTS = {
  // A: من ألوان الهوية المعتمدة (توصية G-03)
  A: { name: 'الهوية', light: { 100: '#F7F4EC', 600: '#59676C', 1000: '#141B20' }, dark: { 100: '#141B20', 1000: '#F7F4EC', grayAt: 600, gray: '#59676C' } },
  // B: من نقاط بداية البرومبت §4.2
  B: { name: 'البرومبت', light: { 100: '#FAF8F3', 600: '#5B6472', 1000: '#14161A' }, dark: { 100: '#121418', 1000: '#F3F1EC', grayAt: 700, gray: '#9AA3B2' } },
};
function neutralRamp(alt, mode) {
  const spec = ALTS[alt][mode];
  const anchors = []; // [index, oklab]
  for (const [k, v] of Object.entries(spec)) if (/^\d+$/.test(k)) anchors.push([NSTEPS.indexOf(+k), rgb2oklab(hex2rgb(v))]);
  if (spec.gray) { const g = rgb2oklab(hex2rgb(spec.gray)); anchors.push([NSTEPS.indexOf(spec.grayAt), [NEUTRAL_L[mode][NSTEPS.indexOf(spec.grayAt)], g[1], g[2]]]); }
  anchors.sort((p, q) => p[0] - q[0]);
  const out = {};
  NSTEPS.forEach((s, i) => {
    const anchor = anchors.find(a => a[0] === i);
    if (anchor && spec[s]) { out[s] = spec[s]; return; }
    const L = anchor ? anchor[1][0] : NEUTRAL_L[mode][i];
    // a,b: استكمال خطي بين أقرب مرساتين حسب L، وما وراء الطرف يأخذ ab الطرف
    const lo = [...anchors].reverse().find(a => a[0] <= i) || anchors[0];
    const hi = anchors.find(a => a[0] >= i) || anchors[anchors.length - 1];
    let t = lo === hi ? 0 : (L - lo[1][0]) / (hi[1][0] - lo[1][0]);
    t = Math.min(1, Math.max(0, t));
    const a = lo[1][1] + (hi[1][1] - lo[1][1]) * t, b = lo[1][2] + (hi[1][2] - lo[1][2]) * t;
    out[s] = lab2hex([L, a, b]);
  });
  return out;
}

const HSTEPS = [100, 200, 300, 400, 500, 600, 700];
const HUE_L = { light: [0.965, 0.925, 0.86, 0.74, 0.585, 0.5, 0.42], dark: [0.275, 0.32, 0.4, 0.54, 0.7, 0.79, 0.87] };
const HUE_C = { light: [0.12, 0.24, 0.45, 0.75, 1, 1, 0.9], dark: [0.28, 0.38, 0.6, 0.9, 1, 0.85, 0.6] };
// المرجع: نقاط البرومبت §4.2 (فاتح/داكن). والأحمر مُزاح نحو القرمزي (h) ليبتعد عن لون العُرف (h≈30)
const HUES = {
  green: { light: '#1E7A4C', dark: '#4CC38A' },
  red: { light: '#C2372E', dark: '#F07068', h: { light: 16, dark: 16 }, cBoost: 1.08 },
  blue: { light: '#2563EB', dark: '#6EA2FF' },
  amber: { light: '#A15C00', dark: '#F2B347', h: { light: 66, dark: 72 } },
  purple: { light: '#6D3FC8', dark: '#B49AF5' },
};
function hueRamp(name, mode) {
  const ref = oklch(HUES[name][mode]);
  const h = HUES[name].h?.[mode] ?? ref.h, C = ref.C * (HUES[name].cBoost ?? 1);
  const out = {};
  HSTEPS.forEach((s, i) => (out[s] = oklch2hex(HUE_L[mode][i], C * HUE_C[mode][i], h)));
  return out;
}

// ---------- الدلالات ----------
// قيم Semantic أسماء درجات Primitives لكل وضع
const SEMANTIC = {
  'bg/canvas': ['neutral/100', 'neutral/100'],
  'bg/surface': ['neutral/0', 'neutral/200'],
  'bg/sunken': ['neutral/200', 'neutral/0'],
  'bg/elevated': ['neutral/0', 'neutral/300'],
  'border/subtle': ['neutral/300', 'neutral/400'],
  'border/strong': ['neutral/500', 'neutral/600'],
  'text/primary': ['neutral/1000', 'neutral/1000'],
  'text/secondary': ['neutral/700', 'neutral/800'],
  'text/tertiary': ['neutral/600', 'neutral/700'],
  'text/inverse': ['neutral/100', 'neutral/100'],
  'focus/ring': ['neutral/1000', 'neutral/1000'],
  'selection': ['neutral/200', 'neutral/300'],
  'overlay': [{ base: 'neutral/1000', alpha: 0.32 }, { base: 'neutral/0', alpha: 0.6 }],
};
// Status: [bg, fg, icon, border] لكل وضع
const S = (bg, fg, icon, border) => ({ bg, fg, icon, border });
const STATUS = {
  // 6.1 النتائج
  'result/passed': [S('green/100', 'green/700', 'green/500', 'green/500'), S('green/100', 'green/700', 'green/500', 'green/500')],
  'result/failed': [S('red/100', 'red/700', 'red/500', 'red/500'), S('red/100', 'red/700', 'red/500', 'red/500')],
  'result/warning': [S('amber/100', 'amber/700', 'amber/500', 'amber/500'), S('amber/100', 'amber/700', 'amber/500', 'amber/500')],
  'result/needs-review': [S('purple/100', 'purple/700', 'purple/500', 'purple/500'), S('purple/100', 'purple/700', 'purple/500', 'purple/500')],
  'result/flaky': [S('amber/100', 'amber/700', 'amber/500', 'amber/500'), S('amber/100', 'amber/700', 'amber/500', 'amber/500')],
  'result/missing': [S('neutral/200', 'neutral/900', 'neutral/600', 'neutral/500'), S('neutral/400', 'neutral/1000', 'neutral/800', 'neutral/600')],
  'result/unavailable': [S('neutral/400', 'neutral/1000', 'neutral/800', 'neutral/600'), S('neutral/500', 'neutral/1000', 'neutral/900', 'neutral/700')],
  'result/timed-out': [S('amber/300', 'amber/700', 'amber/600', 'amber/600'), S('amber/300', 'amber/700', 'amber/600', 'amber/600')],
  'result/cancelled': [S('neutral/300', 'neutral/1000', 'neutral/700', 'neutral/500'), S('neutral/400', 'neutral/1000', 'neutral/800', 'neutral/600')],
  'result/interrupted': [S('neutral/300', 'neutral/1000', 'neutral/700', 'neutral/500'), S('neutral/400', 'neutral/1000', 'neutral/800', 'neutral/600')],
  'result/skipped': [S('neutral/200', 'neutral/800', 'neutral/600', 'neutral/500'), S('neutral/300', 'neutral/900', 'neutral/700', 'neutral/600')],
  'result/not-applicable': [S('neutral/100', 'neutral/700', 'neutral/600', 'neutral/500'), S('neutral/300', 'neutral/800', 'neutral/700', 'neutral/600')],
  // 6.2 دورة التنفيذ
  'cycle/queued': [S('neutral/100', 'neutral/800', 'neutral/600', 'neutral/500'), S('neutral/300', 'neutral/800', 'neutral/700', 'neutral/600')],
  'cycle/running': [S('blue/100', 'blue/700', 'blue/500', 'blue/500'), S('blue/100', 'blue/700', 'blue/500', 'blue/500')],
  'cycle/cancelling': [S('neutral/200', 'neutral/900', 'neutral/700', 'neutral/500'), S('neutral/400', 'neutral/1000', 'neutral/800', 'neutral/600')],
  // 6.5 الأحكام
  'verdict/pure': [S('green/100', 'green/700', 'green/500', 'green/500'), S('green/100', 'green/700', 'green/500', 'green/500')],
  'verdict/incomplete': [S('neutral/0', 'neutral/1000', 'neutral/700', 'neutral/500'), S('neutral/200', 'neutral/1000', 'neutral/800', 'neutral/600')],
  'verdict/blocked': [S('red/100', 'red/700', 'red/500', 'red/500'), S('red/100', 'red/700', 'red/500', 'red/500')],
  // وسم «ادعاء نموذج»
  'tag/model-claim': [S('purple/100', 'purple/700', 'purple/500', 'purple/500'), S('purple/100', 'purple/700', 'purple/500', 'purple/500')],
};

// ---------- البناء والفحص ----------
function build(alt) {
  const modes = ['light', 'dark'];
  const prim = {};
  for (const m of modes) {
    const p = {};
    for (const [s, v] of Object.entries(neutralRamp(alt, m))) p[`neutral/${s}`] = v;
    for (const h of Object.keys(HUES)) for (const [s, v] of Object.entries(hueRamp(h, m))) p[`${h}/${s}`] = v;
    prim[m] = p;
  }
  const resolve = (m, ref) => (typeof ref === 'string' ? prim[m][ref] : null);
  const sem = { light: {}, dark: {} };
  modes.forEach((m, i) => { for (const [k, v] of Object.entries(SEMANTIC)) sem[m][k] = typeof v[i] === 'string' ? prim[m][v[i]] : over(prim[m][v[i].base], v[i].alpha, prim[m]['neutral/100']); });
  const status = { light: {}, dark: {} };
  modes.forEach((m, i) => { for (const [k, v] of Object.entries(STATUS)) for (const role of ['fg', 'bg', 'border', 'icon']) status[m][`${k}/${role}`] = resolve(m, v[i][role]); });

  // ثنائيات التباين
  const rows = [];
  const add = (group, fgName, bgName, fg, bg, min, mode, note = '') => rows.push({ group, fgName, bgName, fg, bg, ratio: contrast(fg, bg), min, pass: contrast(fg, bg) >= min, mode, note });
  for (const m of modes) {
    const s = sem[m];
    const bgs = ['bg/canvas', 'bg/surface', 'bg/sunken', 'bg/elevated', 'selection'];
    for (const t of ['text/primary', 'text/secondary', 'text/tertiary']) for (const b of bgs) add('نص', t, b, s[t], s[b], 4.5, m);
    add('نص', 'text/inverse', 'text/primary (الزر الرئيسي)', s['text/inverse'], s['text/primary'], 4.5, m);
    for (const b of ['bg/canvas', 'bg/surface', 'bg/sunken', 'bg/elevated']) add('حد وتركيز', 'border/strong', b, s['border/strong'], s[b], 3, m);
    for (const b of ['bg/canvas', 'bg/surface', 'bg/sunken', 'bg/elevated', 'selection']) add('حد وتركيز', 'focus/ring', b, s['focus/ring'], s[b], 3, m);
    // مؤشر التحديد (D-DES1-03): شريط بعرض 2px على الحافة البادئة بلون border/strong يرافق تعبئة selection
    add('حد وتركيز', 'border/strong', 'selection (مؤشر التحديد)', s['border/strong'], s['selection'], 3, m);
    for (const k of Object.keys(STATUS)) {
      const st = status[m], bg = st[`${k}/bg`];
      add('حالة', `${k}/fg`, `${k}/bg`, st[`${k}/fg`], bg, 4.5, m);
      add('حالة', `${k}/icon`, `${k}/bg`, st[`${k}/icon`], bg, 3, m);
      add('حالة', `${k}/icon`, 'bg/surface', st[`${k}/icon`], s['bg/surface'], 3, m, 'الرمز منفردًا في صف');
      add('حالة', `${k}/border`, 'bg/surface', st[`${k}/border`], s['bg/surface'], 3, m);
    }
  }
  // معلوماتي غير ملزم (D-DES1-03): الحد الخفيف فاصل زخرفي مستثنى، وتعبئة التحديد لا تكفي وحدها فيرافقها مؤشر border/strong (ثنائيته ملزمة أعلاه)
  const info = [];
  for (const m of modes) {
    info.push({ name: 'border/subtle ↔ bg/surface', ratio: contrast(sem[m]['border/subtle'], sem[m]['bg/surface']), mode: m });
    info.push({ name: 'selection ↔ bg/surface', ratio: contrast(sem[m]['selection'], sem[m]['bg/surface']), mode: m });
  }
  // D-49: لا متغير واجهة قريب من لون العُرف
  const crest = [];
  for (const m of modes) for (const [k, v] of Object.entries({ ...prim[m], ...sem[m], ...status[m] })) crest.push({ name: k, mode: m, hex: v, de: de2000(v, CREST) });
  crest.sort((p, q) => p.de - q.de);
  return { prim, sem, status, rows, info, crest };
}

const altArg = process.argv.includes('--alt') ? process.argv[process.argv.indexOf('--alt') + 1] : null;
const results = { A: build('A'), B: build('B') };
let failed = 0;
const fmt = r => r.toFixed(2);
for (const alt of ['A', 'B']) {
  const R = results[alt];
  const f = R.rows.filter(r => !r.pass);
  const c = R.crest.filter(x => x.de < CREST_MIN_DE);
  console.log(`[${alt} ${ALTS[alt].name}] ثنائيات: ${R.rows.length}، فشل: ${f.length}، أدنى ΔE00 عن العُرف: ${fmt(R.crest[0].de)} (${R.crest[0].name} ${R.crest[0].mode} ${R.crest[0].hex})، دون ${CREST_MIN_DE}: ${c.length}`);
  for (const r of f) console.log(`  FAIL ${r.mode} ${r.fgName} on ${r.bgName}: ${fmt(r.ratio)} < ${r.min}`);
  for (const x of c) console.log(`  CREST ${x.mode} ${x.name} ${x.hex} ΔE=${fmt(x.de)}`);
  if (!altArg || altArg === alt) failed += f.length + c.length;
}
writeFileSync(join(HERE, 'tokens.json'), JSON.stringify({ generatedBy: 'docs/design/DES-1/tokens.mjs', crest: CREST, crestMinDeltaE2000: CREST_MIN_DE, recommended: 'A', semanticAliases: SEMANTIC, statusAliases: STATUS, alternatives: Object.fromEntries(Object.entries(results).map(([k, R]) => [k, { name: ALTS[k].name, primitives: R.prim, semantic: R.sem, status: R.status, contrast: R.rows.map(r => [r.mode, r.group, r.fgName, r.bgName, r.fg, r.bg, +r.ratio.toFixed(2), r.min, r.pass]), closestToCrest: R.crest.slice(0, 5).map(x => [x.name, x.mode, x.hex, +x.de.toFixed(2)]) }])) }, null, 2) + '\n');

// contrast.md
let md = '# جدول التباين — DES-1\n\n> مولّد من `tokens.mjs`، لا يُحرَّر يدويًا. نسب WCAG 2.x محسوبة من القيم الست عشرية، والحد 4.5:1 للنص و3:1 للرموز والحدود وحلقة التركيز.\n\n';
md += '## الخلاصة\n\n| البديل | الثنائيات | ناجحة | أدنى ΔE2000 عن العُرف `#A33D2F` |\n|---|---|---|---|\n';
for (const alt of ['A', 'B']) { const R = results[alt]; md += `| ${alt} — ${ALTS[alt].name} | ${R.rows.length} | ${R.rows.filter(r => r.pass).length} | ${fmt(R.crest[0].de)} (\`${R.crest[0].name}\` ${R.crest[0].mode}) |\n`; }
md += `\nحد القرب من لون العُرف: ΔE2000 ≥ ${CREST_MIN_DE} لكل متغير واجهة في الوضعين (D-49).\n`;
for (const alt of ['A', 'B']) {
  const R = results[alt];
  md += `\n## البديل ${alt} — ${ALTS[alt].name}\n\n### السلم المحايد\n\n| الدرجة | فاتح | داكن |\n|---|---|---|\n`;
  for (const s of NSTEPS) md += `| neutral/${s} | \`${R.prim.light[`neutral/${s}`]}\` | \`${R.prim.dark[`neutral/${s}`]}\` |\n`;
  md += '\n### الثنائيات\n\n| الوضع | المجموعة | المقدّم | الخلفية | النسبة | الحد | النتيجة |\n|---|---|---|---|---|---|---|\n';
  for (const r of R.rows) md += `| ${r.mode} | ${r.group} | \`${r.fgName}\` ${r.fg} | \`${r.bgName}\` ${r.bg} | ${fmt(r.ratio)}:1 | ${r.min}:1 | ${r.pass ? 'نجح' : '**فشل**'} |\n`;
  md += '\n### معلوماتي (غير ملزم، D-DES1-03)\n\nborder/subtle فاصل زخرفي مستثنى من حد 3:1. وتعبئة selection وحدها لا تكفي دليلًا على التحديد، فيرافقها دائمًا شريط بعرض 2px على الحافة البادئة بلون border/strong، وثنائيته مع selection ومع bg/surface ملزمة في جدول الثنائيات أعلاه.\n\n| الوضع | الثنائية | النسبة |\n|---|---|---|\n';
  for (const x of R.info) md += `| ${x.mode} | ${x.name} | ${fmt(x.ratio)}:1 |\n`;
}
md += '\n## سلالم الدلالة (مشتركة بين البديلين)\n\n| الدرجة | فاتح | داكن |\n|---|---|---|\n';
for (const h of Object.keys(HUES)) for (const s of HSTEPS) md += `| ${h}/${s} | \`${results.A.prim.light[`${h}/${s}`]}\` | \`${results.A.prim.dark[`${h}/${s}`]}\` |\n`;
writeFileSync(join(HERE, 'contrast.md'), md);
process.exit(failed ? 1 : 0);
