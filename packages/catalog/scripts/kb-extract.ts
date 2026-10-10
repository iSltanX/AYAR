// kb/1 from plan 28 (C-08 point 4): the knowledge base is transcribed from the plan's text, never retyped. This
// module parses section 28 of docs/plan/AYAR-plan-3-engine.md into the data files of packages/catalog/data/kb,
// applying only the corrections the plan lists and the G-37 decisions of DEV-8 (each one named below). The test
// kb-plan.test.ts runs the same parser and compares its output with the committed files, so the data cannot drift
// from the plan unnoticed (no knowledge lost, plan 4.2). Run `node scripts/kb-extract.ts --write` to regenerate.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PLAN_FILE = fileURLToPath(new URL('../../../docs/plan/AYAR-plan-3-engine.md', import.meta.url));
export const KB_DIR = fileURLToPath(new URL('../data/kb/', import.meta.url));
/** The date the archive was verified by the plan's author (28.9: «بتاريخ تحققه (أكتوبر 2026)»). */
export const KB_VERIFIED_AT = '2026-10-09';

// ---------------------------------------------------------------------------------------------- markdown helpers

function fail(msg: string): never {
  throw new Error(`kb-extract: ${msg}`);
}

/** The text of `### 28.N` up to the next `### ` heading. */
function section(plan: string, num: string): string[] {
  const lines = plan.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`### ${num} `));
  if (start < 0) fail(`section ${num} not found`);
  let end = lines.findIndex((l, i) => i > start && (l.startsWith('### ') || l.startsWith('## ')));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end);
}

/** Splits a table row on unescaped pipes, unescaping `\|` inside cells. */
function cells(row: string): string[] {
  const inner = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** Every table in a block of lines: rows after the header and its separator. */
function tables(lines: string[]): string[][][] {
  const out: string[][][] = [];
  let cur: string[][] | null = null;
  let headerSeen = 0;
  for (const l of lines) {
    if (l.trim().startsWith('|')) {
      if (!cur) {
        cur = [];
        headerSeen = 0;
      }
      headerSeen++;
      if (headerSeen <= 2) continue; // header row and |---| separator
      cur.push(cells(l));
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const unCode = (s: string) => {
  const m = /^`([^`]*)`$/.exec(s.trim());
  return m ? m[1]! : s.trim();
};
const dash = (s: string) => (s.trim() === '—' ? null : s.trim());

/** `**name** (`id`)` → { name, id }. */
function boldWithId(s: string): { name: string; id: string } {
  const m = /^\*\*(.+?)\*\* \(`([a-z0-9_]+)`\)$/.exec(s.trim());
  if (!m) fail(`expected «**name** (\`id\`)»: ${s}`);
  return { name: m[1]!, id: m[2]! };
}

/** A markdown link cell `[title](url)`. */
function link(s: string): { title: string; url: string } {
  const m = /^\[(.+)\]\((https:\/\/[^)\s]+)\)$/.exec(s.trim());
  if (!m) fail(`expected a link: ${s}`);
  return { title: m[1]!, url: m[2]! };
}

/** `- **A:** x · **B:** y` → { A: x, B: y }. */
function fields(line: string): Record<string, string> {
  const body = line.replace(/^\s*-\s+/, '').trim();
  const out: Record<string, string> = {};
  for (const part of body.split(/\s·\s(?=\*\*)/)) {
    const m = /^\*\*(.+?):\*\*\s*(.*)$/.exec(part.trim());
    if (!m) fail(`expected «**label:** value»: ${part}`);
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}

/** `\`a\`، \`b\`` → ['a', 'b']; `—` → []. */
function codeList(s: string): string[] {
  if (s.trim() === '—') return [];
  return s.split('،').map((x) => unCode(x.trim()));
}

// ---------------------------------------------------------------------------------------------- basis (الأساس)

export const BASIS_LABELS: Record<string, string> = {
  'مبدأ راسخ': 'est',
  'دراسة تجريبية': 'res',
  'حسب السياق': 'ctx',
  'ممارسة جهة': 'opn',
  'توثيق رسمي': 'doc',
  'تركيب الأداة': 'syn',
};
const BASIS_RE = new RegExp(`(${Object.keys(BASIS_LABELS).join('|')}): (.+?) \\(([a-z0-9_]+)\\)(?:؛ |$)`, 'g');

/** «مبدأ راسخ: نص (istqb)؛ تركيب الأداة: نص (null)» → entries. G-37.9: a «(null)» source stays null. */
function basis(s: string): { kind: string; text: string; source: string | null }[] {
  const out: { kind: string; text: string; source: string | null }[] = [];
  let consumed = 0;
  for (const m of s.matchAll(BASIS_RE)) {
    if (m.index !== consumed) fail(`unparsed basis text at ${consumed}: ${s}`);
    consumed = m.index + m[0].length;
    out.push({ kind: BASIS_LABELS[m[1]!]!, text: m[2]!, source: m[3] === 'null' ? null : m[3]! });
  }
  if (consumed !== s.length || !out.length) fail(`unparsed basis: ${s}`);
  return out;
}

/** «ممارسة جهة (fowler_cov)» → { kind, source }. */
function basisRef(s: string): { kind: string; source: string } {
  const m = /^(.+) \(([a-z0-9_]+)\)$/.exec(s.trim());
  const kind = m ? BASIS_LABELS[m[1]!] : undefined;
  if (!m || !kind) fail(`expected «basis (source)»: ${s}`);
  return { kind, source: m[2]! };
}

// ---------------------------------------------------------------------------------------------- 28.1 inputs

function inputs(plan: string) {
  const [rows] = tables(section(plan, '28.1'));
  if (!rows) fail('28.1: no table');
  return rows.map((r) => {
    const [id, group, type, basic, question, values] = r as [string, string, string, string, string, string];
    const t = /^(single|multi|bool|text)( \(إلزامي\))?$/.exec(type);
    if (!t) fail(`28.1: type ${type}`);
    const vals =
      values === '—'
        ? []
        : values.split(/،\s*(?=`)/).map((v) => {
            const m = /^`([^`]+)` (.+)$/.exec(v.trim());
            if (!m) fail(`28.1: value ${v}`);
            return { id: /^\d+$/.test(m[1]!) ? Number(m[1]) : m[1]!, label: m[2]!.trim() };
          });
    return { id: unCode(id), group, type: t[1]!, required: t[2] !== undefined, basic: basic === 'نعم', question, values: vals };
  });
}

// ---------------------------------------------------------------------------------------------- 28.2 OMIT

/**
 * The archive's reasons for «غير الموصى به» (28.2-و). The plan replaces them with reasons composed from the
 * actual inputs (correction «أسباب غير الموصى به»; G-37.2). Each archive text is kept as `archiveReason` for
 * the record, and split by hand (D-DEV8-03) into the claim about the inputs, which the advisor composes from
 * the real values, and the advice that does not depend on them (`hint`), which is shown as is.
 */
const OMIT_HINTS: Record<string, string[]> = {
  e2e_critical: [
    'الاختبارات الأدنى تعطي الدليل نفسه بكلفة وتقلب أقل. يصبح ضروريًا إن ارتفعت العاقبة أو كان هذا تحضيرًا لإصدار.',
    'الاختبارات الأدنى تعطي الدليل نفسه بكلفة وتقلب أقل. يصبح ضروريًا إن مسّ التغيير مسار مستخدم حرجًا أو كان هذا تحضيرًا لإصدار.',
  ],
  regression_full: ['الانحدار الموجّه يكفي. أعد النظر إن فشل اختبار بعيد أو اكتشفت مستدعين لم تعرفهم.', 'أعد النظر إن فشل اختبار بعيد أو اكتشفت مستدعين لم تعرفهم.'],
  perf_budget: ['القياس دون سؤال محدد لا يغيّر قرارًا.'],
  load_test: ['يُقترح للخوادم ذات الجمهور العام حين يمس التغيير الأداء.'],
  security_authz: ['إن كان يضيف طريقًا جديدًا إلى بيانات المستخدم فحدد «الدخول والصلاحيات».'],
  a11y_check: ['يصبح الفحص لازمًا حين يتسع الجمهور.'],
  migration_rehearsal: ['اختبار التكامل عند التخزين يكفي.'],
  exploratory_session: ['جلسة الاستكشاف تضيف قليلًا هنا مقارنة بكلفتها.'],
  characterization: ['أدلتك الحالية تؤدي دور شبكة الأمان.'],
};

function omit(plan: string) {
  const [rows] = tables(section(plan, '28.2'));
  if (!rows) fail('28.2: no OMIT table');
  return rows.map((r) => {
    const [item, condition, reason] = r as [string, string, string];
    const id = unCode(item);
    const hints = OMIT_HINTS[id];
    if (!hints) fail(`28.2: no hint for ${id}`);
    return { item: id, archiveCondition: unCode(condition), archiveReason: unCode(reason), hints };
  });
}

// ---------------------------------------------------------------------------------------------- 28.3 rules

function rules(plan: string) {
  const [rows] = tables(section(plan, '28.3'));
  if (!rows) fail('28.3: no table');
  return rows.map((r) => {
    const [id, description, condition, adds, reason] = r as [string, string, string, string, string];
    const raw = adds.trim();
    let weights: Record<string, number> | null = null;
    let expression: string | null = null;
    let items: string[];
    if (raw.startsWith('`e =>') || raw.startsWith('`(e')) {
      expression = unCode(raw);
      items = [...new Set([...expression.matchAll(/([a-z][a-z0-9_]*)\s*:\s*(?=\d|e\.)/g)].map((m) => m[1]!))];
    } else {
      weights = {};
      for (const m of raw.matchAll(/`([a-z0-9_]+)`: (\d+)/g)) weights[m[1]!] = Number(m[2]);
      items = Object.keys(weights);
    }
    if (!items.length) fail(`28.3: ${id} adds nothing`);
    const rule = {
      id,
      kind: id.startsWith('D') ? 'depth' : 'input',
      description,
      archiveCondition: unCode(condition),
      adds: { items, weights, expression },
      reason,
      replacedBy: null as null | { rule: string; description: string },
    };
    // Correction «قاعدة R16» (28 intro, G-37.1): R16 is replaced by C-20 rule 5. The archive text stays for the
    // record; the advisor implements the replacement (packages/engine/src/advisor/rules.ts).
    if (id === 'R16') {
      rule.replacedBy = {
        rule: 'C-20.5',
        description: 'بيانات دائمة مع ترحيل مكتشف أو معلن، أو مع عاقبة 3 فأعلى وتراجع صعب، أيًّا كان الموقف بما فيه إصلاح الخلل',
      };
    }
    return rule;
  });
}

// ---------------------------------------------------------------------------------------------- 28.4 items

function steps(lines: string[], from: number): string[] {
  const out: string[] = [];
  for (let i = from; i < lines.length; i++) {
    const m = /^\s+1\. (.+)$/.exec(lines[i]!);
    if (!m) break;
    out.push(m[1]!);
  }
  return out;
}

/** The `#### \`id\` — title` blocks of a section, with their bullet lines. */
function blocks(lines: string[]): { id: string; title: string; lines: string[] }[] {
  const out: { id: string; title: string; lines: string[] }[] = [];
  for (const l of lines) {
    const h = /^#### `([a-z0-9_]+)` — (.+)$/.exec(l);
    if (h) out.push({ id: h[1]!, title: h[2]!, lines: [] });
    else if (out.length) out[out.length - 1]!.lines.push(l);
  }
  return out;
}

function bulletFields(lines: string[]): { f: Record<string, string>; stepsAt: number } {
  const f: Record<string, string> = {};
  let stepsAt = -1;
  lines.forEach((l, i) => {
    if (!/^- \*\*/.test(l)) return;
    Object.assign(f, fields(l));
    if (l.startsWith('- **الخطوات:**')) stepsAt = i + 1;
  });
  return { f, stepsAt };
}

function need(f: Record<string, string>, k: string, where: string): string {
  const v = f[k];
  if (v === undefined) fail(`${where}: missing «${k}»`);
  return v;
}

function items(plan: string) {
  return blocks(section(plan, '28.4')).map((b) => {
    const { f, stepsAt } = bulletFields(b.lines);
    const where = `28.4 ${b.id}`;
    const m = /^(.+) \(`([a-z0-9_]+)`\)$/.exec(need(f, 'المنهج', where));
    if (!m) fail(`${where}: method`);
    return {
      id: b.id,
      title: b.title,
      method: m[2]!,
      methodLabel: m[1]!,
      stage: need(f, 'المرحلة', where),
      effort: Number(need(f, 'الجهد', where)),
      mode: need(f, 'النمط', where),
      toolCategories: codeList(need(f, 'فئات الأدوات', where)),
      proves: need(f, 'ما يُثبت', where),
      why: need(f, 'لماذا', where),
      whyMethod: need(f, 'لماذا هذا المنهج', where),
      timing: need(f, 'التوقيت', where),
      repeat: need(f, 'التكرار', where),
      requirement: need(f, 'المتطلب', where),
      steps: stepsAt < 0 ? fail(`${where}: no steps`) : steps(b.lines, stepsAt),
      evaluate: need(f, 'التقييم', where),
      expand: need(f, 'التوسيع', where),
      limits: need(f, 'الحدود', where),
      basis: basis(need(f, 'الأساس', where)),
    };
  });
}

// ---------------------------------------------------------------------------------------------- 28.5 methods

function methods(plan: string) {
  const lines = section(plan, '28.5');
  const [famRows] = tables(lines);
  if (!famRows) fail('28.5: no family table');
  const families = famRows.map((r) => {
    const { name, id } = boldWithId(r[0]!);
    return { id, name, question: r[1]!, note: r[2]! };
  });
  const famId = (name: string) => families.find((x) => x.name === name)?.id ?? fail(`28.5: family ${name}`);
  const list = blocks(lines).map((b) => {
    const { f } = bulletFields(b.lines);
    const where = `28.5 ${b.id}`;
    const [name, nameEn] = b.title.split(' · ') as [string, string | undefined];
    if (!nameEn) fail(`${where}: English name`);
    return {
      id: b.id,
      name,
      nameEn,
      family: famId(need(f, 'العائلة', where)),
      effort: Number(need(f, 'الجهد', where)),
      automation: need(f, 'آلي أم يدوي', where),
      addedBecause: f['أُضيف إلى الأرشيف لأن'] ?? null,
      purpose: need(f, 'الغرض', where),
      fits: need(f, 'يلائم', where),
      notFits: need(f, 'لا يلائم', where),
      needs: need(f, 'يحتاج', where),
      reading: need(f, 'كيف تُقرأ نتيجته', where),
      mistakes: need(f, 'أخطاء شائعة', where),
      example: need(f, 'مثال', where),
      basis: basis(need(f, 'الأساس', where)),
    };
  });
  return { families, methods: list };
}

// ---------------------------------------------------------------------------------------------- 28.6 lifecycle

function lifecycle(plan: string, depthByName: (name: string) => string) {
  const lines = section(plan, '28.6');
  const [phaseRows, effectRows] = tables(lines);
  if (!phaseRows || !effectRows) fail('28.6: tables');
  const phases = phaseRows.map((r) => {
    const { name, id } = boldWithId(r[0]!);
    return { id, name, tests: r[1]!, notNow: r[2]!, depth: depthByName(r[3]!), expandWhen: r[4]! };
  });
  const line = (prefix: string) => {
    const l = lines.find((x) => x.startsWith(prefix));
    if (!l) fail(`28.6: ${prefix}`);
    return l.slice(prefix.length).trim();
  };
  const comprehensive = {
    definition: line('**تعريف الاختبار الشامل:**'),
    scope: line('- **نطاقه:**'),
    triggers: line('- **محفزاته:**'),
    completion: line('- **معايير اكتماله:**'),
    remains: line('- **ما يبقى بعده:**'),
  };
  const signals = effectRows.map((r) => ({ name: r[0]!, meaning: r[1]!, basis: basisRef(r[2]!) }));
  const covStart = lines.findIndex((l) => l.startsWith('**حدود التغطية'));
  const coverage: { text: string; basis: { kind: string; source: string } }[] = [];
  for (let i = covStart + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.trim() === '') {
      if (coverage.length) break;
      continue;
    }
    const m = /^- (.+) — (.+)$/.exec(l);
    if (!m) fail(`28.6 coverage: ${l}`);
    coverage.push({ text: m[1]!, basis: basisRef(m[2]!) });
  }
  const maintenanceRaw = JSON.parse(line('**maintenance:**')) as { d: string; k: string; s: string }[];
  const maintenance = maintenanceRaw.map((x) => ({ text: x.d, basis: { kind: x.k, source: x.s } }));
  const manualAuto = JSON.parse(line('**manualAuto:**')) as unknown;
  const shapes = JSON.parse(line('**shapes:**')) as string;
  return { phases, comprehensive, effect: { signals, coverage }, maintenance, manualAuto, shapes };
}

// ---------------------------------------------------------------------------------------------- 28.7 depths

function depths(plan: string) {
  const lines = section(plan, '28.7');
  const [depthRows, prioRows] = tables(lines);
  if (!depthRows || !prioRows) fail('28.7: tables');
  const levelsLine = lines.find((l) => l.startsWith('المستويات:'));
  if (!levelsLine) fail('28.7: levels');
  const levels = [...levelsLine.matchAll(/`([a-z]+)` ([^،.]+)/g)].map((m, i) => ({ id: m[1]!, name: m[2]!.trim(), index: i }));
  return {
    depths: depthRows.map((r) => ({ id: unCode(r[0]!), name: r[1]!, rank: Number(r[2]), description: r[3]!, completion: r[4]! })),
    priorities: prioRows.map((r) => ({ value: Number(r[0]), name: r[1]!, meaning: r[2]! })),
    levels,
  };
}

// ---------------------------------------------------------------------------------------------- 28.8 presets

function presets(plan: string) {
  const [rows] = tables(section(plan, '28.8'));
  if (!rows) fail('28.8: table');
  return rows.map((r) => {
    const { name, id } = boldWithId(r[0]!);
    return { id, name, inputs: JSON.parse(r[1]!) as Record<string, unknown> };
  });
}

// ---------------------------------------------------------------------------------------------- 28.9 ecosystems and tools

function ecosystemsAndTools(plan: string) {
  const lines = section(plan, '28.9');
  const [ecoRows, toolRows] = tables(lines);
  if (!ecoRows || !toolRows) fail('28.9: tables');
  const ecosystems = ecoRows.map((r) => {
    const m = /^\/(.+)\/([a-z]*)$/.exec(unCode(r[2]!));
    if (!m) fail(`28.9: pattern ${r[2]}`);
    return { id: unCode(r[0]!), name: r[1]!, pattern: m[1]!, flags: m[2]! };
  });
  const catLine = lines.find((l) => l.startsWith('فئات الأدوات:'));
  if (!catLine) fail('28.9: categories');
  const categories = [...catLine.matchAll(/`([a-z0-9]+)` ([^،.]+)/g)].map((m) => ({ id: m[1]!, label: m[2]!.trim(), origin: 'plan' }));
  // G-37.8: the tool table uses `compat` (TestFlight, WordPress and Plasma versions, web-ext run) though the list
  // of categories omits it. It is added to the schema, labelled after the method of the same name (28.5).
  categories.push({ id: 'compat', label: 'التوافق', origin: 'G-37.8' });
  const tools = toolRows.map((r) => {
    const [eco, cat, name, description, cmd, version, ref] = r as [string, string, string, string, string, string, string];
    const command = dash(cmd);
    return {
      ecosystem: unCode(eco),
      category: unCode(cat),
      name,
      description,
      // 4.1 and 28.9: «والأوامر للشرح لا للتشغيل». Commands run only from the adapters (DEV-6).
      exampleCommand: command === null ? null : unCode(command),
      version: dash(version),
      url: link(ref).url,
      verifiedAt: KB_VERIFIED_AT,
    };
  });
  const alertsAt = lines.findIndex((l) => l.includes('وتنبيهات الأدوات بعد التصحيح:'));
  if (alertsAt < 0) fail('28.9: alerts');
  const alerts: string[] = [];
  for (let i = alertsAt + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith('- ')) alerts.push(l.slice(2));
    else if (alerts.length && l.trim() !== '') break;
  }
  return { ecosystems, categories, tools, alerts };
}

// ---------------------------------------------------------------------------------------------- 28.10 and 28.13 sources

/**
 * 28.10 (60 sources) and the Codex sources of 28.13 (11). G-37.9: `istqb_codex` and `wstg_codex` duplicate
 * `istqb` and `wstg` and merge into them (their claim is kept under `merged`), so 60 + 11 - 2 = 69 sources.
 */
const CODEX_MERGE: Record<string, string> = { istqb_codex: 'istqb', wstg_codex: 'wstg' };

function sources(plan: string) {
  const [basisRows, srcRows] = tables(section(plan, '28.10'));
  if (!basisRows || !srcRows) fail('28.10: tables');
  const basisKinds = basisRows.map((r) => {
    const m = /^`([a-z]+)` (.+)$/.exec(r[0]!);
    if (!m) fail(`28.10: basis ${r[0]}`);
    return { id: m[1]!, name: m[2]!, meaning: r[1]! };
  });
  type Src = {
    id: string;
    title: string;
    url: string;
    basis: string | null;
    claim: string;
    origin: 'kb' | 'codex';
    merged: { id: string; title: string; url: string; claim: string }[];
    verifiedAt: string;
  };
  const list: Src[] = srcRows.map((r) => {
    const kind = BASIS_LABELS[r[2]!];
    if (!kind) fail(`28.10: basis label ${r[2]}`);
    const l = link(r[1]!);
    return { id: unCode(r[0]!), title: l.title, url: l.url, basis: kind, claim: r[3]!, origin: 'kb', merged: [], verifiedAt: KB_VERIFIED_AT };
  });
  const codexLines = section(plan, '28.13');
  const codexAt = codexLines.findIndex((l) => l.startsWith('**مصادر Codex غير المكررة**'));
  const [codexRows] = tables(codexLines.slice(codexAt));
  if (!codexRows) fail('28.13: codex sources');
  for (const r of codexRows) {
    const id = unCode(r[0]!);
    const l = link(r[1]!);
    const into = CODEX_MERGE[id];
    if (into) {
      const target = list.find((s) => s.id === into) ?? fail(`28.13: merge target ${into}`);
      target.merged.push({ id, title: l.title, url: l.url, claim: r[2]! });
    } else {
      // The Codex table gives no basis (الأساس) for its sources: null, never guessed.
      list.push({ id, title: l.title, url: l.url, basis: null, claim: r[2]!, origin: 'codex', merged: [], verifiedAt: KB_VERIFIED_AT });
    }
  }
  return { basisKinds, sources: list, codexCount: codexRows.length };
}

// ---------------------------------------------------------------------------------------------- 28.11 terms

function terms(plan: string) {
  const [rows] = tables(section(plan, '28.11'));
  if (!rows) fail('28.11: table');
  return rows.map((r) => ({ id: unCode(r[0]!), ar: r[1]!, en: r[2]!, meaning: r[3]! }));
}

// ---------------------------------------------------------------------------------------------- 28.12–28.14 verification

function verification(plan: string) {
  const [c12] = tables(section(plan, '28.12'));
  if (!c12) fail('28.12: table');
  const archive = c12.map((r) => ({ name: r[0]!, inputs: JSON.parse(unCode(r[1]!)) as Record<string, unknown>, archiveExpectation: unCode(r[2]!) }));

  const l13 = section(plan, '28.13');
  const codexCases = l13.map((l) => /^(\d+)\. (.+)$/.exec(l)).filter((m) => m !== null).map((m) => ({ number: Number(m[1]), name: m[2]! }));
  const [cardRows] = tables(l13);
  if (!cardRows) fail('28.13: cards');
  const styleCards = cardRows.map((r) => {
    const m = /^\*\*(.+?)\*\* \((.+)\)$/.exec(r[0]!);
    if (!m) fail(`28.13: card ${r[0]}`);
    return { name: m[1]!, nameEn: m[2]!, fits: r[1]!, limits: r[2]!, needs: r[3]!, mistakes: r[4]! };
  });

  const l14 = section(plan, '28.14');
  const [s14] = tables(l14);
  if (!s14) fail('28.14: table');
  const scenarios = s14.map((r) => ({ id: unCode(r[0]!), situation: r[1]!, expected: r[2]!, amended: r[2]!.includes('**(معدّل)**') }));
  const jsonAt = l14.findIndex((l) => l.startsWith('```json'));
  const example = {
    inputs: JSON.parse(l14[jsonAt + 1]!) as Record<string, unknown>,
    description: (l14.find((l) => l.startsWith('وصف الحالة الأصلي للتوثيق:')) ?? fail('28.14: description')).slice('وصف الحالة الأصلي للتوثيق:'.length).trim(),
    expectedStructure: (l14.find((l) => l.startsWith('**المتوقع (بنية لا نص حرفي):**')) ?? fail('28.14: structure')).slice('**المتوقع (بنية لا نص حرفي):**'.length).trim(),
  };
  return { archive, codexCases, styleCards, scenarios, example };
}

// ---------------------------------------------------------------------------------------------- assembly

/** Which methods each Codex style card (28.13) merges into (G-37 and 28.13: «يُدمج منها في 28.5 ما ليس فيه»). */
const STYLE_CARD_METHODS: Record<string, string[]> = {
  'Behavior / Unit': ['unit'],
  'Integration / Contract': ['integration', 'contract'],
  'UI / End-to-End': ['e2e'],
  'Exploratory / Review': ['exploratory'],
  'Confirmation / Regression': ['confirmation', 'regression'],
  Acceptance: ['acceptance'],
  Performance: ['performance'],
  Security: ['security'],
  Accessibility: ['accessibility'],
  'Data Integrity / Recovery': ['data'],
  Compatibility: ['compat'],
};

export function extractKb(plan: string) {
  const d = depths(plan);
  const depthByName = (name: string) => d.depths.find((x) => x.name === name)?.id ?? fail(`28.6: depth ${name}`);
  const m = methods(plan);
  const v = verification(plan);
  const s = sources(plan);
  const et = ecosystemsAndTools(plan);
  const meta = { verifiedAt: KB_VERIFIED_AT };
  return {
    'inputs.json': { ...meta, inputs: inputs(plan) },
    'rules.json': { ...meta, rules: rules(plan), omit: omit(plan) },
    'items.json': { ...meta, items: items(plan) },
    'methods.json': {
      ...meta,
      families: m.families,
      methods: m.methods,
      styleCards: v.styleCards.map((c) => ({ ...c, methods: STYLE_CARD_METHODS[c.nameEn] ?? fail(`28.13: card ${c.nameEn}`) })),
    },
    'lifecycle.json': { ...meta, ...lifecycle(plan, depthByName) },
    'depths.json': { ...meta, ...d },
    'presets.json': { ...meta, presets: presets(plan) },
    'ecosystems.json': { ...meta, ecosystems: et.ecosystems, categories: et.categories },
    'tools.json': { ...meta, tools: et.tools, alerts: et.alerts },
    'sources.json': { ...meta, basisKinds: s.basisKinds, sources: s.sources },
    'terms.json': { ...meta, terms: terms(plan) },
    'verification.json': { ...meta, archive: v.archive, codexCases: v.codexCases, scenarios: v.scenarios, example: v.example },
  };
}

export type ExtractedKb = ReturnType<typeof extractKb>;

export function readPlan(): string {
  return readFileSync(PLAN_FILE, 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = extractKb(readPlan());
  const write = process.argv.includes('--write');
  for (const [file, value] of Object.entries(out)) {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    if (write) writeFileSync(`${KB_DIR}${file}`, text);
    process.stdout.write(`${write ? 'wrote' : 'parsed'} ${file} (${text.length} bytes)\n`);
  }
}
