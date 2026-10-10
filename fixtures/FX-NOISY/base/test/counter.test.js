import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { formatSummary, recordRun } from '../src/counter.js';

const root = new URL('../', import.meta.url);

// الاختبار ينجح دائمًا، لكنه يترك آثارًا في المستودع (المقصود من FX-NOISY):
//   data/runs.json  ← ملف متتبع يتعدّل
//   .cache/last-run.json و reports/summary.txt ← ملفات جديدة غير متتبعة
test('يسجل التشغيل ويترك آثارًا جانبية', () => {
  const data = recordRun(root, new Date('2026-01-01T00:00:00Z'));
  assert.equal(typeof data.runs, 'number');
  fs.mkdirSync(new URL('.cache/', root), { recursive: true });
  fs.writeFileSync(new URL('.cache/last-run.json', root), JSON.stringify(data));
  fs.writeFileSync(new URL('reports/summary.txt', root), `${formatSummary(data)}\n`);
});

test('صياغة الملخص', () => {
  assert.equal(formatSummary({ runs: 3, last: 'x' }), 'runs=3 last=x');
});
