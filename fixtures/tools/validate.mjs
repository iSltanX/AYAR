#!/usr/bin/env node
// يتحقق من كل ملفات التوقع fixture-expect/1 في fixtures/ (DEV-1، المهمة 1).
//
//   node fixtures/tools/validate.mjs            # كل المشاريع
//   node fixtures/tools/validate.mjs FX-EXT     # مشروع واحد
//
// ما يتحقق منه:
//   1. مطابقة الملف لمخطط fixture-expect/1 (مدقق مخطط مصغر مضمَّن، بلا تبعيات).
//   2. اتساق: اسم المشروع والنسخة، وقاعدة null تستلزم rule_pending، ومنشأ الإخفاق.
//   3. كل نسخة معلنة في project.json لها مجلد وvariant.json وexpected.json، وكل مجلد معلن.
//   4. كل موضع (location) حقيقي: الملف موجود في النسخة المركّبة، والسطر يحوي المرساة.
// يخرج بـ 0 عند النجاح، و1 عند أي مخالفة.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FIXTURES_ROOT, readJson, loadProject, resolveFiles, materialize } from './materialize.mjs';

const schema = readJson(path.join(FIXTURES_ROOT, 'schema', 'fixture-expect-1.schema.json'));
const errors = [];
let checked = 0;

// ── مدقق مخطط مصغر: يكفي المجموعة المستعملة في fixture-expect/1 ──
function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}
function matchesType(v, t) {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}
function resolveRef(ref) {
  return ref.replace(/^#\//, '').split('/').reduce((o, k) => o[k], schema);
}
function check(value, sch, where, out) {
  if (sch.$ref) return check(value, resolveRef(sch.$ref), where, out);
  if (sch.oneOf) {
    const ok = sch.oneOf.filter((s) => { const e = []; check(value, s, where, e); return e.length === 0; });
    if (ok.length !== 1) out.push(`${where}: لا يطابق بديلًا واحدًا بالضبط من oneOf`);
    return;
  }
  if (sch.const !== undefined && value !== sch.const) out.push(`${where}: يجب أن يساوي ${JSON.stringify(sch.const)}`);
  if (sch.type) {
    const types = Array.isArray(sch.type) ? sch.type : [sch.type];
    if (!types.some((t) => matchesType(value, t))) { out.push(`${where}: النوع ${typeOf(value)} لا يطابق ${types.join('|')}`); return; }
  }
  if (sch.enum && !sch.enum.some((e) => e === value)) out.push(`${where}: القيمة ${JSON.stringify(value)} خارج القيم المسموحة`);
  if (typeof value === 'string') {
    if (sch.minLength && value.length < sch.minLength) out.push(`${where}: أقصر من ${sch.minLength}`);
    if (sch.pattern && !new RegExp(sch.pattern, 'u').test(value)) out.push(`${where}: لا يطابق النمط ${sch.pattern}`);
  }
  if (typeof value === 'number' && sch.minimum !== undefined && value < sch.minimum) out.push(`${where}: أقل من ${sch.minimum}`);
  if (Array.isArray(value) && sch.items) value.forEach((v, i) => check(v, sch.items, `${where}[${i}]`, out));
  if (typeOf(value) === 'object') {
    for (const k of sch.required ?? []) if (!(k in value)) out.push(`${where}: الحقل المطلوب «${k}» غائب`);
    const props = sch.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) check(v, props[k], `${where}.${k}`, out);
      else if (sch.additionalProperties === false) out.push(`${where}: حقل غير معرّف «${k}»`);
    }
  }
}

function fail(msg) { errors.push(msg); }

function validateExpected(id, variant, expectedPath, tree, role) {
  const where = `${id}/${variant}`;
  let doc;
  try { doc = readJson(expectedPath); } catch (e) { fail(`${where}: تعذرت قراءة expected.json (${e.message})`); return; }
  const out = [];
  check(doc, schema, where, out);
  out.forEach(fail);
  if (out.length) return;
  checked++;
  if (doc.project !== id) fail(`${where}: project=${doc.project} لا يطابق ${id}`);
  if (doc.variant !== variant) fail(`${where}: variant=${doc.variant} لا يطابق ${variant}`);
  const isClean = role === 'clean';
  doc.expectations.forEach((e, i) => {
    const w = `${where}.expectations[${i}] (${e.check})`;
    if (e.rule === null && e.rule_pending !== true) fail(`${w}: القاعدة null تستلزم rule_pending: true (ORG-06)`);
    if (e.rule !== null && e.rule_pending === true) fail(`${w}: rule_pending مع قاعدة معرّفة`);
    if (['أخفق', 'تعذّر'].includes(e.result) && !e.origin) fail(`${w}: النتيجة ${e.result} تستلزم origin (المشروع أو الأداة)`);
    if (['أخفق', 'تحذير', 'متذبذب'].includes(e.result) && e.confidence === null && !e.reason) fail(`${w}: ${e.result} بلا درجة ثبوت ولا سبب مكتوب`);
    if (['اجتاز', 'غير منطبق', 'غير مضمّن', 'ناقص', 'ناقص إعداد'].includes(e.result) && e.confidence !== null && !(e.result === 'اجتاز' && e.confidence === 'اقتراح تحسين')) fail(`${w}: ${e.result} لا تحمل درجة ثبوت (عدا ملاحظة «اقتراح تحسين» على اجتاز)`);
    if (isClean && !['اجتاز', 'غير منطبق', 'غير مضمّن', 'ناقص إعداد', 'ناقص'].includes(e.result)) fail(`${w}: النسخة السليمة لا يجوز أن تتوقع ${e.result}`);
    if (e.location && tree) {
      const src = tree.get(e.location.path);
      if (!src) { fail(`${w}: الموضع ${e.location.path} غير موجود في النسخة المركّبة`); return; }
      if (e.location.anchor || e.location.line) {
        const text = fs.readFileSync(src, 'utf8');
        const lines = text.split('\n');
        if (e.location.line && e.location.line > lines.length) fail(`${w}: السطر ${e.location.line} بعد نهاية ${e.location.path}`);
        else if (e.location.anchor) {
          const hay = e.location.line ? lines[e.location.line - 1] : text;
          if (!hay.includes(e.location.anchor)) fail(`${w}: المرساة «${e.location.anchor}» ليست في ${e.location.path}${e.location.line ? `:${e.location.line}` : ''}`);
        }
      }
    }
  });
  if (role === 'defect' && !doc.expectations.some((e) => !['اجتاز', 'غير منطبق', 'غير مضمّن'].includes(e.result)) && !(doc.pending ?? []).length) {
    fail(`${where}: نسخة معيبة بلا أي توقع غير «اجتاز» وبلا pending`);
  }
}

function validateProject(id) {
  const { dir, meta } = loadProject(id);
  for (const k of ['id', 'title', 'description', 'kind', 'variants']) if (!(k in meta)) fail(`${id}/project.json: الحقل «${k}» غائب`);
  if (meta.id !== id) fail(`${id}/project.json: id=${meta.id}`);
  if (!['overlay', 'generated'].includes(meta.kind)) fail(`${id}/project.json: kind غير معروف`);
  const declared = Object.keys(meta.variants ?? {});
  const vroot = path.join(dir, 'variants');
  const onDisk = fs.existsSync(vroot) ? fs.readdirSync(vroot).filter((n) => fs.statSync(path.join(vroot, n)).isDirectory()) : [];
  const names = meta.kind === 'overlay' ? ['good', ...declared.filter((v) => v !== 'good')] : declared;
  for (const v of declared) if (v !== 'good' && !onDisk.includes(v)) fail(`${id}: النسخة المعلنة ${v} بلا مجلد`);
  for (const v of onDisk) if (!declared.includes(v)) fail(`${id}: مجلد النسخة ${v} غير معلن في project.json`);
  if (meta.kind === 'overlay' && !declared.includes('good')) fail(`${id}: النسخة السليمة good غير معلنة`);

  let genTree = null;
  const roles = {};
  for (const v of names) {
    const vdir = path.join(vroot, v);
    const expected = path.join(vdir, 'expected.json');
    if (!fs.existsSync(expected)) { fail(`${id}/${v}: expected.json غائب`); continue; }
    if (v !== 'good' || fs.existsSync(path.join(vdir, 'variant.json'))) {
      if (!fs.existsSync(path.join(vdir, 'variant.json'))) fail(`${id}/${v}: variant.json غائب`);
      else {
        const vm = readJson(path.join(vdir, 'variant.json'));
        for (const k of ['name', 'description']) if (!vm[k]) fail(`${id}/${v}/variant.json: «${k}» غائب`);
        if (vm.name !== v) fail(`${id}/${v}/variant.json: name=${vm.name}`);
        const role = vm.role ?? (v === 'good' ? 'clean' : 'defect');
        if (!['defect', 'fix', 'clean', 'neutral'].includes(role)) fail(`${id}/${v}/variant.json: role غير معروف`);
        if (role === 'defect' && v !== 'good' && !(vm.defects?.length)) fail(`${id}/${v}/variant.json: النسخة المعيبة تعلن defects`);
        if (vm.derived_from && vm.derived_from !== 'good' && !declared.includes(vm.derived_from)) fail(`${id}/${v}/variant.json: derived_from=${vm.derived_from} غير معلنة`);
        roles[v] = role;
      }
    }
    let tree;
    if (meta.kind === 'overlay') tree = resolveFiles(id, v);
    else {
      if (!genTree) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ayar-fx-validate-'));
        const dest = path.join(tmp, 'out');
        materialize(id, v, dest);
        genTree = new Map();
        (function w(rel = '') {
          for (const e of fs.readdirSync(path.join(dest, rel), { withFileTypes: true })) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isSymbolicLink()) continue;
            if (e.isDirectory()) { if (e.name !== '.git') w(r); } else genTree.set(r, path.join(dest, r));
          }
        })();
      }
      tree = genTree;
    }
    validateExpected(id, v, expected, tree, roles[v] ?? (v === 'good' ? 'clean' : 'defect'));
  }
}

const only = process.argv[2];
const ids = fs.readdirSync(FIXTURES_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^FX-/.test(e.name) && fs.existsSync(path.join(FIXTURES_ROOT, e.name, 'project.json')))
  .map((e) => e.name)
  .filter((n) => !only || n === only);
if (only && ids.length === 0) { console.error(`مشروع غير معروف: ${only}`); process.exit(2); }
for (const id of ids) {
  try { validateProject(id); } catch (e) { fail(`${id}: ${e.message}`); }
}
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  console.error(`\nأخفق التحقق: ${errors.length} مخالفة في ${ids.length} مشروع`);
  process.exit(1);
}
console.log(`نجح التحقق: ${checked} ملف توقع في ${ids.length} مشروع`);
