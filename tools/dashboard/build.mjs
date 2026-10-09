#!/usr/bin/env node
// يولّد صفحة المراحل من مصادرها الوحيدة: واجهات ملفات المراحل، وجدول قرارات المالك،
// وآخر قيد في سجل التقدم، ووسوم الإغلاق في Git. لا يحتاج أي تبعية خارجية.
//
// الاستخدام (من جذر المستودع):
//   /opt/homebrew/bin/node tools/dashboard/build.mjs           يولّد الصفحة
//   /opt/homebrew/bin/node tools/dashboard/build.mjs --check   يتحقق من المصادر دون كتابة

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const checkOnly = process.argv.includes('--check');

const LIST_KEYS = new Set(['depends_on', 'design_gates', 'owner_gates', 'owner_inputs', 'start', 'outputs']);
const REQUIRED = ['id', 'track', 'number', 'stage', 'title', 'status', 'status_date', 'goal'];
const STATUSES = new Set(['not-started', 'in-progress', 'awaiting-owner', 'blocked', 'closed']);
const STAGES = {
  design: 'مسار التصميم',
  verification: 'التحقق السابق للبناء ومشاريع الاختبار',
  engine: 'المحرك دون واجهة',
  interface: 'الواجهة من التصميم المعتمد',
  release: 'الإصدار',
};

const errors = [];

function parseFrontMatter(text, file) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    errors.push(`${file}: لا توجد واجهة YAML في أول الملف`);
    return null;
  }
  const data = {};
  let listKey = null;
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item) {
      if (!listKey) errors.push(`${file}: عنصر قائمة دون مفتاح: ${line}`);
      else data[listKey].push(item[1].trim());
      continue;
    }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) {
      errors.push(`${file}: سطر غير مفهوم في الواجهة: ${line}`);
      continue;
    }
    const [, key, raw] = kv;
    const value = raw.trim();
    listKey = null;
    if (LIST_KEYS.has(key)) {
      if (value.startsWith('[')) {
        data[key] = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      } else if (value === '') {
        data[key] = [];
        listKey = key;
      } else {
        errors.push(`${file}: المفتاح ${key} يجب أن يكون قائمة`);
      }
    } else {
      data[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  for (const key of LIST_KEYS) data[key] ??= [];
  for (const key of REQUIRED) if (!data[key]) errors.push(`${file}: الحقل ${key} ناقص`);
  if (data.status && !STATUSES.has(data.status)) errors.push(`${file}: حالة غير معروفة: ${data.status}`);
  if (data.stage && !STAGES[data.stage]) errors.push(`${file}: مرحلة عرض غير معروفة: ${data.stage}`);
  data.number = Number(data.number);
  data.file = file;
  return data;
}

function readPhases() {
  const phases = [];
  for (const track of ['design', 'dev']) {
    const dir = join(root, 'docs', 'phases', track);
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
      const file = `docs/phases/${track}/${name}`;
      const phase = parseFrontMatter(readFileSync(join(root, file), 'utf8'), file);
      if (phase) phases.push(phase);
    }
  }
  return phases;
}

function readOwnerDecisions() {
  const text = readFileSync(join(root, 'docs', 'tracking', 'decisions.md'), 'utf8');
  const block = text.match(/<!-- owner-decisions:start -->([\s\S]*?)<!-- owner-decisions:end -->/);
  if (!block) {
    errors.push('docs/tracking/decisions.md: جدول قرارات المالك غير موجود بين علامتيه');
    return {};
  }
  const decisions = {};
  for (const line of block[1].split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 6 || !/^[A-Z]{1,3}-\d+$/.test(cells[0])) continue;
    const [id, question, recommendation, neededIn, status, answer] = cells;
    decisions[id] = { id, question, recommendation, neededIn, resolved: status === 'محسوم', answer };
  }
  return decisions;
}

function lastProgressDate() {
  const text = readFileSync(join(root, 'docs', 'tracking', 'progress.md'), 'utf8');
  const dates = [...text.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]);
  return dates.sort().at(-1) ?? null;
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const phases = readPhases();
const decisions = readOwnerDecisions();
const byId = new Map(phases.map((p) => [p.id, p]));
const tags = new Set(git(['tag', '-l', '*-closed']).split('\n').filter(Boolean));

for (const p of phases) {
  for (const ref of [...p.depends_on, ...p.design_gates]) {
    if (!byId.has(ref)) errors.push(`${p.file}: يشير إلى مرحلة غير موجودة: ${ref}`);
  }
  for (const ref of [...p.owner_gates, ...p.owner_inputs]) {
    if (!decisions[ref]) errors.push(`${p.file}: قرار المالك ${ref} غير موجود في جدول decisions.md`);
  }
}
if (byId.size !== phases.length) errors.push('معرّفات المراحل غير فريدة');

if (errors.length) {
  console.error('فشل التحقق من مصادر صفحة المراحل:\n- ' + errors.join('\n- '));
  process.exit(1);
}

const isClosed = (id) => byId.get(id)?.status === 'closed';

const view = phases.map((p) => {
  const waitingDeps = p.depends_on.filter((id) => !isClosed(id));
  const waitingDesign = p.design_gates.filter((id) => !isClosed(id));
  const waitingOwner = p.owner_gates.filter((id) => !decisions[id].resolved);
  const openInputs = p.owner_inputs.filter((id) => !decisions[id].resolved);
  let state = p.status;
  if (p.status === 'not-started') {
    if (!waitingDeps.length && !waitingDesign.length && !waitingOwner.length) state = 'available';
    else if (!waitingDeps.length && !waitingDesign.length) state = 'needs-decision';
    else if (!waitingDeps.length) state = 'needs-design';
    else state = 'waiting';
  }
  const tag = `${p.id}-closed`;
  return {
    id: p.id,
    track: p.track,
    number: p.number,
    stage: p.stage,
    title: p.title,
    goal: p.goal,
    start: p.start,
    outputs: p.outputs,
    status: p.status,
    statusDate: p.status_date,
    state,
    dependsOn: p.depends_on,
    designGates: p.design_gates,
    ownerGates: p.owner_gates,
    ownerInputs: p.owner_inputs,
    waitingDeps,
    waitingDesign,
    waitingOwner,
    openInputs,
    command: p.track === 'dev' ? `ابدأ مرحلة التطوير ${p.number}` : `ابدأ مرحلة التصميم ${p.number}`,
    file: p.file,
    closingCommit: p.closing_commit || '',
    unverifiedClose: p.status === 'closed' && !tags.has(tag),
  };
});

const openDecisions = Object.values(decisions)
  .filter((d) => !d.resolved)
  .map((d) => ({
    ...d,
    gates: view.filter((p) => p.ownerGates.includes(d.id) || p.ownerInputs.includes(d.id)).map((p) => ({
      id: p.id,
      beforeStart: p.ownerGates.includes(d.id),
    })),
  }));

const dates = [...phases.map((p) => p.status_date), lastProgressDate()].filter(Boolean).sort();
const data = {
  updated: dates.at(-1),
  commit: git(['rev-parse', '--short', 'HEAD']),
  // صادق في المصدر: إن وُلّدت الصفحة وفي مصادرها تغييرات غير ملتزمة، تقول ذلك
  dirty: git(['status', '--porcelain', '--', 'docs/phases', 'docs/tracking']) !== '',
  stages: STAGES,
  phases: view,
  openDecisions,
  links: {
    repo: 'https://github.com/iSltanX/AYAR',
    figma: 'https://www.figma.com/design/UXkPakdqRuHDVTs78DO4uC/AYAR',
  },
};

if (checkOnly) {
  console.log(`المصادر سليمة: ${view.length} مرحلة، و${openDecisions.length} قرارًا ينتظر المالك.`);
  process.exit(0);
}

const template = readFileSync(join(root, 'tools', 'dashboard', 'template.html'), 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
if (!template.includes('/*__AYAR_DATA__*/null')) {
  console.error('القالب لا يحتوي علامة البيانات /*__AYAR_DATA__*/null');
  process.exit(1);
}
const out = join(root, 'docs', 'dashboard', 'ayar-phases.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, template.replace('/*__AYAR_DATA__*/null', json));
console.log(`كُتبت الصفحة: docs/dashboard/ayar-phases.html (${view.length} مرحلة، آخر تحديث ${data.updated}).`);
