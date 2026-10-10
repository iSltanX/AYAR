#!/usr/bin/env node
// يُنتج نسخة قابلة للاستعمال من مشروع اختبار في مجلد مؤقت (G-09: لا يُعدَّل شيء في مكانه).
//
// الاستخدام:
//   node fixtures/tools/materialize.mjs <FX-X> <النسخة> <المجلد-الهدف>
// الهدف يجب أن يكون غير موجود أو فارغًا. النسخة «good» هي الأساس نفسه. ويطبع جذر المشروع الفعلي
// (قد يكون مجلدًا فرعيًّا من الهدف إن أعلن المشروع install_path).
//
// مشاريع «overlay»: تُنسخ base/ ثم يُركَّب فوقها variants/<النسخة>/overlay/ ثم تُحذف ملفات delete.
// مشاريع «generated» (FX-MALICIOUS): يُشغَّل مولّدها المعلن في project.json بدل النسخ.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const FIXTURES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function projectDir(id) {
  return path.join(FIXTURES_ROOT, id);
}

export function loadProject(id) {
  const dir = projectDir(id);
  const meta = readJson(path.join(dir, 'project.json'));
  return { dir, meta };
}

function walk(root, rel = '', out = new Map()) {
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(root, r, out);
    else out.set(r, path.join(root, r));
  }
  return out;
}

/**
 * خريطة المسار النسبي ← المسار المطلق للمصدر، لنسخة من مشروع overlay.
 * النسخة تشتق من «derived_from» في variant.json (الافتراضي: الأساس base)، وتُطبَّق السلسلة من الجذر.
 */
export function resolveFiles(id, variant, seen = new Set()) {
  const { dir, meta } = loadProject(id);
  if (meta.kind !== 'overlay') throw new Error(`${id} ليس مشروع overlay`);
  if (variant === 'good') return walk(path.join(dir, 'base'));
  if (seen.has(variant)) throw new Error(`دورة اشتقاق في ${id}: ${variant}`);
  seen.add(variant);
  const vdir = path.join(dir, 'variants', variant);
  if (!fs.existsSync(vdir)) throw new Error(`النسخة ${variant} غير موجودة في ${id}`);
  const vmeta = readJson(path.join(vdir, 'variant.json'));
  const files = resolveFiles(id, vmeta.derived_from ?? 'good', seen);
  for (const [rel, abs] of walk(path.join(vdir, 'overlay'))) files.set(rel, abs);
  for (const del of vmeta.delete ?? []) {
    for (const key of [...files.keys()]) if (key === del || key.startsWith(`${del}/`)) files.delete(key);
  }
  return files;
}

/** مسار التركيب النسبي لنسخة (مشاريع مثل FX-PY تُركَّب في مسار عربي بمسافات). الأقرب اشتقاقًا يغلب. */
export function installPath(id, variant, seen = new Set()) {
  const { dir, meta } = loadProject(id);
  if (meta.kind !== 'overlay' || variant === 'good' || seen.has(variant)) return meta.install_path ?? '';
  seen.add(variant);
  const vmeta = readJson(path.join(dir, 'variants', variant, 'variant.json'));
  return vmeta.install_path ?? installPath(id, vmeta.derived_from ?? 'good', seen);
}

/** مولّدات ما بعد التركيب للنسخة وسلسلة اشتقاقها (من الجذر إلى الورقة). */
export function generators(id, variant, seen = new Set()) {
  const { dir, meta } = loadProject(id);
  if (meta.kind !== 'overlay' || variant === 'good' || seen.has(variant)) return [];
  seen.add(variant);
  const vmeta = readJson(path.join(dir, 'variants', variant, 'variant.json'));
  return [...generators(id, vmeta.derived_from ?? 'good', seen), ...(vmeta.generate ?? [])];
}

/** يركّب النسخة تحت dest ويعيد جذر المشروع الفعلي (dest، أو dest/<install_path>). */
export function materialize(id, variant, dest) {
  const { dir, meta } = loadProject(id);
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    throw new Error(`المجلد الهدف غير فارغ: ${dest}`);
  }
  fs.mkdirSync(dest, { recursive: true });
  if (meta.kind === 'generated') {
    const gen = path.join(FIXTURES_ROOT, meta.generator.script);
    const r = spawnSync(process.execPath, [gen, ...(meta.generator.args ?? []), '--out', dest], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`فشل المولّد ${meta.generator.script}`);
    return path.join(dest, meta.install_path ?? '');
  }
  const root = path.join(dest, installPath(id, variant));
  for (const [rel, src] of resolveFiles(id, variant)) {
    const to = path.join(root, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(src, to);
    fs.chmodSync(to, fs.statSync(src).mode & 0o777);
  }
  // مولّدات ما بعد التركيب (مثل تقرير أكبر من الحد يُولَّد وقت الاختبار ولا يُلتزم): variant.json.generate = [مسار سكربت نسبة إلى fixtures/]
  if (variant !== 'good') {
    for (const g of generators(id, variant)) {
      const r = spawnSync(process.execPath, [path.join(FIXTURES_ROOT, g), '--out', root], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`فشل مولّد ما بعد التركيب ${g}`);
    }
  }
  void dir;
  return root;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [id, variant, dest] = process.argv.slice(2);
  if (!id || !variant || !dest) {
    console.error('الاستخدام: node fixtures/tools/materialize.mjs <FX-X> <النسخة> <المجلد-الهدف>');
    process.exit(2);
  }
  try {
    console.log(materialize(id, variant, path.resolve(dest)));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
