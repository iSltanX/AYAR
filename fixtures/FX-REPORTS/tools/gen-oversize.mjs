#!/usr/bin/env node
// يولّد تقريرًا أكبر من الحد (50 ميغابايت افتراضيًا، الخطة 10.3 «حماية القراءة») وقت الاختبار، فلا يُلتزم في المستودع.
//   node fixtures/FX-REPORTS/tools/gen-oversize.mjs --out <جذر-المشروع-المركّب>
// يستبدل reports/vitest.json بملف JSON صالح الصياغة حجمه نحو 51 ميغابايت (حقل pad طويل).
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[process.argv.indexOf('--out') + 1];
if (!out) { console.error('--out مطلوب'); process.exit(2); }
const target = path.join(out, 'reports', 'vitest.json');
const head = '{"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"success":true,"testResults":[],"pad":"';
const tail = '"}';
const fd = fs.openSync(target, 'w');
fs.writeSync(fd, head);
const chunk = 'x'.repeat(1024 * 1024);
for (let i = 0; i < 51; i++) fs.writeSync(fd, chunk);
fs.writeSync(fd, tail);
fs.closeSync(fd);
console.log(`كُتب ${target} (${(fs.statSync(target).size / 1048576).toFixed(1)} MiB)`);
