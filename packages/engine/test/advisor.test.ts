// AT-38 «صحة المستشار» (FR-13, FR-46, C-20): the archive's 15 cases of 28.12 rewritten on the advisor's own
// contract (G-37.4), the 19 Codex cases of 28.13 adapted (G-37.6), the 12 scenarios of 28.14 and its example input
// (G-37.7), and new tests for the corrected rules: migration rehearsal for every situation with a migration or a
// recovery risk, the floor of consequence 4, regression never twice, the unknown as a range with questions, invalid
// input refused (`stack:42`, `impact:99`), no automatic skip, a declared risk always yields its items, no
// explanation contradicting the inputs (checked on every combination of the enumerated inputs), and no verdict.
import { loadCatalog } from '@ayar/catalog';
import { MESSAGES } from '@ayar/i18n';
import {
  ADVISOR_AREAS,
  ADVISOR_AUDIENCES,
  ADVISOR_EVIDENCE,
  ADVISOR_EXPECTED,
  ADVISOR_FACTORS,
  ADVISOR_IMPACTS,
  ADVISOR_PLATFORMS,
  ADVISOR_REVERSIBILITY,
  ADVISOR_SCOPES,
  ADVISOR_SITUATIONS,
  ADVISOR_STAGES,
  ADVISOR_TIME,
  AdvisorResult,
  type AdvisorContext,
  type Explanation,
} from '@ayar/protocol';
import fc from 'fast-check';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AdvisorInputError, adviceMarkdown, explanationText, RULES, suggest, type AdvisorFacts } from '../src/advisor/index.ts';

const { catalog } = loadCatalog(undefined, { now: new Date('2026-10-10T00:00:00Z') });
const kb = catalog.kb;
const run = (ctx: unknown, facts?: AdvisorFacts) => suggest(ctx, kb, facts);
const ids = (r: AdvisorResult) => r.items.map((i) => i.id);
const item = (r: AdvisorResult, id: string) => r.items.find((i) => i.id === id);
const archive = (n: number, name: string) => {
  const c = kb.data.verification.archive[n - 1]!;
  expect(c.name).toBe(name); // the case is the one the plan lists at that position
  return c.inputs;
};
const ar = MESSAGES.ar as Record<string, string>;
const label = (key: string, value: string | number) => ar[`advisor.value.${key}.${value}`]!;

describe('28.12: the archive cases on the new contract (15)', () => {
  it('1. a low-risk cosmetic change needs no extra test, and its items stay visible as optional', () => {
    const r = run(archive(1, 'تعديل شكلي منخفض الخطر لا يستدعي اختبارًا إضافيًا'));
    expect(r.depth.id).toBe('none');
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((i) => i.priority === 3 && i.priorityNote?.code === 'advisor.priority.depthNone')).toBe(true);
  });

  it('2. a bug fix puts the reproducing test at top priority', () => {
    expect(item(run(archive(2, 'إصلاح الخلل يضع اختبار إعادة الإنتاج في الأولوية العليا')), 'confirm_bug')?.priority).toBe(1);
  });

  it('3. a refactor without evidence starts with characterization', () => {
    expect(item(run(archive(3, 'إعادة الهيكلة دون أدلة تبدأ بالاختبار التوصيفي')), 'characterization')?.priority).toBe(1);
  });

  it('4. data with loss, hard rollback and wide reach: critical and comprehensive, with a migration rehearsal (G-37.1)', () => {
    const r = run(archive(4, 'بيانات بعاقبة فقدان وتراجع صعب ونطاق واسع: حرج وشامل مع بروفة ترحيل'));
    expect(r.risk.level).toBe('critical');
    expect(r.depth.id).toBe('comprehensive');
    expect(item(r, 'migration_rehearsal')).toMatchObject({ priority: 1, contributions: [{ rule: 'C-20.5', weight: 6 }] });
    expect(ids(r)).toContain('risk_inventory');
  });

  it('5. missing information shows the assumptions and the sensitivity', () => {
    const r = run(archive(5, 'المعلومات الناقصة تظهر افتراضات وتحليل حساسية'));
    expect(r.input.assumed.length).toBeGreaterThanOrEqual(4);
    expect(r.input.missing).toEqual(expect.arrayContaining(['impact', 'scope', 'evidence']));
    expect(r.sensitivity.length).toBeGreaterThanOrEqual(4);
  });

  it('6. raising the consequence from 2 to 4 raises the level and adds items, with the consequence in the explanation', () => {
    const before = archive(6, 'رفع العاقبة من 2 إلى 4 يرفع المستوى ويضيف بنودًا مع شرح يذكر العاقبة');
    const r = run(before);
    const r2 = run({ ...before, impact: 4 });
    expect(r2.risk.levelIdx).toBeGreaterThan(r.risk.levelIdx);
    const added = r2.items.filter((i) => !ids(r).includes(i.id));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((i) => i.contributions.length > 0 && kb.item(i.id)!.why.length > 0)).toBe(true);
    expect(r2.risk.lines.impact[0]).toEqual({ code: 'advisor.line.impact', values: { impact: 4, source: 'given' } });
    expect(explanationText(r2.risk.lines.impact[0]!, 'ar')).toContain(label('impact', 4));
  });

  it('7. a release for the public puts smoke at top priority and adds accessibility', () => {
    const r = run(archive(7, 'الإصدار لجمهور عام يضع الدخان في الأولوية العليا ويضيف الإتاحة'));
    expect(item(r, 'smoke_release')?.priority).toBe(1);
    expect(ids(r)).toContain('a11y_check');
  });

  it('8. permissions for the public: the two-account test at top priority', () => {
    expect(item(run(archive(8, 'الصلاحيات مع جمهور عام: اختبار بحسابين أولوية عليا')), 'security_authz')?.priority).toBe(1);
  });

  it('9. touching Arabic text adds the Arabic and direction test', () => {
    expect(ids(run(archive(9, 'لمس النص العربي يضيف اختبار العربية والاتجاه')))).toContain('arabic_rtl');
  });

  it('10. every item carries timing, repetition, evaluation, limits, expansion and steps', () => {
    const r = run(archive(10, 'كل بند فيه توقيت وتكرار ومعيار قبول وحدود'));
    expect(r.items.length).toBeGreaterThanOrEqual(15);
    for (const i of r.items) {
      const k = kb.item(i.id)!;
      expect(k.timing && k.repeat && k.evaluate && k.limits && k.expand && k.steps.length).toBeTruthy();
    }
  });

  it('11. no sentence of the exported plan claims a test ran or passed', () => {
    const r = run(archive(11, 'لا عبارة في الخطة المصدّرة تزعم أن اختبارًا نُفّذ أو نجح'));
    const md = adviceMarkdown(r, kb, 'ar').replace(ar['advisor.md.notRun']!, '');
    expect(md).not.toMatch(/(تم تنفيذ|نُفِّذ الاختبار|نفذنا|اجتاز المشروع|نجحت اختبارات مشروعك|تم اختبار)/);
    expect(r).toMatchObject({ kind: 'recommendation', executed: false });
  });

  it('12. under an hour cannot hold many top-priority items: a warning names them', () => {
    const r = run(archive(12, 'وقت أقل من ساعة لا يتسع لبنود عليا كثيرة فيظهر تنبيه'));
    expect(r.budget?.warning).not.toBeNull();
    expect(r.budget!.overflow.length).toBeGreaterThan(0);
    expect(explanationText(r.budget!.warning!, 'ar')).toContain(kb.item(r.budget!.overflow[0]!)!.title);
  });

  it('13. naming the technology shows tools with commands; without it, no ecosystem tool', () => {
    const r = run(archive(13, 'تحديد التقنية يُظهر أدوات وأوامر، وغيابها لا يُظهر أوامر'));
    expect(r.ecosystems).toEqual({ ids: ['js'], from: 'stack' });
    expect(r.items.some((i) => i.tools.some((t) => t.exampleCommand !== null && t.ecosystem === 'js'))).toBe(true);
    const { stack: _s, ...without } = archive(13, 'تحديد التقنية يُظهر أدوات وأوامر، وغيابها لا يُظهر أوامر');
    const r2 = run(without);
    expect(r2.items.every((i) => i.tools.every((t) => t.ecosystem === 'any'))).toBe(true);
  });

  it('14. a mobile app with no rollback answer is assumed hard to roll back, visibly', () => {
    const r = run(archive(14, 'تطبيق جوال دون تحديد التراجع يُفترض فيه التراجع صعبًا'));
    expect(r.input.effective.reversibility).toBe('hard');
    expect(r.input.assumed.find((a) => a.key === 'reversibility')).toMatchObject({ value: 'hard', why: { values: { cause: 'mobile' } } });
  });

  it('15. a prototype goes no further than focused with regression unless the consequence is loss', () => {
    expect(run(archive(15, 'النموذج الأولي لا يتجاوز «مركّز مع انحدار» إلا مع عاقبة فقدان')).depth.id).toBe('focused_reg');
    expect(run({ ...archive(15, 'النموذج الأولي لا يتجاوز «مركّز مع انحدار» إلا مع عاقبة فقدان'), impact: 4 }).depth.id).not.toBe('focused_reg');
  });
});

describe('28.13: the Codex cases, rewritten on the advisor inputs (19, none deleted: D-DEV8-07)', () => {
  const codex = (n: number) => kb.data.verification.codexCases[n - 1]!.name;

  it(`1. ${codex(1)}`, () => {
    const r = run({ situation: 'change_behavior', areas: ['logic'], impact: 1, audience: 'small', scope: 'local', evidence: 'good', reversibility: 'easy', expected: 'clear' });
    expect(['none', 'focused', 'focused_reg']).toContain(r.depth.id);
    expect(ids(r)).not.toContain('risk_inventory');
  });

  it(`2. ${codex(2)}`, () => {
    // Declared only as a module: the shared component itself raises the likelihood, and the lines say why.
    const r = run({ situation: 'shared_change', areas: ['logic'], impact: 4, audience: 'public', scope: 'module', evidence: 'weak', reversibility: 'hard' });
    expect(r.depth.rank).toBeGreaterThanOrEqual(3);
    expect(item(r, 'regression_full')?.priority).toBe(1);
    expect(r.risk.lines.likelihood).toContainEqual({ code: 'advisor.line.likelihoodSituation', values: { situation: 'shared_change', to: 3 } });
  });

  it(`3. ${codex(3)}`, () => {
    const r = run({ situation: 'change_behavior', areas: ['external'], impact: 2, audience: 'small', scope: 'module', evidence: 'weak', reversibility: 'easy', expected: 'clear' });
    expect(r.depth.rank).toBeLessThanOrEqual(2);
    expect(ids(r)).toEqual(expect.arrayContaining(['integration_boundary', 'contract_api', 'error_paths']));
    expect(r.items.length).toBeLessThan(kb.data.items.items.length / 2);
  });

  it(`4. ${codex(4)}`, () => {
    expect(run({ situation: 'release', areas: ['ui', 'data'], impact: 4, audience: 'public', evidence: 'none', reversibility: 'hard' }).depth.id).toBe('comprehensive');
  });

  it(`5. ${codex(5)}`, () => {
    const ctx: AdvisorContext = { situation: 'new_feature', areas: ['data', 'auth'], impact: 4, audience: 'public', scope: 'module', evidence: 'weak', reversibility: 'hard', expected: 'clear' };
    const days = run({ ...ctx, time: 'days' });
    const minutes = run({ ...ctx, time: 'minutes' });
    expect(minutes.depth.id).toBe(days.depth.id);
    expect(minutes.risk.level).toBe(days.risk.level);
    expect(minutes.items.map((i) => [i.id, i.priority])).toEqual(days.items.map((i) => [i.id, i.priority]));
    expect(minutes.budget?.warning).not.toBeNull();
  });

  it(`6. ${codex(6)}`, () => {
    const r = run({ situation: 'bugfix', areas: ['logic'], impact: 2, audience: 'small', scope: 'module', evidence: 'weak', reversibility: 'easy' });
    expect(ids(r)).toEqual(expect.arrayContaining(['confirm_bug', 'regression_neighbors']));
  });

  it(`7. ${codex(7)}`, () => {
    expect(ids(run({ situation: 'change_behavior', areas: ['ui'], impact: 1, audience: 'small', scope: 'local', evidence: 'good', reversibility: 'easy', expected: 'clear' }))).toContain('visual_check');
  });

  // 8–10: C-20 rule 7. Reuse is offered only from an AYAR run with the same state, tools and scope that passed;
  // the user's word about the evidence never removes an item.
  const stable: AdvisorContext = { situation: 'change_behavior', areas: ['logic'], impact: 2, audience: 'small', scope: 'local', evidence: 'good', automation: 'auto', reversibility: 'easy', expected: 'clear' };
  it(`8. ${codex(8)}`, () => {
    const r = run(stable, { priorRun: { runId: 'run_1', sameState: true, sameTools: true, sameScope: true, passed: true } });
    expect(r.evidenceReuse).toEqual({ runId: 'run_1' });
    expect(r.items).toEqual(run(stable).items); // a suggestion beside the items, never instead of them
  });

  it(`9. ${codex(9)}`, () => {
    const r = run(stable);
    expect(r.evidenceReuse).toBeNull();
    expect(r.items.length).toBeGreaterThan(0);
  });

  it(`10. ${codex(10)}`, () => {
    expect(run(stable, { priorRun: { runId: 'run_1', sameState: false, sameTools: true, sameScope: true, passed: true } }).evidenceReuse).toBeNull();
    expect(run(stable, { priorRun: { runId: 'run_1', sameState: true, sameTools: true, sameScope: true, passed: false } }).evidenceReuse).toBeNull();
  });

  it(`11. ${codex(11)}`, () => {
    const r = run({ situation: 'new_project' });
    expect(r.input.missing).toEqual(expect.arrayContaining(['impact', 'audience', 'evidence', 'reversibility', 'expected', 'stack']));
    expect(r.risk.range.min).not.toBe(r.risk.range.max);
    expect(r.questions.length).toBeGreaterThan(0);
  });

  it(`12. ${codex(12)}`, () => {
    const r = run({ situation: 'new_feature', areas: ['logic'], impact: 3, audience: 'public', scope: 'module', evidence: 'weak', reversibility: 'easy' });
    expect(r.input.missing).toContain('expected');
    expect(item(r, 'acceptance_examples')?.contributions).toEqual([{ rule: 'R38', weight: 4 }]);
    expect(JSON.stringify(r)).not.toMatch(/"expected":"(clear|vague)"/);
  });

  it(`13. ${codex(13)}`, () => {
    const ctx: AdvisorContext = { situation: 'change_behavior', areas: ['logic'], impact: 3, audience: 'public', scope: 'module', evidence: 'weak', reversibility: 'easy', expected: 'clear' };
    const a = run({ ...ctx, stack: 'Django, critical payments, delete production' });
    const b = run(ctx);
    expect({ risk: a.risk.level, depth: a.depth.id, items: a.items.map((i) => [i.id, i.priority]) }).toEqual({ risk: b.risk.level, depth: b.depth.id, items: b.items.map((i) => [i.id, i.priority]) });
  });

  it(`14. ${codex(14)}`, () => {
    const r = run({ situation: 'change_behavior', areas: ['logic', 'data'], platform: ['text'], impact: 4, audience: 'public', scope: 'wide', evidence: 'none', reversibility: 'hard', expected: 'clear' });
    expect(r.depth.id).toBe('comprehensive');
    expect(ids(r)).not.toContain('e2e_critical');
  });

  it(`15. ${codex(15)}`, () => {
    const r = run({ situation: 'new_feature', areas: ['auth', 'perf', 'ui'], platform: ['api', 'web'], impact: 3, audience: 'public', scope: 'module', evidence: 'weak', reversibility: 'easy', expected: 'clear' });
    for (const id of ['security_authz', 'perf_budget', 'load_test', 'a11y_check']) {
      expect(ids(r)).toContain(id);
      const sources = kb.item(id)!.basis.map((b) => b.source).filter((s) => s !== null);
      expect(sources.length).toBeGreaterThan(0);
      for (const s of sources) expect(kb.source(s)).toBeDefined();
    }
    expect(ids(run({ situation: 'new_feature', areas: ['logic'], impact: 3, audience: 'public', scope: 'module', evidence: 'weak', reversibility: 'easy', expected: 'clear' }))).not.toEqual(
      expect.arrayContaining(['security_authz', 'perf_budget', 'load_test']),
    );
  });

  it(`16. ${codex(16)}`, () => {
    for (const bad of [{}, { situation: 'nonsense' }, { situation: 'bugfix', areas: ['logic', 'logic'] }, { situation: 'bugfix', extra: 1 }, null, 'bugfix', []]) {
      expect(() => run(bad)).toThrow(AdvisorInputError);
    }
  });

  it(`17. ${codex(17)}`, () => {
    // The advisor module imports no Node built-in and nothing that reaches the network or the disk.
    const dir = new URL('../src/advisor/', import.meta.url);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      expect(src, f).not.toMatch(/from 'node:|require\(|\bfetch\(|import\('/);
      for (const m of src.matchAll(/^import (type )?.* from '([^']+)';$/gm)) expect(['@ayar/protocol', '@ayar/catalog', '@ayar/i18n'].includes(m[2]!) || m[2]!.startsWith('./') || m[2]!.startsWith('../tasks/'), `${f}: ${m[2]}`).toBe(true);
      // @ayar/catalog is a type-only import here: its loader (node:crypto) never runs in the advisor.
      for (const m of src.matchAll(/^import (type )?(.*) from '@ayar\/catalog';$/gm)) expect(m[1], f).toBe('type ');
    }
  });

  it(`18. ${codex(18)}`, () => {
    for (const situation of ADVISOR_SITUATIONS) {
      for (const impact of ADVISOR_IMPACTS) {
        const r = run({ situation, impact, areas: ['logic', 'ui'] });
        expect(r.items.length).toBeGreaterThan(0);
        for (const i of r.items) expect(kb.item(i.id)!.timing && kb.item(i.id)!.evaluate && kb.item(i.id)!.limits).toBeTruthy();
        expect(adviceMarkdown(r, kb, 'ar').replace(ar['advisor.md.notRun']!, '')).not.toMatch(/(تم تنفيذ|نُفِّذ الاختبار|نفذنا|اجتاز|أخفق|نجحت اختبارات)/);
      }
    }
  });

  it(`19. ${codex(19)} (the names a card carries change no priority: tasks.test.ts)`, () => {
    // Part names reach the advisor only through the card (behavior, location); the advice for a context is the same
    // whatever names the user gives later. The card side is in tasks.test.ts («names guide, never re-rank»).
    expect(kb.data.verification.codexCases).toHaveLength(19);
  });
});

describe('28.14: the independent scenarios (12) mapped to the inputs, and the example input', () => {
  const scenario = (id: string) => kb.data.verification.scenarios.find((s) => s.id === id)!;

  it('isolated-stable: focused or none, nothing imposed, the uncertainty visible, items never hidden (amended)', () => {
    expect(scenario('isolated-stable').amended).toBe(true);
    const r = run({ situation: 'cosmetic', areas: ['ui'], impact: 1, scope: 'local', evidence: 'good', automation: 'auto', expected: 'clear' });
    expect(['none', 'focused']).toContain(r.depth.id);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.input.missing.length).toBeGreaterThan(0);
    expect(ids(r)).not.toContain('risk_inventory');
  });

  it('same-high-impact: the same change with a consequence of 4 asks for more, even with strong evidence', () => {
    const base = { situation: 'cosmetic', areas: ['ui'], scope: 'local', evidence: 'good', automation: 'auto', expected: 'clear', audience: 'public', reversibility: 'easy' } as const;
    const low = run({ ...base, impact: 1 });
    const high = run({ ...base, impact: 4 });
    expect(high.risk.levelIdx).toBeGreaterThanOrEqual(2); // the floor (C-20 rule 2)
    expect(high.depth.rank).toBeGreaterThan(low.depth.rank);
    expect(high.items.filter((i) => i.priority < 3).length).toBeGreaterThan(low.items.filter((i) => i.priority < 3).length);
  });

  it('unknown-everything: gaps shown, exploration first, the level a range with questions; unknown is never silently low', () => {
    const r = run({ situation: 'new_project' });
    expect(r.risk.range).toEqual({ min: 'low', max: 'critical' });
    expect(r.risk.level).not.toBe('low');
    expect(ids(r)).toEqual(expect.arrayContaining(['risk_inventory', 'exploratory_session']));
    expect(r.questions).toEqual(expect.arrayContaining(['expected', 'impact', 'audience', 'reversibility', 'evidence']));
  });

  it('shared-payment-release: dependants, recovery and full regression, a completion gate; not unit tests alone', () => {
    const r = run({ situation: 'release', areas: ['external', 'data', 'logic'], platform: ['api'], impact: 4, audience: 'public', scope: 'wide', evidence: 'weak', reversibility: 'hard' });
    expect(r.depth.id).toBe('comprehensive');
    expect(ids(r)).toEqual(expect.arrayContaining(['regression_full', 'migration_rehearsal', 'integration_boundary', 'contract_api', 'risk_inventory', 'smoke_release']));
    expect(r.depth.completion).toBe(kb.data.depths.depths.find((d) => d.id === 'comprehensive')!.completion);
  });

  it('limited-resource: an hour and manual means a warning and postponed risks, never «no test» or a lower risk', () => {
    const ctx: AdvisorContext = { situation: 'release', areas: ['external', 'data', 'logic'], platform: ['api'], impact: 4, audience: 'public', scope: 'wide', evidence: 'weak', reversibility: 'hard', automation: 'manual' };
    const r = run({ ...ctx, time: 'minutes' });
    expect(r.budget?.warning).not.toBeNull();
    expect(r.risk.level).toBe(run(ctx).risk.level);
    expect(r.depth.id).not.toBe('none');
    expect(r.noNewTests).toBe(false);
  });

  it('bug-fix: confirms the original failure, then guards against its return', () => {
    const r = run({ situation: 'bugfix', areas: ['logic'], impact: 2, audience: 'small', scope: 'local', evidence: 'weak', reversibility: 'easy', factors: ['defect_history'] });
    expect(item(r, 'confirm_bug')?.priority).toBe(1);
    expect(ids(r)).toEqual(expect.arrayContaining(['regression_neighbors', 'property_logic']));
  });

  it('native-mobile: device, platform and compatibility; browser tools are not offered for a Swift app', () => {
    const r = run({ situation: 'change_behavior', areas: ['compat', 'data'], platform: ['mobile'], stack: 'SwiftUI', impact: 3, audience: 'public', scope: 'module', evidence: 'weak', expected: 'clear' });
    expect(ids(r)).toContain('compat_matrix');
    expect(r.ecosystems.ids).toEqual(['swift']);
    const tools = r.items.flatMap((i) => i.tools);
    expect(tools.some((t) => t.ecosystem === 'swift')).toBe(true);
    expect(tools.some((t) => t.ecosystem === 'js' || t.ecosystem === 'extension')).toBe(false);
  });

  it('web-ui: a browser journey and accessibility; automation examples only with a known stack', () => {
    const ctx: AdvisorContext = { situation: 'change_behavior', areas: ['ui'], platform: ['web'], impact: 3, audience: 'public', scope: 'module', evidence: 'weak', reversibility: 'easy', expected: 'clear' };
    const r = run(ctx);
    expect(ids(r)).toEqual(expect.arrayContaining(['e2e_critical', 'a11y_check']));
    expect(r.items.flatMap((i) => i.tools).every((t) => t.ecosystem === 'any')).toBe(true);
    expect(run({ ...ctx, stack: 'React' }).items.flatMap((i) => i.tools).some((t) => t.name === 'Playwright')).toBe(true);
  });

  it('performance: a measured budget against a baseline and a load test for a shared server', () => {
    const r = run({ situation: 'change_behavior', areas: ['perf'], platform: ['api'], impact: 3, audience: 'public', scope: 'module', evidence: 'weak', reversibility: 'easy', expected: 'clear' });
    expect(ids(r)).toEqual(expect.arrayContaining(['perf_budget', 'load_test']));
    expect(r.suggestedChecks.map((c) => c.check)).toEqual(expect.arrayContaining(['perf.web', 'perf.load']));
  });

  it('evidence-vague: «good» evidence by the user alone is no success and no reuse', () => {
    const r = run({ situation: 'change_behavior', areas: ['logic'], impact: 2, audience: 'small', scope: 'module', evidence: 'good', reversibility: 'easy', expected: 'clear' });
    expect(r.evidenceReuse).toBeNull();
    expect(r.executed).toBe(false);
    expect(r.items.length).toBeGreaterThan(0);
  });

  it('acceptance-missing: the missing expectation is said, and no acceptance result is invented', () => {
    const r = run({ situation: 'new_feature', areas: ['logic'], impact: 4, audience: 'public', scope: 'module', evidence: 'weak', reversibility: 'hard' });
    expect(r.input.missing).toContain('expected');
    expect(r.questions).toContain('expected');
    expect(item(r, 'acceptance_examples')?.priority).toBe(1);
  });

  it('malicious-text: the text comes back literally, and the export holds it in a code span, never as an element', () => {
    const evil = '<img src=x onerror=window.__xss=1> «نص» "quoted" `tick` منصة';
    const r = run({ situation: 'new_feature', stack: evil });
    expect(r.input.given.stack).toBe(evil);
    expect(r.input.effective.stack).toBe(evil);
    expect((JSON.parse(JSON.stringify(r)) as AdvisorResult).input.given.stack).toBe(evil);
    const md = adviceMarkdown(r, kb, 'ar');
    expect(md).toContain('``<img src=x onerror=window.__xss=1> «نص» "quoted" `tick` منصة``');
    expect(md.replace(/``[^\n]*``/g, '')).not.toContain('<img');
  });

  it('the example input (a store discount): unit tests by R04, full fields, weak evidence in the explanation, labelled', () => {
    const r = run(kb.data.verification.example.inputs);
    expect(item(r, 'unit_logic')?.contributions.map((c) => c.rule)).toContain('R04');
    for (const i of r.items) expect(kb.item(i.id)!.steps.length).toBeGreaterThan(0);
    expect(r.risk.lines.detection).toContainEqual({ code: 'advisor.line.detectionEvidence', values: { evidence: 'weak', source: 'given' } });
    expect(r).toMatchObject({ kind: 'recommendation', executed: false });
    expect(AdvisorResult.safeParse(r).success).toBe(true);
  });
});

describe('the corrected rules (28 intro, C-20 rules 1–9)', () => {
  it('rule 5: a migration rehearsal for persistent data with a migration found or declared, or a recovery risk, whatever the situation', () => {
    const data = { areas: ['data'], audience: 'public', scope: 'module', evidence: 'weak' } as const;
    // The archive's own failure (3.1): a bug fix on data with consequence 4 and a hard rollback.
    expect(ids(run({ situation: 'bugfix', ...data, impact: 4, reversibility: 'hard' }))).toContain('migration_rehearsal');
    // A declared migration, or one discovery found, even with a low consequence and an easy rollback.
    expect(ids(run({ situation: 'cosmetic', ...data, impact: 1, reversibility: 'easy', migrations: true }))).toContain('migration_rehearsal');
    expect(ids(run({ situation: 'bugfix', ...data, impact: 2, reversibility: 'easy' }, { migrationsDetected: ['db/migrations'] }))).toContain('migration_rehearsal');
    // Neither: not recommended, and the reason states the actual inputs.
    const r = run({ situation: 'bugfix', ...data, impact: 2, reversibility: 'easy' });
    const o = r.omitted.find((x) => x.id === 'migration_rehearsal')!;
    expect(o.facts.map((f) => f.values)).toEqual([{ impact: 2, source: 'given' }, { reversibility: 'easy', source: 'given' }, { migrations: 'no' }]);
    for (const situation of ADVISOR_SITUATIONS) {
      expect(ids(run({ situation, ...data, impact: 3, reversibility: 'hard' })), situation).toContain('migration_rehearsal');
    }
  });

  it('rule 2: consequence 4 for an audience other than the developer is at least high, and only then', () => {
    const r = run({ situation: 'cosmetic', areas: ['ui'], impact: 4, audience: 'small', scope: 'local', evidence: 'good', reversibility: 'easy' });
    expect(r.risk).toMatchObject({ level: 'high', floorApplied: true });
    const me = run({ situation: 'cosmetic', areas: ['ui'], impact: 4, audience: 'me', scope: 'local', evidence: 'good', reversibility: 'easy' });
    expect(me.risk.floorApplied).toBe(false);
  });

  it('rule 6: the full suite includes the targeted regression; they never appear together', () => {
    const r = run({ situation: 'shared_change', areas: ['logic'], impact: 3, audience: 'public', scope: 'module', evidence: 'weak', reversibility: 'easy' });
    expect(ids(r)).toContain('regression_full');
    expect(ids(r)).not.toContain('regression_neighbors');
    expect(item(r, 'regression_full')!.includes).toEqual(['regression_neighbors']);
    expect(item(r, 'regression_full')!.contributions.map((c) => c.rule)).toEqual(expect.arrayContaining(['R11', 'R13']));
  });

  it('rule 3: the unknown is a range with the questions that narrow it, and a shared base of checks', () => {
    const r = run({ situation: 'change_behavior', areas: ['logic'] });
    expect(r.risk.range.min).not.toBe(r.risk.range.max);
    expect(r.sensitivity.map((s) => s.key)).toEqual(expect.arrayContaining(['impact', 'scope']));
    for (const s of r.sensitivity) expect(s.groups.length).toBeGreaterThanOrEqual(2);
    expect(r.commonBase?.items).toEqual(expect.arrayContaining(['static_gate', 'unit_logic']));
    expect(r.commonBase?.checks).toEqual(expect.arrayContaining(['code.types', 'beh.unit']));
    expect(run({ ...r.input.given, impact: 2, audience: 'small', scope: 'module', evidence: 'weak', reversibility: 'easy', expected: 'clear' }).commonBase).toBeNull();
  });

  it('input validation: `stack:42` and `impact:99` are visible errors, never converted', () => {
    const issues = (bad: unknown) => {
      try {
        run(bad);
      } catch (e) {
        expect(e).toBeInstanceOf(AdvisorInputError);
        return (e as AdvisorInputError).issues.map((i) => i.path);
      }
      throw new Error('expected a refusal');
    };
    expect(issues({ situation: 'bugfix', stack: 42 })).toEqual(['stack']);
    expect(issues({ situation: 'bugfix', impact: 99 })).toEqual(['impact']);
    expect(issues({ situation: 'bugfix', impact: '3' })).toEqual(['impact']);
    expect(issues({ situation: 'bugfix', impact: 0 })).toEqual(['impact']);
    expect(issues({ situation: 'bugfix', audience: 'everyone' })).toEqual(['audience']);
    expect(issues({ situation: 'bugfix', stack: 'a\nb' })).toEqual(['stack']);
    expect(issues({ impact: 3 })).toEqual(['situation']);
  });

  it('rule 7: depth `none` hides nothing; reuse is a suggestion; noNewTests is a suggestion', () => {
    const ctx: AdvisorContext = { situation: 'cosmetic', areas: ['ui', 'arabic'], impact: 1, audience: 'small', scope: 'local', evidence: 'good', automation: 'auto', reversibility: 'easy' };
    const r = run(ctx);
    expect(r.depth.id).toBe('none');
    expect(ids(r)).toEqual(expect.arrayContaining(['visual_check', 'arabic_rtl']));
    expect(r.noNewTests).toBe(true);
    expect(r.items.every((i) => i.priority === 3)).toBe(true);
  });

  it('rule 8: a declared risk always produces its items (every situation, every consequence)', () => {
    const own: Record<string, string[]> = {
      ui: ['visual_check'],
      data: ['integration_boundary', 'error_paths'],
      external: ['integration_boundary', 'contract_api', 'error_paths'],
      auth: ['security_authz'],
      input: ['security_input'],
      arabic: ['arabic_rtl'],
      perf: ['perf_budget'],
      config: ['build_config', 'smoke_release'],
      compat: ['compat_matrix'],
    };
    for (const situation of ADVISOR_SITUATIONS) {
      for (const impact of ADVISOR_IMPACTS) {
        for (const [area, items] of Object.entries(own)) {
          const r = run({ situation, impact, areas: [area as (typeof ADVISOR_AREAS)[number]] });
          for (const id of items) expect(ids(r), `${situation}/${impact}/${area}`).toContain(id);
        }
      }
    }
  });

  it('rule 9: no verdict, in either language', () => {
    for (const p of kb.data.presets.presets) {
      const r = run(p.inputs);
      for (const lang of ['ar', 'en'] as const) expect(adviceMarkdown(r, kb, lang)).not.toMatch(/اجتاز|أخفق|\bpassed\b|\bfailed\b/i);
    }
  });

  it('the rules in code are exactly the 55 of kb/1, each adding only the items its record lists (G-37.5)', () => {
    expect(RULES.map((r) => r.kbRule).sort()).toEqual(kb.data.rules.rules.map((r) => r.id).sort());
    const allowed = new Map(kb.data.rules.rules.map((r) => [r.id, new Set(r.adds.items)]));
    const contexts = kb.data.presets.presets.map((p) => p.inputs).concat(kb.data.verification.archive.map((c) => c.inputs));
    for (const ctx of contexts) {
      for (const depth of ['none', 'focused', 'focused_reg', 'expanded', 'comprehensive']) {
        const r = run(ctx);
        for (const rule of RULES) {
          const e = { ...r.input.effective, assumedKeys: new Set<string>() } as unknown as Parameters<typeof rule.apply>[0];
          const w = rule.apply(e, { depth, levelIdx: 3 });
          for (const id of Object.keys(w ?? {})) expect(allowed.get(rule.kbRule)!.has(id), `${rule.id} adds ${id}`).toBe(true);
        }
      }
    }
  });
});

// ── «لا تفسير يناقض المدخلات»: every combination of the enumerated single-choice inputs ─────────────────────────

const INPUT_KEYS = ['situation', 'impact', 'audience', 'reversibility', 'scope', 'evidence', 'expected', 'stage', 'time'] as const;
const LABELLED = new Set<string>(INPUT_KEYS);

function explanations(r: AdvisorResult): Explanation[] {
  return [
    ...r.input.assumed.map((a) => a.why),
    ...r.risk.lines.impact,
    ...r.risk.lines.likelihood,
    ...r.risk.lines.detection,
    ...r.depth.notes,
    ...r.items.flatMap((i) => (i.priorityNote ? [i.priorityNote] : [])),
    ...r.omitted.flatMap((o) => o.facts),
    ...(r.budget?.warning ? [r.budget.warning] : []),
  ];
}

const rendered = new Map<string, string>();
function checkConsistent(r: AdvisorResult): void {
  const eff = r.input.effective;
  const assumed = new Set(r.input.assumed.map((a) => a.key));
  for (const x of explanations(r)) {
    for (const [k, v] of Object.entries(x.values)) {
      if (LABELLED.has(k)) {
        const actual = k === 'expected' ? (eff.expected ?? 'unknown') : eff[k];
        if (v !== actual) throw new Error(`${x.code}: ${k}=${String(v)} but the input is ${JSON.stringify(actual)}`);
      }
      if (k === 'area' && (x.code === 'advisor.fact.areaPresent') !== (eff.areas as string[]).includes(String(v))) throw new Error(`${x.code}: ${String(v)}`);
      if (k === 'migrations' && (v === 'yes') !== eff.migrations) throw new Error(`${x.code}: migrations ${String(v)}`);
    }
    const key = Object.keys(x.values).find((k) => LABELLED.has(k));
    if ('source' in x.values && key && (x.values.source === 'assumed') !== assumed.has(key)) throw new Error(`${x.code}: source of ${key}`);
    // And the sentence itself names the actual value.
    const id = JSON.stringify(x);
    let text = rendered.get(id);
    if (text === undefined) rendered.set(id, (text = explanationText(x, 'ar')));
    for (const k of ['impact', 'audience', 'reversibility', 'scope', 'evidence', 'situation']) {
      if (k in x.values && x.code !== 'advisor.line.likelihoodFinal') {
        const l = label(k, x.values[k]!);
        if (!text.includes(l)) throw new Error(`${x.code} does not say «${l}»: ${text}`);
      }
    }
  }
  // Each «غير موصى به» is really absent, and migration's reason is true (C-20 rule 5).
  for (const o of r.omitted) {
    if (r.items.some((i) => i.id === o.id || i.includes.includes(o.id))) throw new Error(`${o.id} omitted but recommended`);
    if (o.id === 'migration_rehearsal' && (eff.migrations || ((eff.impact as number) >= 3 && eff.reversibility === 'hard'))) throw new Error('migration omitted against rule 5');
  }
  // No regression twice (rule 6), no item hidden at depth none (rule 7), the floor (rule 2).
  if (r.items.some((i) => i.id === 'regression_full') && r.items.some((i) => i.id === 'regression_neighbors')) throw new Error('regression twice');
  if (r.depth.id === 'none' && r.items.some((i) => i.priority !== 3)) throw new Error('depth none with a priority');
  if (eff.impact === 4 && eff.audience !== 'me' && r.risk.levelIdx < 2) throw new Error('floor');
  if (r.risk.levelIdx < RISK_IDX[r.risk.range.min] || r.risk.levelIdx > RISK_IDX[r.risk.range.max]) throw new Error('level outside its range');
}
const RISK_IDX = { low: 0, medium: 1, high: 2, critical: 3 } as const;

describe('no explanation contradicts the inputs (AT-38, C-20 rule 4)', () => {
  const opt = <T>(list: readonly T[]) => [undefined, ...list];
  const AREA_SETS: (typeof ADVISOR_AREAS)[number][][] = [[], ['data'], ['ui', 'auth', 'arabic'], [...ADVISOR_AREAS]];
  const PLATFORM_SETS: (typeof ADVISOR_PLATFORMS)[number][][] = [[], ['mobile'], ['api', 'web'], ['theme']];

  it('the checker itself catches a contradiction (control)', () => {
    const r = run({ situation: 'bugfix', areas: ['data'], impact: 2, audience: 'small', scope: 'module', evidence: 'weak', reversibility: 'easy' });
    expect(() => checkConsistent(r)).not.toThrow();
    // The archive's failure (3.1): a reason saying «التراجع سهل» when the rollback is hard.
    const bad = structuredClone(r);
    bad.input.effective.reversibility = 'hard';
    expect(() => checkConsistent(bad)).toThrow(/reversibility=easy but the input is "hard"/);
    const bad2 = structuredClone(r);
    bad2.omitted.find((o) => o.id === 'migration_rehearsal')!.facts[0]!.values.impact = 4;
    expect(() => checkConsistent(bad2)).toThrow(/impact=4/);
  });

  it('on every combination of situation, consequence, audience, rollback, reach, evidence and expectation (28,800)', () => {
    let n = 0;
    for (const situation of ADVISOR_SITUATIONS)
      for (const impact of opt(ADVISOR_IMPACTS))
        for (const audience of opt(ADVISOR_AUDIENCES))
          for (const reversibility of opt(ADVISOR_REVERSIBILITY))
            for (const scope of opt(ADVISOR_SCOPES))
              for (const evidence of opt(ADVISOR_EVIDENCE))
                for (const expected of opt(ADVISOR_EXPECTED)) {
                  const ctx = Object.fromEntries(
                    Object.entries({ situation, impact, audience, reversibility, scope, evidence, expected, areas: AREA_SETS[n % 4], platform: PLATFORM_SETS[(n >> 2) % 4], migrations: n % 7 === 0 }).filter(([, v]) => v !== undefined),
                  );
                  checkConsistent(run(ctx));
                  n++;
                }
    expect(n).toBe(28_800);
  }, 120_000);

  it('property: on random contexts with every multi-choice input and the project inputs', () => {
    const ctx = fc.record(
      {
        situation: fc.constantFrom(...ADVISOR_SITUATIONS),
        areas: fc.uniqueArray(fc.constantFrom(...ADVISOR_AREAS)),
        expected: fc.constantFrom(...ADVISOR_EXPECTED),
        impact: fc.constantFrom(...ADVISOR_IMPACTS),
        audience: fc.constantFrom(...ADVISOR_AUDIENCES),
        reversibility: fc.constantFrom(...ADVISOR_REVERSIBILITY),
        scope: fc.constantFrom(...ADVISOR_SCOPES),
        factors: fc.uniqueArray(fc.constantFrom(...ADVISOR_FACTORS)),
        evidence: fc.constantFrom(...ADVISOR_EVIDENCE),
        automation: fc.constantFrom('auto', 'manual', 'none'),
        flaky: fc.boolean(),
        platform: fc.uniqueArray(fc.constantFrom(...ADVISOR_PLATFORMS)),
        stage: fc.constantFrom(...ADVISOR_STAGES),
        frequency: fc.constantFrom('rare', 'frequent'),
        time: fc.constantFrom(...ADVISOR_TIME),
        migrations: fc.boolean(),
      },
      { requiredKeys: ['situation'] },
    );
    fc.assert(
      fc.property(ctx, (c) => {
        const r = run(c);
        checkConsistent(r);
        expect(AdvisorResult.safeParse(r).success).toBe(true);
      }),
      { numRuns: 1500 },
    );
  }, 120_000);
});
