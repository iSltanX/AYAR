#!/usr/bin/env node
// فاحص مستقل لإثبات العيوب المزروعة في FX-WEB-DESIGN (DEV-1، المهمة 10). ليس جزءًا من عِيَار.
//   node fixtures/tools/web-design-check.mjs static <جذر-المشروع>
//   node fixtures/tools/web-design-check.mjs render <جذر-المشروع>
//
// static: لون حرفي خارج الرموز، ومسافة خارج السلم، وvar() لرمز غير معرّف، و@font-face لملف مفقود، ومضيف خارجي.
// render: يشغّل الخادم ويفتح كل حالة معلنة (design/states.json) × الثيمين × اللغتين × الحجمين مع محاكاة الشبكة، فيتحقق من
//         التوقعات والخطوط المحمّلة والقيم المحسوبة مقابل الرموز، ويشغّل axe للتباين، ويحصي اللقطات (دون الحالة الحساسة)،
//         ويمنع كل طلب خارج المضيف المحلي ويسجله.
// يعتمد على playwright-core وaxe-core من صندوق الأدوات (fixtures/tools/toolchain.json).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const [mode, rootArg] = process.argv.slice(2);
const root = path.resolve(rootArg ?? '.');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const config = JSON.parse(read('design/design.config.json'));
const tokensCss = read('styles/tokens.css');

function lines(text) { return text.split('\n'); }
function* eachLine(file) { for (const [i, l] of lines(read(file)).entries()) yield [i + 1, l]; }

if (mode === 'static') {
  let total = 0;
  const report = (kind, file, line, detail) => { total++; console.log(`${kind} ${file}:${line} ${detail}`); };
  const tokenColors = new Set([...tokensCss.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()));
  const definedVars = new Set();
  const cssFiles = ['styles/tokens.css', 'styles/app.css'];
  for (const f of cssFiles) for (const m of read(f).matchAll(/(--[\w-]+)\s*:/g)) definedVars.add(m[1]);
  const scale = new Set(config.spacing_scale_px);
  const scanFiles = ['styles/app.css', 'index.html', ...fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.js')).map((f) => `src/${f}`)];
  for (const f of scanFiles) {
    for (const [n, l] of eachLine(f)) {
      for (const m of l.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) {
        if (!tokenColors.has(m[0].toLowerCase())) report('HARDCODED_COLOR', f, n, m[0]);
        else report('HARDCODED_COLOR', f, n, `${m[0]} (قيمة رمز مكتوبة حرفيًّا)`);
      }
      if (f.endsWith('.css')) {
        const prop = l.match(/^\s*(margin[\w-]*|padding[\w-]*|gap|row-gap|column-gap|inset[\w-]*|top|right|bottom|left)\s*:\s*([^;]+);/);
        if (prop) for (const v of prop[2].matchAll(/(-?\d*\.?\d+)px\b/g)) if (!scale.has(Math.abs(Number(v[1])))) report('OFF_SCALE_SPACING', f, n, `${prop[1]}: ${v[0]}`);
      }
      for (const m of l.matchAll(/var\((--[\w-]+)/g)) if (!definedVars.has(m[1])) report('UNDEFINED_VAR', f, n, m[1]);
      for (const m of l.matchAll(/https?:\/\/[^\s"')]+/g)) if (!/127\.0\.0\.1|localhost/.test(m[0])) report('EXTERNAL_HOST', f, n, m[0]);
    }
  }
  const app = read('styles/app.css');
  for (const m of app.matchAll(/src:\s*url\('([^']+)'\)/g)) {
    const target = path.resolve(root, 'styles', m[1]);
    if (!fs.existsSync(target)) report('FONT_FACE_MISSING', 'styles/app.css', lines(app.slice(0, m.index)).length, m[1]);
  }
  console.log(`STATIC_TOTAL ${total}`);
  process.exit(0);
}

if (mode !== 'render') { console.error('mode: static | render'); process.exit(2); }

const home = process.env.AYAR_FX_HOME ?? path.join(os.homedir(), '.cache', 'ayar-fixtures-toolchain');
const require = createRequire(path.join(home, 'node', 'package.json'));
const { chromium } = require('playwright-core');
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

// منفذ حرّ يختاره الفاحص ثم يُمرَّر إلى server.mjs
const port = await new Promise((resolve) => { const s = http.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const srv = spawn(process.execPath, ['server.mjs', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => srv.stdout.once('data', resolve));
const base = `http://127.0.0.1:${port}`;

const states = JSON.parse(read('design/states.json')).states;
const tokenValues = { colors: new Set(), px: new Set() };
for (const m of tokensCss.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
  const n = parseInt(m[1], 16);
  tokenValues.colors.add(`rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`);
}
for (const m of tokensCss.matchAll(/(\d+)px/g)) tokenValues.px.add(`${m[1]}px`);
tokenValues.px.add('0px');

const browser = await chromium.launch({ channel: 'chromium' });
const blocked = new Set();
let shots = 0;
let sensitiveSkipped = 0;
let problems = 0;
const out = (s) => console.log(s);

for (const state of states) {
  for (const theme of config.themes) {
    for (const lang of config.languages) {
      for (const vp of config.viewports) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await ctx.newPage();
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.hostname !== '127.0.0.1') { blocked.add(`${route.request().method()} ${url.origin}${url.pathname}`); await route.abort('blockedbyclient'); return; }
          const mock = state.mock?.[url.pathname];
          if (mock) {
            if (mock.delay_ms) await new Promise((r) => setTimeout(r, Math.min(mock.delay_ms, 1500)));
            const body = mock.body_file ? fs.readFileSync(path.join(root, mock.body_file), 'utf8') : JSON.stringify(mock.body ?? {});
            await route.fulfill({ status: mock.status, contentType: 'application/json', body });
            return;
          }
          await route.continue();
        });
        const sep = state.url.includes('?') ? '&' : '?';
        await page.goto(`${base}${state.url}${sep}lang=${lang}&theme=${theme}`, { waitUntil: 'domcontentloaded' });
        let status = 'ok';
        try {
          await page.waitForSelector(state.expect.selector, { timeout: 4000 });
          const wanted = state.expect.text?.[lang];
          if (wanted && !(await page.getByText(wanted, { exact: false }).first().isVisible().catch(() => false))) status = 'MISSING_TEXT';
        } catch { status = 'MISSING_SELECTOR'; }
        if (status !== 'ok') problems++;
        out(`STATE ${state.id} ${theme} ${lang} ${vp.name} ${status}`);
        if (state.sensitive) sensitiveSkipped++; else shots++;
        if (state.id === 'default' && vp.name === 'desktop') {
          // الخطوط المحمّلة
          const fonts = await page.evaluate(async () => { await document.fonts.load('16px Cairo', 'مرحبا').catch(() => {}); await document.fonts.ready.catch(() => {}); return [...document.fonts].map((f) => `${f.family}:${f.status}`); });
          const arLoaded = await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Cairo' && /U\+0*600-0*6FF/i.test(f.unicodeRange) && f.status === 'loaded'));
          out(`FONTS ${theme} ${lang} arabic_cairo_loaded=${arLoaded} faces=${fonts.join(',')}`);
          // القيم المحسوبة مقابل الرموز
          const sample = await page.evaluate(() => {
            const sels = ['body', '.app-header', '.btn', '.item', '.item-meta', '.status'];
            return sels.flatMap((s) => { const el = document.querySelector(s); if (!el) return []; const cs = getComputedStyle(el);
              return [['color', cs.color], ['background-color', cs.backgroundColor], ['padding-top', cs.paddingTop], ['padding-left', cs.paddingLeft], ['border-top-left-radius', cs.borderTopLeftRadius]].map(([p, v]) => [s, p, v]); });
          });
          for (const [s, p, v] of sample) {
            const isColor = p === 'color' || p === 'background-color';
            if (isColor && v.startsWith('rgba(0, 0, 0, 0)')) continue;
            const ok = isColor ? tokenValues.colors.has(v) : tokenValues.px.has(v);
            if (!ok) { problems++; out(`RENDER_OFF_TOKEN ${theme} ${lang} ${s} ${p} ${v}`); }
          }
          // التباين والاتجاه
          await page.addScriptTag({ content: axeSource });
          const violations = await page.evaluate(async () => { const r = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } }); return r.violations.map((v) => ({ n: v.nodes.length, t: v.nodes[0].target.join(' '), m: v.nodes[0].any[0]?.message.slice(0, 110) })); });
          for (const v of violations) { problems++; out(`AXE color-contrast ${theme} ${lang} ${v.n} ${v.t} — ${v.m}`); }
          const dir = await page.evaluate(() => `${document.documentElement.dir}/${getComputedStyle(document.documentElement).direction}`);
          out(`DIR ${theme} ${lang} ${dir}`);
        }
        await ctx.close();
      }
    }
  }
}
for (const b of [...blocked].sort()) out(`BLOCKED_EXTERNAL ${b}`);
out(`SHOTS ${shots} SENSITIVE_SKIPPED ${sensitiveSkipped}`);
out(`RENDER_PROBLEMS ${problems}`);
await browser.close();
srv.kill();
