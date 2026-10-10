// E-12: منع كتابة اللقطات (الخطة 22، C-15 صفوف Vitest وJest وPlaywright، S-51، S-16).
// على مكوّنات FX-ADAPTERS (vitest وjest وplaywright) تُضاف اختبارات بلقطات ناقصة (toMatchSnapshot وinline وfile وtoHaveScreenshot)
// ولقطة قديمة غير مستخدمة، ثم يُشغَّل كل إطار بأعلام C-15 وبدونها، **دون متغير CI** (C-07 لا يضبطه)، مع لقطة حالة لشجرة
// المكوّن قبل/بعد: المعيار صفر كتابة بالأعلام، وكتابة فعلية دونها (ضابط إيجابي).
//   node spikes/E-12-snapshot-guard/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NVM_NODE, baseEnv, diffSnapshot, excerpt, materialize, resultsDir, rmrf, run, snapshot, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const NODE24 = path.join(NVM_NODE, 'v24.16.0', 'bin');
const env = baseEnv({ PATH: `${NODE24}:${baseEnv().PATH}` });
delete env.CI;
const out = { at: new Date().toISOString(), cases: [] };
const SKIP = new Set(['node_modules']);

async function runCase(tool, dir, name, cmd, extraEnv = {}) {
  const R = tmpdir('ayar-e12-r');
  const before = snapshot(dir, { skip: SKIP });
  const r = await run(cmd.replaceAll('$R', R), { cwd: dir, env: { ...env, ...Object.fromEntries(Object.entries(extraEnv).map(([k, v]) => [k, v.replaceAll('$R', R)])) }, timeout: 240 });
  const d = diffSnapshot(before, snapshot(dir, { skip: SKIP }));
  const row = { tool, name, cmd, exit: r.code, ms: r.ms, writes: { added: d.added, changed: d.changed, removed: d.removed }, zeroWrites: d.clean, tail: excerpt((r.out + '\n' + r.err).split('\n').filter((l) => /snapshot|Snapshot|written|obsolete|missing|mismatch|update|توقف|failed|passed/i.test(l)).slice(0, 8).join('\n'), 700) };
  out.cases.push(row);
  console.log(`• ${tool} · ${name}: exit=${r.code} writes=${d.added.length + d.changed.length + d.removed.length} ${d.clean ? '✓ صفر كتابة' : '✗ ' + [...d.added, ...d.changed, ...d.removed].slice(0, 3).join(', ')}`);
  // استعادة الحالة: حذف ما كُتب
  for (const f of [...d.added]) rmrf(path.join(dir, f));
  rmrf(R);
  return row;
}

// ── Vitest 5.0.3 ──
{
  const { base, root } = await materialize('FX-ADAPTERS', 'good', 'ayar-e12');
  const dir = path.join(root, 'vitest');
  await run('pnpm install --frozen-lockfile --silent', { cwd: dir, env, timeout: 600 });
  fs.writeFileSync(path.join(dir, 'test', 'snap.test.js'), `import { expect, it } from 'vitest';\nit('لقطة ناقصة', () => { expect({ a: 1, b: 'عربي' }).toMatchSnapshot(); });\nit('لقطة مضمّنة ناقصة', () => { expect('قيمة').toMatchInlineSnapshot(); });\nit('لقطة ملف ناقصة', async () => { await expect('محتوى').toMatchFileSnapshot('./__snapshots__/file.txt'); });\n`);
  fs.mkdirSync(path.join(dir, 'test', '__snapshots__'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'test', '__snapshots__', 'obsolete.test.js.snap'), `// Vitest Snapshot v1\n\nexports[\`قديم 1\`] = \`"x"\`;\n`);
  const flags = '--reporter=default --reporter=json --outputFile.json=$R/vitest.json';
  await runCase('vitest', dir, 'افتراضي (بلا أعلام، بلا CI)', `pnpm exec vitest run ${flags}`);
  await runCase('vitest', dir, '--update=none (C-15)', `pnpm exec vitest run ${flags} --update=none`);
  await runCase('vitest', dir, 'CI=1 بلا أعلام (مقارنة)', `pnpm exec vitest run ${flags}`, { CI: '1' });
  await runCase('vitest', dir, '--update=none مع --update=false (هل يقبلهما)', `pnpm exec vitest run ${flags} --update=false`);
  rmrf(base);
}

// ── Jest 30.5.2 ──
{
  const { base, root } = await materialize('FX-ADAPTERS', 'good', 'ayar-e12');
  const dir = path.join(root, 'jest');
  await run('pnpm install --frozen-lockfile --silent', { cwd: dir, env, timeout: 600 });
  fs.writeFileSync(path.join(dir, 'test', 'snap.test.js'), `test('لقطة ناقصة', () => { expect({ a: 1, b: 'عربي' }).toMatchSnapshot(); });\ntest('لقطة مضمّنة ناقصة', () => { expect('قيمة').toMatchInlineSnapshot(); });\n`);
  fs.mkdirSync(path.join(dir, 'test', '__snapshots__'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'test', '__snapshots__', 'obsolete.test.js.snap'), `// Jest Snapshot v1, https://goo.gl/fbAQLP\n\nexports[\`قديم 1\`] = \`"x"\`;\n`);
  const flags = '--json --outputFile=$R/jest.json';
  await runCase('jest', dir, 'افتراضي (بلا --ci، بلا CI)', `pnpm exec jest ${flags}`);
  await runCase('jest', dir, '--ci (C-15)', `pnpm exec jest --ci ${flags}`);
  await runCase('jest', dir, 'CI=1 بلا --ci (مقارنة)', `pnpm exec jest ${flags}`, { CI: '1' });
  rmrf(base);
}

// ── Playwright 1.64.0 ──
{
  const { base, root } = await materialize('FX-ADAPTERS', 'good', 'ayar-e12');
  const dir = path.join(root, 'playwright');
  await run('pnpm install --frozen-lockfile --silent', { cwd: dir, env, timeout: 600 });
  fs.writeFileSync(path.join(dir, 'tests', 'snap.spec.js'), `import { test, expect } from '@playwright/test';\ntest('لقطة شاشة ناقصة', async ({ page }) => { await page.setContent('<h1 dir="rtl">عِيَار</h1>'); await expect(page).toHaveScreenshot('home.png'); });\ntest('لقطة نصية ناقصة', async () => { expect('نص').toMatchSnapshot('t.txt'); });\n`);
  const flags = '--reporter=list,json --output=$R/pw-out';
  const pwEnv = { PLAYWRIGHT_JSON_OUTPUT_FILE: '$R/playwright.json' };
  await runCase('playwright', dir, 'افتراضي (بلا أعلام، بلا CI)', `pnpm exec playwright test ${flags}`, pwEnv);
  await runCase('playwright', dir, '--update-snapshots=none (C-15)', `pnpm exec playwright test ${flags} --update-snapshots=none`, pwEnv);
  await runCase('playwright', dir, 'CI=1 بلا أعلام (مقارنة)', `pnpm exec playwright test ${flags}`, { ...pwEnv, CI: '1' });
  await runCase('playwright', dir, '--update-snapshots=missing (مقارنة: يكتب الناقص)', `pnpm exec playwright test ${flags} --update-snapshots=missing`, pwEnv);
  rmrf(base);
}

writeJson(path.join(results, 'run.json'), out);
console.log(`\nكُتب ${path.join(results, 'run.json')}`);
