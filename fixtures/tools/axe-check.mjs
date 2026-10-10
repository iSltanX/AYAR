#!/usr/bin/env node
// يشغّل axe-core (4.14.0) على صفحة ويطبع المخالفات (DEV-1، المهمة 10). يعتمد على playwright-core وaxe-core
// المثبتين في صندوق الأدوات (fixtures/tools/toolchain.json، المجلد node/).
//
//   node fixtures/tools/axe-check.mjs --ext <مجلد-إضافة-مبنية> --page popup.html     # صفحة داخل الإضافة
//   node fixtures/tools/axe-check.mjs --url file:///.../index.html [--rules color-contrast]
//   خيارات: --width 1280 --height 800 --lang ar --wait-text <نص ينتظره قبل الفحص>
// الخرج: سطر «DIR» لاتجاه الجذر (السمة، واللغة، والاتجاه المحسوب)، ثم سطر لكل مخالفة «AXE <قاعدة> <الأثر> <العدد> <مؤشر أول عنصر>»، ثم «AXE_TOTAL n». يخرج بـ 0 دائمًا (الحكم للمستدعي).

import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const home = process.env.AYAR_FX_HOME ?? path.join(os.homedir(), '.cache', 'ayar-fixtures-toolchain');
const require = createRequire(path.join(home, 'node', 'package.json'));
const { chromium } = require('playwright-core');
const axePath = require.resolve('axe-core/axe.min.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]] : acc), []));
const rules = args.rules ? String(args.rules).split(',') : null;
const viewport = { width: Number(args.width ?? 1280), height: Number(args.height ?? 800) };

let context;
let url = args.url;
if (args.ext) {
  const ext = path.resolve(args.ext);
  context = await chromium.launchPersistentContext('', { channel: 'chromium', viewport, bypassCSP: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker', { timeout: 10000 });
  url = `chrome-extension://${new URL(worker.url()).host}/${args.page ?? 'popup.html'}`;
} else {
  const browser = await chromium.launch({ channel: 'chromium' });
  context = await browser.newContext({ viewport });
}
const page = await context.newPage();
await page.goto(url);
if (args['wait-text']) await page.getByText(String(args['wait-text'])).first().waitFor();
const dir = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('dir'), lang: document.documentElement.lang, computed: getComputedStyle(document.documentElement).direction }));
console.log(`DIR attr=${dir.attr} lang=${dir.lang} computed=${dir.computed}`);
await page.addScriptTag({ path: axePath });
const result = await page.evaluate(async (ruleIds) => {
  // eslint-disable-next-line no-undef
  const r = await axe.run(document, ruleIds ? { runOnly: { type: 'rule', values: ruleIds } } : {});
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, target: v.nodes[0].target.join(' '), summary: (v.nodes[0].any[0]?.message ?? '').slice(0, 160) }));
}, rules);
for (const v of result) console.log(`AXE ${v.id} ${v.impact} ${v.count} ${v.target} — ${v.summary}`);
console.log(`AXE_TOTAL ${result.length}`);
await context.close();
void fs;
