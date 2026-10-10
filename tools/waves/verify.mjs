#!/usr/bin/env node
// يتحقق من تسليم مرحلة قبل دمجها (docs/waves/README.md، القسم 6). قراءة فقط: لا يغيّر شيئًا.
//
// الاستخدام (من أي مجلد داخل المستودع):
//   /opt/homebrew/bin/node tools/waves/verify.mjs DEV-3
// يخرج بـ 0 إن كانت جاهزة للدمج، و1 إن أخفق فحص إلزامي، و3 إن كان التسليم سليمًا لمرحلة معطّلة (لا تُدمج).
// والتنبيهات للمراجعة ولا تُفشل.

import { execFileSync } from 'node:child_process';

const id = process.argv[2];
if (!/^(DEV|DES)-\d+$/.test(id ?? '')) {
  console.error('الاستخدام: node tools/waves/verify.mjs <DEV-N | DES-N>');
  process.exit(2);
}
const track = id.startsWith('DEV') ? 'dev' : 'design';
const branch = `phase/${id}`;
const handoffPath = `docs/handoffs/${id}.md`;

// من جذر المستودع، لأن مسارات ls-tree نسبية إلى المجلد الحالي
const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
function git(args, opts = {}) {
  try {
    return execFileSync('git', args, { cwd: top, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim();
  } catch {
    return null;
  }
}

const results = [];
let handoff = null;
const pass = (msg) => results.push(['نجح', msg]);
const fail = (msg) => results.push(['أخفق', msg]);
const warn = (msg) => results.push(['تنبيه', msg]);

function frontMatter(text) {
  const m = text?.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const data = {};
  let listKey = null;
  for (const line of m[1].split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) { data[listKey].push(item[1].trim()); continue; }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const value = kv[2].trim();
    if (value === '') { data[kv[1]] = []; listKey = kv[1]; }
    else if (value.startsWith('[')) { data[kv[1]] = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean); listKey = null; }
    else { data[kv[1]] = value; listKey = null; }
  }
  return data;
}

// 1. الفرع
const tip = git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
if (!tip) {
  fail(`الفرع ${branch} غير موجود`);
  report();
}
pass(`الفرع ${branch} موجود عند ${tip.slice(0, 7)}`);

// 2. ملف المرحلة على الفرع
const phaseFile = (git(['ls-tree', '--name-only', branch, `docs/phases/${track}/`]) ?? '')
  .split('\n')
  .find((p) => new RegExp(`/${id.replace(/(\d+)$/, (n) => (track === 'dev' ? n.padStart(2, '0') : n))}-`).test(p));
const phase = phaseFile ? frontMatter(git(['show', `${branch}:${phaseFile}`])) : null;
if (!phase) fail(`ملف المرحلة غير موجود على الفرع`);

// 3. ملف التسليم
const handoffText = git(['show', `${branch}:${handoffPath}`]);
handoff = frontMatter(handoffText);
if (!handoff) {
  fail(`لا ملف تسليم ${handoffPath} على الفرع، أو واجهته غير صالحة`);
} else {
  pass(`ملف التسليم موجود`);
  if (handoff.id !== id) fail(`المعرّف في ملف التسليم (${handoff.id}) لا يطابق ${id}`);
  if (!['delivered', 'blocked'].includes(handoff.status)) fail(`حالة التسليم «${handoff.status}» ليست delivered ولا blocked`);
  if (phase && phase.status !== handoff.status) fail(`حالة ملف المرحلة (${phase.status}) لا تطابق التسليم (${handoff.status})`);
  else if (phase) pass(`حالة المرحلة على الفرع: ${phase.status}`);

  // 4. آخر commit عمل
  const head = handoff.head && git(['rev-parse', '--verify', '--quiet', `${handoff.head}^{commit}`]);
  if (!head) {
    fail(`الحقل head لا يشير إلى commit موجود`);
  } else if (git(['merge-base', '--is-ancestor', head, tip]) === null) {
    fail(`head ${handoff.head} ليس سلفًا لطرف الفرع`);
  } else {
    const after = (git(['diff', '--name-only', head, tip]) ?? '').split('\n').filter(Boolean);
    const extra = after.filter((p) => p !== handoffPath && p !== phaseFile);
    if (extra.length) fail(`بعد head تغيّرت ملفات غير التسليم وملف المرحلة: ${extra.join('، ')}`);
    else pass(`لا عمل بعد head ${handoff.head.slice(0, 7)} إلا التسليم`);
  }

  // 5. جدول الفحوص
  const tests = handoffText.split('## الفحوص')[1]?.split('\n## ')[0] ?? '';
  const rows = tests.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l) && !/الفحص\s*\|\s*الأمر/.test(l));
  if (!rows.length || rows.every((r) => /\|\s*…\s*\|/.test(r))) fail('جدول الفحوص في التسليم فارغ');
  else pass(`صفوف جدول الفحوص: ${rows.length}`);
  // عمود النتيجة هو الثالث: «نجح» وحدها تقبل التسليم، و«لم يُشغَّل» تنبيه بسببه، وأي قيمة أخرى إخفاق
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    const result = cells[2] ?? '';
    if (handoff.status !== 'delivered' || /^…$/.test(result)) continue;
    if (/^نجح/.test(result)) continue;
    if (/^لم يُ?شغَّ?ل/.test(result)) warn(`فحص لم يُشغَّل: ${cells[0]} (${result})`);
    else fail(`نتيجة فحص ليست «نجح» في تسليم delivered: ${cells[0]} → ${result}`);
  }

  // 6. التنظيف (AGENTS.md القسم 10): قسم معبّأ بجدول أو بسطر «لا شيء» وحده
  const cleanup = handoffText.split('\n## التنظيف')[1]?.split('\n## ')[0];
  if (cleanup === undefined) fail('لا قسم «التنظيف» في التسليم (AGENTS.md القسم 10)');
  else {
    const lines = cleanup.split('\n').map((l) => l.trim());
    const cleanRows = lines.filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l) && !/\|\s*المصير\s*\|/.test(l));
    const filled = cleanRows.filter((r) => !/\|\s*…\s*\|/.test(r));
    if (!filled.length && !lines.some((l) => /^لا شيء\.?$/.test(l))) fail('قسم «التنظيف» في التسليم غير معبّأ');
    else pass(`قسم التنظيف معبّأ (${filled.length ? `البنود: ${filled.length}` : 'لا شيء'})`);
    const later = filled.filter((r) => /يُ?حذف بعد الإغلاق/.test(r)).length;
    const owner = filled.filter((r) => /ينتظر المالك/.test(r)).length;
    if (later) warn(`بنود تحذفها الجلسة الرئيسية بعد الوسم: ${later} (قسم «التنظيف» في التسليم)`);
    if (owner) warn(`بنود تنظيف تنتظر قرار المالك: ${owner}`);
  }

  // 7. اعتماد التصميم
  if (track === 'design') {
    if (!handoff.approval || handoff.approval === '—') fail('مرحلة تصميم دون اعتماد المالك في حقل approval');
    const designDoc = git(['show', `${branch}:docs/design/README.md`]) ?? '';
    const row = designDoc.split('\n').find((l) => l.includes(`${id}]`) || l.includes(`| ${id} `));
    if (!row || !/\d{4}-\d{2}-\d{2}/.test(row)) fail(`لا تاريخ اعتماد لـ ${id} في جدول docs/design/README.md`);
    else pass('الاعتماد مسجل في docs/design/README.md');
  }
}

// 7. الخطة دون تعديل
if (git(['diff', '--quiet', `main...${branch}`, '--', 'docs/plan']) === null) fail('ملفات docs/plan عُدّلت على الفرع');
else pass('الخطة دون تعديل');

// 8. نظافة مجلد العمل
const worktrees = git(['worktree', 'list', '--porcelain']) ?? '';
const wt = worktrees.split('\n\n').find((block) => block.split('\n').includes(`branch refs/heads/${branch}`));
const wtPath = wt?.match(/^worktree (.*)$/m)?.[1];
if (!wtPath) warn('لا مجلد عمل مربوط بالفرع');
else {
  const dirty = git(['--no-optional-locks', '-C', wtPath, 'status', '--porcelain']);
  if (dirty === null) fail(`تعذّرت قراءة حالة مجلد العمل ${wtPath}`);
  else if (dirty) fail(`في مجلد العمل ${wtPath} تغييرات غير ملتزمة`);
  else pass(`مجلد العمل نظيف: ${wtPath}`);
}

// 9. النطاق والملفات المشتركة (تنبيه)
const changed = (git(['diff', '--name-only', `main...${branch}`]) ?? '').split('\n').filter(Boolean);
const scope = Array.isArray(phase?.scope) ? phase.scope : [];
const always = [handoffPath, phaseFile];
if (track === 'design') always.push('docs/design/README.md', `docs/design/approved/${id}/`);
if (['DEV-2', 'DEV-13'].includes(id)) always.push('docs/tracking/env-decisions.md');
const shared = ['docs/tracking/', 'AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/phases/README.md', 'docs/waves/', 'docs/dashboard/'];
const inside = (p, list) => list.some((s) => s && (s.endsWith('/') ? p.startsWith(s) : p === s));
const touchedShared = changed.filter((p) => inside(p, shared) && !inside(p, always));
const outOfScope = changed.filter((p) => !inside(p, [...scope, ...always]) && !inside(p, shared));
if (touchedShared.length) warn(`عُدّلت ملفات مشتركة تملكها الجلسة الرئيسية: ${touchedShared.join('، ')}`);
if (scope.length && outOfScope.length) warn(`ملفات خارج نطاق المرحلة: ${outOfScope.slice(0, 15).join('، ')}${outOfScope.length > 15 ? '…' : ''}`);
if (!scope.length) warn('لا حقل scope في ملف المرحلة، فلم يُفحص النطاق');
pass(`الملفات المتغيرة منذ التفرع من main: ${changed.length}`);

const behind = git(['rev-list', '--count', `${branch}..main`]);
if (behind && behind !== '0') warn(`تقدم main منذ تفرّع الفرع (commits: ${behind})؛ توقع تعارضًا عند الدمج إن التقيا في ملف`);

report();

function report() {
  for (const [kind, msg] of results) console.log(`${kind === 'نجح' ? '✓' : kind === 'تنبيه' ? '!' : '✗'} ${kind}: ${msg}`);
  const failed = results.filter(([k]) => k === 'أخفق').length;
  if (failed) {
    console.log(`\nالنتيجة: ${id} غير جاهزة للدمج (إخفاقات: ${failed}).`);
    process.exit(1);
  }
  if (handoff?.status === 'blocked') {
    // رمز 3: تسليم سليم الصيغة لمرحلة معطّلة. تنقل الجلسة الرئيسية عوائقها إلى blockers.md ولا يدمجها
    console.log(`\nالنتيجة: ${id} معطّلة. لا تُدمج: انقل عوائقها إلى docs/tracking/blockers.md وأبلغ المالك.`);
    process.exit(3);
  }
  console.log(`\nالنتيجة: ${id} جاهزة للدمج.`);
  process.exit(0);
}
