// Task cards (C-20, 12.8, FR-45) and the commands of DEV-8 over the engine (advisor.suggest, task.create,
// tasks.list): the name `{النوع}: {السلوك} — {الموضع}`, the sixteen types, the unknown expected value left to the
// owner (28.14 example: AYAR never invents 199 or 200), the user's text kept literal (`malicious-text`), the
// names a card carries guide it without re-ranking anything (28.13 case 19), and TASK-NNNN per project (D-36).
import { loadCatalog } from '@ayar/catalog';
import { CARD_TYPES, PROTOCOL_VERSION, TaskCard, type AdvisorResult, type TaskRecord } from '@ayar/protocol';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startEngine } from '../src/host/engine.ts';
import { nodePorts } from '../src/node/ports.ts';
import type { HostChannel } from '../src/ports/index.ts';
import { CardSourceError, cardFromAdvisorItem, cardFromCheck, generateCard, renderCard } from '../src/tasks/cards.ts';
import { tempRoot } from './support/tmp.ts';

const { catalog } = loadCatalog(undefined, { now: new Date('2026-10-10T00:00:00Z') });
const kb = catalog.kb;
const example = kb.data.verification.example.inputs;

describe('the card template (12.8)', () => {
  it('knows the sixteen types of 12.8 by their Arabic names, plus the general card of C-20', () => {
    expect(kb.cards.types.map((t) => t.name)).toEqual([
      'اختبار وحدة',
      'اختبار تكامل',
      'اختبار رحلة',
      'اختبار خصائص',
      'اختبار توصيفي',
      'اختبار يعيد إنتاج خلل',
      'مراجعة حالة واجهة',
      'تعريف حالات واجهة',
      'تجهيز فحص',
      'مراجعة صلاحية',
      'مراجعة إتاحة بشرية',
      'جلسة استكشاف',
      'مراجعة إعادة هيكلة',
      'تقوية تأكيدات',
      'فحص نموذج',
      'تحقق إصلاح',
    ]);
    expect([...kb.cards.types.map((t) => t.id), kb.cards.generic.id]).toEqual([...CARD_TYPES]);
  });

  it('builds the unit-test card of the 28.14 example without inventing the expected values', () => {
    const card = cardFromAdvisorItem({ kind: 'advisorItem', itemId: 'unit_logic', context: example }, kb);
    expect(TaskCard.safeParse(card).success).toBe(true);
    expect(card).toMatchObject({ type: 'unit_test', priority: 2, nextStep: 'model', expected: null, verify: ['beh.unit'], noAutomatedCheck: false });
    expect(card.name).toBe('اختبار وحدة: اختبارات وحدة للسلوك المتغيّر — يحدده المالك');
    expect(card.source.ref).toMatch(/^قاعدة مستشار R04 \(item:unit_logic\)$/);
    expect(card.text).toContain('- المتوقع: يحدده المالك قبل كتابة الاختبار');
    expect(card.text).not.toMatch(/\b(199|200|180)\b/);
    expect(card.steps).toEqual(kb.item('unit_logic')!.steps);
    // The 12.8 sections, in order.
    const sections = ['## الاسم', '## لماذا', '## السلوك المطلوب إثباته', '## السياق', '## الخطوات', '## معيار القبول', '## القيود', '## التحقق'];
    const at = sections.map((s) => card.text.indexOf(s));
    expect(at.every((i, n) => i > 0 && (n === 0 || i > at[n - 1]!))).toBe(true);
    expect(card.text.split('\n')[0]).toBe('# بطاقة مهمة من عِيَار — TASK-????');
    expect(card.text).toContain('أعد الفحص في عِيَار: `beh.unit`');
  });

  it('keeps the user\'s words literal: in a code span in the text, unchanged in the fields (28.14 malicious-text)', () => {
    const evil = '<img src=x onerror=window.__xss=1> `x` «معرّف» "q"';
    const card = cardFromAdvisorItem({ kind: 'advisorItem', itemId: 'unit_logic', context: example, behavior: evil, location: 'src/«خصم».ts' }, kb);
    expect(card.subject).toBe(evil);
    expect(card.location).toBe('src/«خصم».ts');
    expect(card.name).toBe(`اختبار وحدة: ${evil} — src/«خصم».ts`);
    expect(card.text).toContain(`اختبار وحدة: \`\`${evil}\`\` — \`src/«خصم».ts\``);
    expect(card.text.replace(/``[^\n]*?``/g, '')).not.toContain('<img');
    expect((JSON.parse(JSON.stringify(card)) as TaskCard).subject).toBe(evil);
  });

  it('28.13 case 19: the names a card carries guide its work and change no priority, type or step', () => {
    const plain = cardFromAdvisorItem({ kind: 'advisorItem', itemId: 'characterization', context: { situation: 'refactor', areas: ['logic'], evidence: 'none' } }, kb);
    const named = cardFromAdvisorItem({ kind: 'advisorItem', itemId: 'characterization', context: { situation: 'refactor', areas: ['logic'], evidence: 'none' }, behavior: 'تصدير CSV للحسابات الحرجة', location: 'src/payments/export.ts' }, kb);
    expect({ ...named, name: '', subject: '', location: null, text: '', behavior: null, userSupplied: null }).toEqual({ ...plain, name: '', subject: '', location: null, text: '', behavior: null, userSupplied: null });
  });

  it('gives an item without a check the general card, flagged «لا فحص آلي مقابل», and refuses items the checks cover', () => {
    const card = cardFromAdvisorItem({ kind: 'advisorItem', itemId: 'risk_inventory', context: { situation: 'new_project' } }, kb);
    expect(card).toMatchObject({ type: 'generic', noAutomatedCheck: true, verify: [], nextStep: 'review' });
    expect(card.text).toContain(kb.cards.template.noCheckLine);
    expect(() => cardFromAdvisorItem({ kind: 'advisorItem', itemId: 'static_gate', context: example }, kb)).toThrow(CardSourceError);
    expect(() => cardFromAdvisorItem({ kind: 'advisorItem', itemId: 'no_such_item', context: example }, kb)).toThrow(/unknown_item/);
  });

  it('turns a check that misses configuration into a setup card, and missing tests into a test card (12.7)', () => {
    const setup = cardFromCheck({ kind: 'check', checkId: 'design.tokens.static', outcome: 'missing_configuration' }, catalog);
    expect(setup).toMatchObject({ type: 'check_setup', nextStep: 'direct', location: 'ملف المعايير', verify: ['design.tokens.static'] });
    expect(setup.name).toMatch(/^تجهيز فحص: أكمل ما ينقص «.+» — ملف المعايير$/);
    expect(setup.steps[0]).toContain('tokens');
    expect(setup.text).toContain('- يزول النقص');
    const tests = generateCard({ kind: 'check', checkId: 'beh.unit', outcome: 'missing_tests', location: 'src/cart.ts' }, catalog);
    expect(tests).toMatchObject({ type: 'unit_test', nextStep: 'model', priority: 1 });
    expect(() => cardFromCheck({ kind: 'check', checkId: 'beh.nothing', outcome: 'missing' }, catalog)).toThrow(/unknown_check/);
  });

  it('never claims a test ran or passed', () => {
    for (const m of kb.data.itemChecks.mappings.filter((x) => x.card !== null)) {
      const card = cardFromAdvisorItem({ kind: 'advisorItem', itemId: m.item, context: { situation: 'release', areas: ['ui', 'data', 'logic'] } }, kb);
      expect(renderCard(card, kb, 'TASK-0001')).not.toMatch(/(تم تنفيذ|نُفِّذ الاختبار|اجتاز|أخفق|نجحت اختبارات)/);
    }
  });
});

// ── over the engine ──────────────────────────────────────────────────────────────────────────────────────────

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempRoot('ayar-DEV-8-tasks-')));
afterEach(() => cleanup());

function harness() {
  const sent: Record<string, unknown>[] = [];
  let deliver: (m: unknown) => void = () => {};
  const channel: HostChannel = { send: (m) => sent.push(structuredClone(m) as Record<string, unknown>), onMessage: (l) => (deliver = l), onClose: () => {} };
  const engine = startEngine({ ports: { ...nodePorts, exit: () => undefined as never }, channel });
  deliver({ kind: 'hello', protocol: { major: PROTOCOL_VERSION.major, minor: 0 }, peer: 'cli', config: { dataDir: join(root, 'AYAR'), hmacKeySource: 'test', appVersion: '0.1.0' } });
  let id = 0;
  const waitFor = async (pred: (m: Record<string, unknown>) => boolean, ms = 20_000) => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = sent.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('timed out');
  };
  const invoke = async (command: string, payload: unknown, grants?: unknown) => {
    const n = ++id;
    deliver({ kind: 'command', id: n, command, payload, ...(grants ? { grants } : {}) });
    return (await waitFor((m) => m.kind === 'response' && m.id === n)) as { ok: boolean; result?: unknown; error?: { code: string; details: Record<string, unknown> } };
  };
  return { engine, invoke, waitFor };
}

describe('advisor.suggest, task.create and tasks.list over the engine', () => {
  it('reads the project\'s discovery (ecosystem, migrations), keeps cards as TASK-0001, TASK-0002, and refuses bad input', async () => {
    const project = join(root, 'shop');
    mkdirSync(join(project, 'db', 'migrations'), { recursive: true });
    mkdirSync(join(project, 'src'), { recursive: true });
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'shop', version: '1.0.0', devDependencies: { vitest: '5.0.3' } }));
    writeFileSync(join(project, 'src', 'cart.test.ts'), 'import { it } from "vitest"; it("x", () => {});\n');
    writeFileSync(join(project, 'db', 'migrations', '001.sql'), 'create table t (id int);\n');
    const h = harness();
    try {
      await h.waitFor((m) => m.kind === 'event' && (m.payload as { state?: string }).state === 'ready');
      const added = await h.invoke('project.add', { selectionToken: `sel_${'a'.repeat(43)}` }, { selectionToken: { kind: 'selection', path: project } });
      expect(added.ok).toBe(true);
      const { project: p, discoveryId } = added.result as { project: { id: string }; discoveryId: string };
      await h.waitFor((m) => m.kind === 'event' && m.topic === 'discovery.done' && (m.payload as { discoveryId: string }).discoveryId === discoveryId);

      // advisor.suggest: C-06 gives the ecosystem and the migration folder (rule 5 «ترحيل مكتشف»).
      const ctx = { situation: 'bugfix', areas: ['data', 'logic'], impact: 2, audience: 'small', scope: 'local', evidence: 'weak', reversibility: 'easy' };
      const advice = await h.invoke('advisor.suggest', { projectId: p.id, context: ctx });
      expect(advice.ok).toBe(true);
      const r = advice.result as AdvisorResult;
      expect(r.ecosystems).toEqual({ ids: ['js'], from: 'discovery' });
      expect(r.input.migrations).toEqual({ declared: null, detected: ['db/migrations'] });
      expect(r.items.map((i) => i.id)).toContain('migration_rehearsal');
      expect(r.items.flatMap((i) => i.tools).some((t) => t.name === 'Vitest')).toBe(true);

      // Invalid context: a visible, coded error naming the path.
      expect(await h.invoke('advisor.suggest', { projectId: p.id, context: { situation: 'bugfix', stack: 42 } })).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
      expect(await h.invoke('advisor.suggest', { projectId: p.id, context: { situation: 'bugfix', impact: 99 } })).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
      expect(await h.invoke('advisor.suggest', { projectId: 'nope', context: ctx })).toMatchObject({ ok: false, error: { code: 'not_found' } });

      // task.create: two cards, numbered per project; the context comes from discovery.
      const one = await h.invoke('task.create', { projectId: p.id, source: { kind: 'advisorItem', itemId: 'confirm_bug', context: ctx, location: 'src/cart.ts' } });
      expect(one.ok).toBe(true);
      const t1 = (one.result as { task: TaskRecord }).task;
      expect(t1).toMatchObject({ displayId: 'TASK-0001', status: 'open', card: { type: 'bug_repro_test', priority: 1, context: { framework: 'vitest', examples: ['src/cart.test.ts'] } } });
      expect(t1.card.text.split('\n')[0]).toBe('# بطاقة مهمة من عِيَار — TASK-0001');
      const two = await h.invoke('task.create', { projectId: p.id, source: { kind: 'check', checkId: 'beh.e2e', outcome: 'missing_tests' } });
      expect((two.result as { task: TaskRecord }).task.displayId).toBe('TASK-0002');
      expect(await h.invoke('task.create', { projectId: p.id, source: { kind: 'advisorItem', itemId: 'static_gate', context: ctx } })).toMatchObject({ ok: false, error: { code: 'not_found', details: { reason: 'covered_by_checks' } } });

      const list = await h.invoke('tasks.list', { projectId: p.id });
      expect((list.result as { tasks: TaskRecord[] }).tasks.map((t) => t.displayId)).toEqual(['TASK-0001', 'TASK-0002']);
      expect((list.result as { tasks: TaskRecord[] }).tasks[0]).toEqual(t1);
    } finally {
      h.engine.stop();
    }
  });
});
