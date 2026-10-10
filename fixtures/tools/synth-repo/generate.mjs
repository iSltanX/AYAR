#!/usr/bin/env node
// مولّد مستودعات اصطناعية بأحجام معروفة لقياس الأداء (AT-36، DEV-1 المهمة 9): 1000 و10000 و50000 ملف.
//
//   node fixtures/tools/synth-repo/generate.mjs --files 1000 --out <مجلد-فارغ> [--seed 1]
//   node fixtures/tools/synth-repo/generate.mjs --preset small|medium|large --out <مجلد>    # 1000 | 10000 | 50000
//
// حتمي: البذرة نفسها تعطي الشجرة والمحتوى نفسيهما بايتًا لبايت. الشجرة مشروع TypeScript/Python/Markdown/JSON متداخل بعمق 4،
// ولا تتجاوز الملفات 2 كيلوبايت، فيقيس الاكتشاف والجرد لا القراءة. لا يستدعي git ولا أي أمر.
// يطبع في آخر سطر: {"files":N,"bytes":B,"seed":S,"ms":T}

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const presets = { small: 1000, medium: 10000, large: 50000 };
const total = Number(opt('files', presets[opt('preset', '')] ?? 0));
const out = opt('out');
const seed = Number(opt('seed', '1'));
if (!total || !out) { console.error('الاستخدام: generate.mjs (--files N | --preset small|medium|large) --out <مجلد> [--seed 1]'); process.exit(2); }
const root = path.resolve(out);
if (fs.existsSync(root) && fs.readdirSync(root).length) { console.error(`المجلد الهدف غير فارغ: ${root}`); process.exit(1); }

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(seed);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const words = ['alpha', 'beta', 'gamma', 'delta', 'omega', 'order', 'index', 'cache', 'queue', 'token', 'parse', 'build', 'merge', 'split', 'trace'];
const t0 = Date.now();
let bytes = 0;
function write(rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  bytes += Buffer.byteLength(content);
}

write('package.json', `${JSON.stringify({ name: 'synthetic-repo', version: '1.0.0', private: true, type: 'module' }, null, 2)}\n`);
write('tsconfig.json', `${JSON.stringify({ compilerOptions: { target: 'ES2022', strict: true, noEmit: true }, include: ['packages'] }, null, 2)}\n`);
write('.gitignore', 'node_modules/\ndist/\n');
write('README.md', '# مستودع اصطناعي لقياس الأداء\n\nيولَّد بـ fixtures/tools/synth-repo/generate.mjs ولا يُلتزم.\n');
let count = 4;
const pkgCount = Math.max(1, Math.round(total / 250));
let pkg = 0;
while (count < total) {
  const p = `packages/pkg-${String(pkg % pkgCount).padStart(4, '0')}`;
  const group = pick(['core', 'ui', 'data', 'util', 'net']);
  const sub = `${p}/${group}/${pick(words)}`;
  const n = count;
  const kind = n % 10;
  const name = `${pick(words)}-${n}`;
  if (kind < 5) write(`${sub}/${name}.ts`, `import { ${pick(words)} } from './${pick(words)}-${Math.floor(rnd() * 50)}';\n\nexport function ${pick(words)}${n}(input: number): number {\n  return input * ${Math.floor(rnd() * 97) + 1} + ${n};\n}\n\nexport const ${pick(words)}Id${n} = '${name}';\nvoid ${pick(words)};\n`);
  else if (kind < 7) write(`${sub}/${name}.py`, `"""وحدة اصطناعية ${n}."""\n\n\ndef ${pick(words)}_${n}(value: int) -> int:\n    return value * ${Math.floor(rnd() * 97) + 1} + ${n}\n`);
  else if (kind < 8) write(`${sub}/${name}.test.ts`, `import { expect, it } from 'vitest';\n\nit('${name}', () => {\n  expect(${n} % 2).toBeLessThan(2);\n});\n`);
  else if (kind < 9) write(`${sub}/${name}.md`, `# ${name}\n\nوصف اصطناعي للوحدة ${n}. انظر [الأصل](../../README.md).\n`);
  else write(`${sub}/${name}.json`, `${JSON.stringify({ id: n, name, tags: [pick(words), pick(words)] })}\n`);
  count += 1;
  if (count % 250 === 0) pkg += 1;
}
console.log(JSON.stringify({ files: count, bytes, seed, ms: Date.now() - t0 }));
