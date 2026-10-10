#!/usr/bin/env node
// فاحص مرجعي لتقارير FX-REPORTS (DEV-1، المهمة 10): يطبق حماية القراءة المذكورة في الخطة 10.3 ويطبع حالة كل تقرير.
//   node fixtures/tools/reports-check.mjs <جذر-المشروع-المركّب>
// الخرج: «CASE <المعرّف> OK» أو «CASE <المعرّف> BAD <السبب>». ليس جزءًا من عِيَار؛ يثبت فقط أن العيب المزروع حقيقي.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.argv[2] ?? '.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'reports', 'manifest.json'), 'utf8'));
const { max_report_bytes: maxBytes, max_json_depth: maxDepth } = manifest.limits;

function depthOf(value) {
  let max = 0;
  const stack = [[value, 1]];
  while (stack.length) {
    const [v, d] = stack.pop();
    if (v && typeof v === 'object') {
      max = Math.max(max, d);
      for (const child of Object.values(v)) stack.push([child, d + 1]);
    }
  }
  return max;
}

for (const c of manifest.cases) {
  const file = path.join(root, c.file);
  const size = fs.statSync(file).size;
  const bad = (reason) => console.log(`CASE ${c.id} BAD ${reason}`);
  if (size > maxBytes) { bad(`report-too-large ${size} > ${maxBytes}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  if (c.format === 'junit-xml') {
    const r = spawnSync('xmllint', ['--noout', '--nonet', file], { encoding: 'utf8' });
    if (r.status !== 0) { bad(`malformed-xml ${(r.stderr || '').split('\n')[0]}`); continue; }
    console.log(`CASE ${c.id} OK`);
    continue;
  }
  let json;
  try { json = JSON.parse(text); } catch (e) { bad(`malformed-json ${e.message.slice(0, 60)}`); continue; }
  const depth = depthOf(json);
  if (depth > maxDepth) { bad(`json-too-deep ${depth} > ${maxDepth}`); continue; }
  if (c.format === 'sarif-2.1.0') {
    const missing = [];
    if (json.version !== '2.1.0') missing.push('version');
    if (!Array.isArray(json.runs) || json.runs.length === 0) missing.push('runs');
    else json.runs.forEach((run, i) => { if (!run?.tool?.driver?.name) missing.push(`runs[${i}].tool.driver.name`); });
    if (missing.length) { bad(`sarif-incomplete missing ${missing.join(',')}`); continue; }
  }
  if (c.format === 'vitest-json' && json.numFailedTests > 0 && c.exit_code === 0) {
    bad(`evidence-conflict exit_code=0 numFailedTests=${json.numFailedTests}`);
    continue;
  }
  console.log(`CASE ${c.id} OK`);
}
