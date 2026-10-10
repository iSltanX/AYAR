#!/usr/bin/env node
// يولّد styles/tokens.css من design/tokens.json (صيغة DTCG مع قيمة الثيم الداكن في $extensions.mode.dark).
//   node tools/build-tokens.mjs           # يكتب الملف
//   node tools/build-tokens.mjs --check   # يتحقق أن الملف مولَّد من الرموز الحالية (يخرج بـ 1 إن اختلف)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design', 'tokens.json'), 'utf8'));
const light = [];
const dark = [];

function value(v) {
  return Array.isArray(v) ? v.map((s) => (/\s/.test(s) ? `'${s}'` : s)).join(', ') : v;
}
function walk(node, trail) {
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (child && typeof child === 'object' && '$value' in child) {
      const name = `--${[...trail, key].join('-')}`;
      light.push(`  ${name}: ${value(child.$value)};`);
      const d = child.$extensions?.mode?.dark;
      if (d) dark.push(`  ${name}: ${value(d)};`);
    } else if (child && typeof child === 'object') {
      walk(child, [...trail, key]);
    }
  }
}
walk(tokens, []);

const css = `/* مولَّد من design/tokens.json بـ tools/build-tokens.mjs — لا تُحرَّر يدويًّا */
:root {
${light.join('\n')}
}

:root[data-theme='dark'] {
${dark.join('\n')}
}
`;
const target = path.join(root, 'styles', 'tokens.css');
if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== css) {
    console.error('styles/tokens.css لا يطابق design/tokens.json');
    process.exit(1);
  }
  console.log('tokens.css مطابق للرموز');
} else {
  fs.writeFileSync(target, css);
  console.log(`كُتب ${path.relative(root, target)}`);
}
