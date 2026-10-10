// DES-3 — فاحص تباين المكوّنات في الوضعين.
// يقرأ الثنائيات المصدَّرة من Figma (figma-pairs.json: كل نص ورمز وحد وحلقة تركيز وشريط تحديد وتعبئة تحكم
// في المكوّنات الاثنين والستين، مع متغير أقرب خلفية مملوءة) ويحسب تباينها بقيم DES-1 المعتمدة
// (../DES-1/tokens.json، البديل A) في الوضعين الفاتح والداكن.
// الحدود: نص 4.5:1، ورمز وحد وحلقة تركيز ومؤشر تحديد وتعبئة تحكم بلا إطار 3:1.
// المستثنى (يُعرض ولا يُفشل): حالات «معطل» (WCAG 1.4.3 و1.4.11 تستثني العناصر غير النشطة)، والخطوط
// الزخرفية بـ border/subtle (D-DES1-03 وD-DES2-13)، وتعبئة تحكم له إطار border/strong يحمل الحد.
// يكتب checks.md وchecks.json، ويخرج برمز 1 إن فشلت ثنائية ملزمة.
// التشغيل: /opt/homebrew/bin/node docs/design/DES-3/component-check.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOK = JSON.parse(readFileSync(join(HERE, '../DES-1/tokens.json'), 'utf8')).alternatives.A;
const { pairs } = JSON.parse(readFileSync(join(HERE, 'figma-pairs.json'), 'utf8'));
const MODES = ['light', 'dark'];

const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const toLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = hex => { const [r, g, b] = hex2rgb(hex).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
const value = (mode, name) => TOK.semantic[mode][name] ?? TOK.status[mode][name];

const FILLED = new Set(['text/primary', 'text/secondary', 'text/tertiary']);
function rule(kind, fg) {
  if (kind.endsWith('-disabled')) return { min: kind.startsWith('text') ? 4.5 : 3, required: false, why: 'معطل (مستثنى، WCAG 1.4.3/1.4.11)' };
  if (fg === 'border/subtle') return { min: 3, required: false, why: 'زخرفي (D-DES1-03، D-DES2-13)' };
  if (kind === 'text') return { min: 4.5, required: true, why: 'نص' };
  if (kind === 'fill-boundary') return FILLED.has(fg) ? { min: 3, required: true, why: 'تعبئة تحكم بلا إطار' } : { min: 3, required: false, why: 'تعبئة تحكم بإطار border/strong (الإطار يحمل الحد)' };
  return { min: 3, required: true, why: { icon: 'رمز', border: 'حد', 'focus-ring': 'حلقة تركيز', indicator: 'مؤشر تحديد' }[kind] || kind };
}

const rows = [];
for (const [kind, fg, bg, count, sets] of pairs) {
  const r = rule(kind, fg);
  for (const mode of MODES) {
    const f = value(mode, fg), b = value(mode, bg);
    if (!f || !b) throw new Error(`متغير غير معروف: ${fg} أو ${bg}`);
    const c = contrast(f, b);
    rows.push({ mode, kind, fg, bg, fgHex: f, bgHex: b, ratio: Math.round(c * 100) / 100, min: r.min, required: r.required, why: r.why, pass: c >= r.min, count, sets });
  }
}
const required = rows.filter(r => r.required), failed = required.filter(r => !r.pass);
const exempt = rows.filter(r => !r.required);
const md = [
  '# DES-3 — تباين المكوّنات في الوضعين',
  '',
  `ناتج \`component-check.mjs\` على \`figma-pairs.json\`. الثنائيات: ${pairs.length} (×2 وضعين = ${rows.length}). الملزمة: ${required.length}، نجح منها ${required.length - failed.length}. والمستثناة المعروضة: ${exempt.length}.`,
  '',
  `أدنى نص ملزم: ${Math.min(...required.filter(r => r.kind === 'text').map(r => r.ratio))}:1. وأدنى غير نص ملزم: ${Math.min(...required.filter(r => r.kind !== 'text').map(r => r.ratio))}:1.`,
  '',
  '| الوضع | النوع | الأمامي | الخلفية | النسبة | الحد | ملزم | النتيجة | السبب | أمثلة |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.mode} | ${r.kind} | \`${r.fg}\` ${r.fgHex} | \`${r.bg}\` ${r.bgHex} | ${r.ratio} | ${r.min} | ${r.required ? 'نعم' : 'لا'} | ${r.pass ? 'نجح' : r.required ? '**فشل**' : 'دون الحد (مستثنى)'} | ${r.why} | ${r.sets.join('، ')} |`),
  '',
];
writeFileSync(join(HERE, 'checks.md'), md.join('\n'));
writeFileSync(join(HERE, 'checks.json'), JSON.stringify({ pairs: pairs.length, rows: rows.length, required: required.length, failed: failed.length, rowsDetail: rows }, null, 1));
console.log(`required ${required.length}, failed ${failed.length}, exempt ${exempt.length}`);
for (const f of failed) console.log(`FAIL ${f.mode} ${f.kind} ${f.fg} on ${f.bg}: ${f.ratio} < ${f.min} (${f.sets.join(', ')})`);
process.exit(failed.length ? 1 : 0);
