#!/usr/bin/env node
// يولّد صفحة المراحل والموجات من مصادرها الوحيدة، أينما شُغّل داخل المستودع:
// - المعتمد من الفرع main: واجهات ملفات المراحل، وجدول الموجات (docs/waves/README.md)،
//   وجدول قرارات المالك، وسجل التقدم، ووسوم الإغلاق.
// - الحي من فروع phase/<ID> ومجلدات العمل: حالة كل مرحلة جارية أو مسلَّمة، ونظافة مجلدها.
// يقرأ من Git فقط، ومخرجه الوحيد ملف الصفحة (مستثنى من Git). لا تبعيات خارجية.
//
// الاستخدام:
//   /opt/homebrew/bin/node tools/dashboard/build.mjs            يولّد docs/dashboard/ayar-phases.html
//   /opt/homebrew/bin/node tools/dashboard/build.mjs --check    يتحقق من المصادر دون كتابة
//   خيارات: --ref <فرع المصادر، main افتراضيًا>  --out <مسار المخرج>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) {
    console.error(`الخيار ${name} يحتاج قيمة.`);
    process.exit(2);
  }
  return value;
};
const checkOnly = args.includes('--check');
const REF = opt('--ref', 'main');
const here = dirname(fileURLToPath(import.meta.url));

// كل أوامر Git من جذر المستودع، لأن مسارات ls-tree نسبية إلى المجلد الحالي
const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8' }).trim();
function git(gitArgs, cwd = top) {
  try {
    return execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
const show = (ref, path) => git(['show', `${ref}:${path}`]);
// العدد والمعدود بالعربية: 1، و2، و3–10 جمع، و11 فما فوق مفرد
const countAr = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n % 100 >= 3 && n % 100 <= 10 ? `${n} ${few}` : `${n} ${many}`);

// المجلد الأصلي ومجلدات العمل
const worktrees = (git(['worktree', 'list', '--porcelain']) ?? '')
  .split('\n\n')
  .filter(Boolean)
  .map((b) => ({ path: b.match(/^worktree (.*)$/m)?.[1], branch: b.match(/^branch refs\/heads\/(.*)$/m)?.[1] ?? null }));
const primary = worktrees[0]?.path;
if (!primary) {
  console.error('تعذّر تحديد المستودع: شغّل المولّد من داخل مستودع عِيَار.');
  process.exit(1);
}
const wtBase = join(dirname(primary), `${primary.split('/').pop()}-wt`);
const out = resolve(opt('--out', join(top, 'docs', 'dashboard', 'ayar-phases.html')));

const LIST_KEYS = new Set(['depends_on', 'design_gates', 'owner_gates', 'owner_inputs', 'start', 'outputs', 'scope']);
const REQUIRED = ['id', 'track', 'number', 'stage', 'title', 'status', 'status_date', 'goal'];
const STATUSES = new Set(['not-started', 'in-progress', 'awaiting-owner', 'blocked', 'delivered', 'closed']);
const STAGES = {
  design: 'مسار التصميم',
  verification: 'التحقق السابق للبناء ومشاريع الاختبار',
  engine: 'المحرك دون واجهة',
  interface: 'الواجهة من التصميم المعتمد',
  release: 'الإصدار',
};
const errors = [];
const warnings = [];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseFrontMatter(text, file) {
  const match = text?.match(/^---\n([\s\S]*?)\n---\n/);
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
      if (value.startsWith('[')) data[key] = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      else if (value === '') {
        data[key] = [];
        listKey = key;
      } else errors.push(`${file}: المفتاح ${key} يجب أن يكون قائمة`);
    } else {
      data[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  for (const key of LIST_KEYS) data[key] ??= [];
  return data;
}

function readPhases(ref) {
  const phases = [];
  for (const track of ['design', 'dev']) {
    const names = (git(['ls-tree', '--name-only', ref, `docs/phases/${track}/`]) ?? '').split('\n').filter((n) => n.endsWith('.md'));
    for (const file of names.sort()) {
      const p = parseFrontMatter(show(ref, file), file);
      if (!p) continue;
      for (const key of REQUIRED) if (!p[key]) errors.push(`${file}: الحقل ${key} ناقص`);
      if (p.status && !STATUSES.has(p.status)) errors.push(`${file}: حالة غير معروفة: ${p.status}`);
      if (p.stage && !STAGES[p.stage]) errors.push(`${file}: مجموعة عرض غير معروفة: ${p.stage}`);
      if (p.status_date && !ISO_DATE.test(p.status_date)) errors.push(`${file}: status_date ليس بصيغة YYYY-MM-DD: ${p.status_date}`);
      p.number = Number(p.number);
      p.file = file;
      phases.push(p);
    }
  }
  return phases;
}

function readOwnerDecisions(text) {
  const block = text?.match(/<!-- owner-decisions:start -->([\s\S]*?)<!-- owner-decisions:end -->/);
  if (!block) return null;
  const decisions = {};
  for (const line of block[1].split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 6 || !/^[A-Z]{1,3}-\d+$/.test(cells[0])) continue;
    const [id, question, recommendation, neededIn, status, answer] = cells;
    decisions[id] = { id, question, recommendation, neededIn, resolved: status === 'محسوم', answer };
  }
  return decisions;
}

function readWaves(text) {
  const block = text?.match(/<!-- waves:start -->([\s\S]*?)<!-- waves:end -->/);
  if (!block) {
    errors.push('docs/waves/README.md: جدول الموجات غير موجود بين علامتيه');
    return [];
  }
  const waves = [];
  for (const line of block[1].split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 5 || !/^\d+$/.test(cells[0])) continue;
    const [num, phasesCell, starts, closes, mergeOwner] = cells;
    waves.push({ number: Number(num), phaseIds: phasesCell.match(/(?:DEV|DES)-\d+/g) ?? [], starts, closes, mergeOwner });
  }
  return waves;
}

// المصادر المعتمدة
if (!git(['rev-parse', '--verify', '--quiet', REF])) {
  console.error(`الفرع ${REF} غير موجود.`);
  process.exit(1);
}
const phases = readPhases(REF);
const waves = readWaves(show(REF, 'docs/waves/README.md'));
const decisions = readOwnerDecisions(show(REF, 'docs/tracking/decisions.md')) ?? {};
if (!Object.keys(decisions).length) errors.push('docs/tracking/decisions.md: جدول قرارات المالك غير موجود بين علامتيه');
const blockersText = show(REF, 'docs/tracking/blockers.md') ?? '';
const openBlockers = (blockersText.split('## العوائق المحلولة')[0].split('## العوائق المفتوحة')[1] ?? '');
const blockedOnMain = new Set([...openBlockers.matchAll(/المرحلة:\s*((?:DEV|DES)-\d+)/g)].map((m) => m[1]));
const byId = new Map(phases.map((p) => [p.id, p]));
const tags = new Set((git(['tag', '-l', '*-closed']) ?? '').split('\n').filter(Boolean));

for (const p of phases) {
  for (const ref of [...p.depends_on, ...p.design_gates]) if (!byId.has(ref)) errors.push(`${p.file}: يشير إلى مرحلة غير موجودة: ${ref}`);
  for (const ref of [...p.owner_gates, ...p.owner_inputs]) if (!decisions[ref]) errors.push(`${p.file}: قرار المالك ${ref} غير موجود في decisions.md`);
}
const inWaves = waves.flatMap((w) => w.phaseIds);
for (const id of inWaves) if (!byId.has(id)) errors.push(`docs/waves/README.md: مرحلة غير موجودة: ${id}`);
for (const p of phases) {
  const count = inWaves.filter((x) => x === p.id).length;
  if (count !== 1) errors.push(`docs/waves/README.md: المرحلة ${p.id} مذكورة ${count} مرة في جدول الموجات، والمطلوب مرة واحدة`);
}
for (const w of waves) {
  for (const id of w.phaseIds) {
    const p = byId.get(id);
    for (const dep of [...(p?.depends_on ?? []), ...(p?.design_gates ?? [])]) {
      const depWave = waves.find((x) => x.phaseIds.includes(dep))?.number;
      if (depWave !== undefined && depWave >= w.number) errors.push(`docs/waves/README.md: ${id} في الموجة ${w.number} تعتمد على ${dep} في الموجة ${depWave}`);
    }
  }
}
if (byId.size !== phases.length) errors.push('معرّفات المراحل غير فريدة');
if (errors.length) {
  console.error('فشل التحقق من مصادر صفحة المراحل:\n- ' + errors.join('\n- '));
  process.exit(1);
}

// الحالة الحية من الفروع ومجلدات العمل
function live(p) {
  const branch = `phase/${p.id}`;
  const wt = worktrees.find((w) => w.branch === branch);
  if (!git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) return { branch, exists: false, worktree: wt?.path ?? null };
  const branchPhase = parseFrontMatter(show(branch, p.file), `${branch}:${p.file}`);
  return {
    branch,
    exists: true,
    worktree: wt?.path ?? null,
    ahead: Number(git(['rev-list', '--count', `${REF}..${branch}`]) ?? 0),
    behind: Number(git(['rev-list', '--count', `${branch}..${REF}`]) ?? 0),
    dirty: wt ? (git(['--no-optional-locks', '-C', wt.path, 'status', '--porcelain']) ?? '') !== '' : false,
    handoff: git(['cat-file', '-e', `${branch}:docs/handoffs/${p.id}.md`]) !== null,
    status: branchPhase?.status,
    statusDate: (() => {
      const d = branchPhase?.status_date;
      if (d && !ISO_DATE.test(d)) warnings.push(`${branch}: status_date ليس بصيغة YYYY-MM-DD (${d})، فاستُخدم تاريخ main`);
      return d && ISO_DATE.test(d) ? d : undefined;
    })(),
  };
}

// المغلقة حقًا: حالتها closed على main ولها وسم الإغلاق (AGENTS.md 3.1، البند 4)
const isClosed = (id) => byId.get(id)?.status === 'closed' && tags.has(`${id}-closed`);
const view = phases.map((p) => {
  const l = live(p);
  const waitingDeps = p.depends_on.filter((id) => !isClosed(id));
  const waitingDesign = p.design_gates.filter((id) => !isClosed(id));
  const waitingOwner = p.owner_gates.filter((id) => !decisions[id]?.resolved);
  // مجلد جُهّز ولم يبدأ فيه عمل، ثم تقدم main: تحدّثه جلسة التنسيق قبل فتح جلسته
  const stale = l.exists && l.ahead === 0 && !l.dirty && (l.status ?? 'not-started') === 'not-started' && l.behind > 0;
  let state;
  let statusDate = p.status_date;
  if (p.status === 'closed') state = isClosed(p.id) ? 'closed' : 'unverified';
  else if (l.exists && !stale) {
    statusDate = l.statusDate ?? statusDate;
    if ((l.status === 'delivered' || l.status === 'closed') && blockedOnMain.has(p.id)) state = 'blocked';
    else if (l.status === 'delivered' || l.status === 'closed') state = 'delivered';
    else if (['in-progress', 'awaiting-owner', 'blocked'].includes(l.status)) state = l.status;
    else state = l.ahead > 0 || l.dirty ? 'in-progress' : 'prepared';
  } else if (!waitingDeps.length && !waitingDesign.length && !waitingOwner.length) state = 'available';
  else if (!waitingDeps.length && !waitingDesign.length) state = 'needs-decision';
  else if (!waitingDeps.length) state = 'needs-design';
  else state = 'waiting';
  return {
    id: p.id,
    track: p.track,
    number: p.number,
    stage: p.stage,
    wave: waves.find((w) => w.phaseIds.includes(p.id))?.number ?? null,
    title: p.title,
    goal: p.goal,
    start: p.start,
    outputs: p.outputs,
    scope: p.scope,
    model: p.model || '',
    effort: p.effort || '',
    modelReason: p.model_reason || '',
    state,
    statusDate,
    dependsOn: p.depends_on,
    designGates: p.design_gates,
    ownerGates: p.owner_gates,
    ownerInputs: p.owner_inputs,
    waitingDeps,
    waitingDesign,
    waitingOwner,
    openInputs: p.owner_inputs.filter((id) => !decisions[id]?.resolved),
    branch: l.branch,
    folder: l.worktree ?? `${wtBase}/${p.id}`,
    folderExists: Boolean(l.worktree),
    stale,
    returned: blockedOnMain.has(p.id),
    unmerged: p.status === 'closed' && l.exists ? l.ahead : 0,
    ahead: l.ahead ?? 0,
    dirty: Boolean(l.dirty),
    handoff: Boolean(l.handoff),
    command: p.track === 'dev' ? `ابدأ مرحلة التطوير ${p.number}` : `ابدأ مرحلة التصميم ${p.number}`,
    resume: p.track === 'dev' ? `تابع مرحلة التطوير ${p.number}` : `تابع مرحلة التصميم ${p.number}`,
    setup: l.exists
      ? `git -C ${primary} worktree add ${wtBase}/${p.id} phase/${p.id}`
      : `git -C ${primary} worktree add ${wtBase}/${p.id} -b phase/${p.id} ${REF}`,
    file: p.file,
    closingCommit: p.closing_commit || '',
  };
});
const viewById = new Map(view.map((v) => [v.id, v]));

// ما يصير متاحًا حين يُدمج ما سُلّم
const closedOrDelivered = (id) => ['closed', 'delivered'].includes(viewById.get(id)?.state);
for (const v of view) {
  v.unlockedByMerge =
    ['waiting', 'needs-design'].includes(v.state) &&
    [...v.dependsOn, ...v.designGates].every(closedOrDelivered) &&
    [...v.waitingDeps, ...v.waitingDesign].some((id) => viewById.get(id).state === 'delivered');
}

const ACTIVE = ['in-progress', 'awaiting-owner', 'blocked', 'prepared', 'delivered', 'unverified'];
const waveView = waves.map((w) => {
  const items = w.phaseIds.map((id) => viewById.get(id));
  let state;
  if (items.every((v) => v.state === 'closed')) state = 'closed';
  else if (items.some((v) => ACTIVE.includes(v.state))) state = 'active';
  else if (items.some((v) => ['available', 'needs-decision'].includes(v.state) || v.unlockedByMerge)) state = 'ready';
  else state = 'waiting';
  return { ...w, state, command: `ابدأ الموجة ${w.number}` };
});

// الخطوة التالية للمالك
const actions = [];
const prepared = view.filter((v) => v.state === 'prepared');
if (prepared.length) actions.push({ kind: 'open', ids: prepared.map((v) => v.id) });
const toPrepare = view.filter((v) => ['available', 'needs-decision'].includes(v.state) || v.unlockedByMerge);
const toMerge = view.filter((v) => ['delivered', 'unverified'].includes(v.state));
if (toPrepare.length || toMerge.length) {
  const lastWave = Math.max(...waves.map((w) => w.number));
  const wave = toPrepare.length
    ? Math.min(...toPrepare.map((v) => v.wave))
    : Math.min(Math.max(...toMerge.map((v) => v.wave)) + 1, lastWave);
  actions.push({ kind: 'wave', wave, command: `ابدأ الموجة ${wave}`, merges: toMerge.map((v) => v.id), prepares: toPrepare.filter((v) => v.wave <= wave).map((v) => v.id) });
}
const withOwner = view.filter((v) => ['awaiting-owner', 'blocked'].includes(v.state));
if (withOwner.length) actions.push({ kind: 'owner', ids: withOwner.map((v) => v.id) });

const openDecisions = Object.values(decisions)
  .filter((d) => !d.resolved)
  .map((d) => ({
    ...d,
    gates: view.filter((v) => v.ownerGates.includes(d.id) || v.ownerInputs.includes(d.id)).map((v) => ({ id: v.id, beforeStart: v.ownerGates.includes(d.id) })),
  }));

const progressDates = [...(show(REF, 'docs/tracking/progress.md') ?? '').matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]);
const dates = [...view.map((v) => v.statusDate), ...progressDates].filter(Boolean).sort();
const data = {
  updated: dates.at(-1),
  generatedAt: new Date().toISOString(),
  ref: REF,
  commit: git(['rev-parse', '--short', REF]),
  coordinator: {
    path: primary,
    branch: worktrees[0].branch,
    onRef: worktrees[0].branch === REF,
    clean: (git(['--no-optional-locks', '-C', primary, 'status', '--porcelain']) ?? '') === '',
  },
  stages: STAGES,
  waves: waveView,
  phases: view,
  actions,
  openDecisions,
  links: {
    repo: 'https://github.com/iSltanX/AYAR',
    figma: 'https://www.figma.com/design/UXkPakdqRuHDVTs78DO4uC/AYAR',
  },
};

for (const w of warnings) console.error(`تنبيه: ${w}`);
if (checkOnly) {
  console.log(`المصادر سليمة: ${countAr(view.length, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة')} في ${countAr(waves.length, 'موجة واحدة', 'موجتين', 'موجات', 'موجة')}، و${countAr(openDecisions.length, 'قرار واحد', 'قراران', 'قرارات', 'قرارًا')} تنتظر المالك.`);
  process.exit(0);
}

const template = readFileSync(join(here, 'template.html'), 'utf8');
if (!template.includes('/*__AYAR_DATA__*/null')) {
  console.error('القالب لا يحتوي علامة البيانات /*__AYAR_DATA__*/null');
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
const json = JSON.stringify(data).replace(/</g, '\\u003c');
writeFileSync(out, template.replace('/*__AYAR_DATA__*/null', () => json));
console.log(`كُتبت الصفحة: ${out} (${countAr(view.length, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة')}، و${countAr(waves.length, 'موجة واحدة', 'موجتان', 'موجات', 'موجة')}، من ${REF} ${data.commit}).`);
