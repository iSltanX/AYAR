#!/usr/bin/env node
// يقارن صلاحيات Manifest بسياسة الصلاحيات المكتوبة ويطبع المخالفات (DEV-1، المهمة 10).
// ليس جزءًا من عِيَار: يثبت فقط أن العيب المزروع موجود فعلًا في الملف.
//   node fixtures/tools/ext-policy-check.mjs <manifest.json> <permissions-policy.json>
import fs from 'node:fs';

const [manifestFile, policyFile] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
const wide = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*', 'file:///*']);
let violations = 0;
for (const [field, allowed] of [['permissions', policy.permissions ?? {}], ['host_permissions', policy.host_permissions ?? {}]]) {
  for (const p of manifest[field] ?? []) {
    if (!(p in allowed)) {
      violations++;
      console.log(`POLICY_VIOLATION ${field} ${p}${wide.has(p) ? ' (نطاق واسع)' : ''} غير وارد في السياسة`);
    }
  }
}
console.log(`POLICY_TOTAL ${violations}`);
process.exit(violations ? 1 : 0);
