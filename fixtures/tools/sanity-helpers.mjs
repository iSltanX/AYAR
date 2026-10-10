#!/usr/bin/env node
// يشغّل اختبارات المساعدات (tools/) ويسجل نتائجها في fixtures/sanity-results/helpers.json بالصيغة نفسها لبقية المشاريع،
// فيظهر قسمها في SANITY.md (DEV-1، المهمتان 7 و9).
//   node fixtures/tools/sanity-helpers.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolPath } from './toolpath.mjs';

const tools = path.dirname(fileURLToPath(import.meta.url));
const results = path.join(tools, '..', 'sanity-results');
const node = process.execPath;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ayar-fx-helpers-'));
const env = { ...process.env, PATH: toolPath(), CI: '1' };
let bad = 0;
const rec = {};
function run(group, id, args, proves, { match = [], exit = 0 } = {}) {
  const r = spawnSync(node, args, { encoding: 'utf8', env, timeout: 600000 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const problems = [];
  if (r.status !== exit) problems.push(`رمز الخروج ${r.status} بدل ${exit}`);
  for (const m of match) if (!new RegExp(m, 'mu').test(out)) problems.push(`لم يظهر في الخرج: ${m}`);
  const ok = problems.length === 0;
  if (!ok) bad++;
  const clean = out.replace(/\u001b\[[0-9;]*m/g, '').trim();
  (rec[group] ??= []).push({ id, cmd: `node ${args.map((a) => a.replace(path.dirname(tools), 'fixtures')).join(' ').replace(tools, 'fixtures/tools')}`, ok, code: r.status, proves, problems, excerpt: clean.length > 1500 ? `${clean.slice(0, 700)}\n… [اقتُطع] …\n${clean.slice(-700)}` : clean, evidence: true });
  console.log(`${ok ? '✓' : '✗'} ${group}/${id}${ok ? '' : ` — ${problems.join('; ')}`}`);
}

run('validate', 'validate-all', [path.join(tools, 'validate.mjs')], 'كل ملفات fixture-expect/1 صالحة المخطط ومواضعها حقيقية', { match: ['نجح التحقق'] });
run('tool-server', 'test', [path.join(tools, 'tool-server', 'test.mjs')], 'AT-35: الخادم يقدّم ملفًا بصمته لا تطابق الكتالوج، وتاريخ تحقق أقدم من 180 يومًا، وضابط سلبي --honest', { match: ['نجحت فحوص خادم الأداة المعدّلة'] });
run('synth-repo', 'test', [path.join(tools, 'synth-repo', 'test.mjs')], 'AT-36: مولّد حتمي بأعداد دقيقة (1000 و10000)', { match: ['نجحت فحوص مولّد المستودعات الاصطناعية'] });
const big = path.join(tmp, 'large');
run('synth-repo', 'large-50000', [path.join(tools, 'synth-repo', 'generate.mjs'), '--preset', 'large', '--out', big], 'AT-36: المستوى الأكبر 50000 ملف يُولَّد (الزمن والحجم أدناه)', { match: ['"files":50000'] });
const du = spawnSync('du', ['-sk', big], { encoding: 'utf8' }).stdout.split('\t')[0];
(rec['synth-repo'].at(-1)).excerpt += `\ndu -sk: ${du} KiB على القرص`;
run('malicious', 'generator-test', [path.join(tools, 'malicious', 'test.mjs')], 'D-38: المولّد لا يشغّل git، والفخاخ مكتوبة وفعّالة، والعلامات غائبة', { match: ['نجحت كل فحوص مولّد FX-MALICIOUS'] });

fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(results, { recursive: true });
fs.writeFileSync(path.join(results, 'helpers.json'), `${JSON.stringify({ project: 'المساعدات (fixtures/tools)', date: new Date().toISOString().slice(0, 10), versions: { node: process.version }, variants: rec }, null, 2)}\n`);
process.exit(bad ? 1 : 0);
