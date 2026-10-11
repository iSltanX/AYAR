// The web probe through the engine (C-14, DEV-7), on the fixture projects with the probe's real browser:
//
// - AT-17: the design section on FX-WEB-DESIGN — 32 images (5 states − 1 «حساسة» × 2 sizes × 2 themes × 2
//   languages), the «حساسة» state listed with its reason and no image; the first run «ناقص إعداد: لا صورة مرجعية
//   معتمدة» with the captures as candidates; approved explicitly; then an intended change compared, «يحتاج مراجعة»
//   with its diff image and the source line that changed; no write in the repository, no reference updated alone;
//   the direction measured in Arabic; three runs on the same reference identical (R-11).
// - AT-18: FX-NOTEST with no reference at all — each design check «ناقص إعداد» by what it lacks, design.a11y by
//   axe's rules alone, and the «تجهيز فحص» cards.
// - AT-19: design.states with the preview server as a companion service — loading and error states shown, the
//   defect «أخفق» with its image, a state with no expectation «ناقص إعداد», the service before and after, and a
//   port already taken «تعذّر: الخدمة المرافقة لم تجهز» with its log.
// - AT-20: beh.ext.host on FX-EXT built — the sound one loads, the console error and Chromium's refusal «أخفق»
//   at their source lines, the mode recorded.
// - AT-10: a true ratio for the probe (its total known), none for a test runner; an estimate only with history.
//
// About three minutes; skipped without the probe's browser in Playwright's cache.
import type { BaselineView, CaptureView, ResultsPage, RunDetail, TaskRecord } from '@ayar/protocol';
import { createServer, type Server } from 'node:net';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plan, startRun, waitRun } from '../../../tools/cli/test/support/fixtures.ts';
import { engineFor, FIXTURES, ok, scanVariant, tempDir, toolchainReady, type EngineConnection, type Scan } from './support/scan.ts';
import { DESIGN_RENDER, installTestBrowser, probeBrowserReady, webDesignPatch } from './support/probe.ts';

const READY = probeBrowserReady();

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
beforeAll(async () => {
  if (!READY) return;
  ({ dir: root, cleanup } = tempDir('ayar-DEV-7-probe-'));
  engine = await engineFor(root);
  installTestBrowser(join(root, 'AYAR'));
}, 60_000);
afterAll(async () => {
  await engine?.close();
  if (process.env.AYAR_KEEP_TMP) console.log(root);
  else cleanup?.();
});

const exec = (d: RunDetail, instance: string) => {
  const c = d.checks.find((x) => x.instance === instance);
  if (!c) throw new Error(`no ${instance}: ${d.checks.map((x) => x.instance).join(', ')}`);
  return c;
};
const findingsOf = (s: { results: ResultsPage }, check: string) => s.results.findings.filter((f) => f.checkId === check);

/** Every file of a project with its hash (what «لا كتابة في المستودع» compares). */
function tree(dir: string, rel = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) for (const [k, v] of tree(dir, r)) out.set(k, v);
    else if (e.isFile()) out.set(r, createHash('sha256').update(readFileSync(join(dir, r))).digest('hex'));
  }
  return out;
}

async function rerun(projectId: string, instances: string[], timeoutMs = 600_000): Promise<{ detail: RunDetail; results: ResultsPage }> {
  const p = await plan(engine, projectId, { kind: 'group', instances });
  const detail = await waitRun(engine, (await startRun(engine, p.id)).runId, timeoutMs);
  const results = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId: detail.run.runId, includeExcluded: true, limit: 1000 } }));
  return { detail, results };
}

describe('AT-17: the design section with a reference (FX-WEB-DESIGN)', () => {
  it.runIf(READY)('captures 32 images and none of the «حساسة» state, asks for references, compares after an approval, and writes nothing in the repository', async () => {
    const s: Scan = await scanVariant(engine, root, 'FX-WEB-DESIGN', 'good', { include: DESIGN_RENDER.map((c) => `${c}@.`), patch: webDesignPatch(), selection: { kind: 'section', section: 'design' }, timeoutMs: 600_000, folder: 'at17' });
    const before = tree(s.root);
    for (const c of ['design.tokens.render', 'design.fonts.render', 'design.a11y', 'design.rtl.render', 'design.states']) expect([c, exec(s.detail, `${c}@.`).outcome]).toEqual([c, 'passed']);
    const visual = exec(s.detail, 'design.visual@.');
    expect([visual.outcome, visual.outcomeReason]).toEqual(['missing', { key: 'probe.reason.noApprovedReference', params: { count: 32 } }]);
    // One execution served the six pages checks (D-DEV7-03).
    const shared = s.detail.checks.filter((c) => DESIGN_RENDER.includes(c.checkId));
    expect(shared.filter((c) => c.raw?.sharedFrom).length).toBe(5);

    // The gallery: 32 captures, the «حساسة» state listed with its reason and no image (G-29).
    const g = ok<{ captures: CaptureView[]; uncaptured: { state: string; reason: string }[] }>(await engine.invoke('captures.list', { checkRunId: visual.checkRunId }));
    expect(g.captures).toHaveLength(32);
    expect(g.captures.every((c) => c.comparison === 'no_reference' && c.key.state !== 'account' && c.key.mode === 'headless' && c.key.browser === '156.0.8078.4')).toBe(true);
    expect(new Set(g.captures.map((c) => `${c.key.state}/${c.key.viewport}/${c.key.theme}/${c.key.lang}`)).size).toBe(32);
    expect(g.uncaptured).toHaveLength(8);
    expect(g.uncaptured.every((u) => u.state === 'account' && u.reason.includes('لا تُلتقط'))).toBe(true);
    const evidenceNames = readdirSync(join(root, 'AYAR', 'evidence', s.projectId, s.detail.run.runId), { recursive: true }).map(String);
    expect(evidenceNames.filter((n) => n.endsWith('.png') && n.includes('account'))).toEqual([]);

    // The direction in Arabic (design.rtl.render's measures in the outcome).
    const rtl = findingsOf(s, 'design.rtl.render');
    expect(rtl).toEqual([]);
    const outcome = JSON.parse(readFileSync(join(root, 'AYAR', 'evidence', s.projectId, s.detail.run.runId, exec(s.detail, 'design.tokens.render@.').checkRunId, 'probe.json'), 'utf8')) as { results: { key: string; rtl: { direction: string } | null }[] };
    expect(outcome.results.filter((r) => r.key.endsWith('/ar')).every((r) => r.rtl?.direction === 'rtl')).toBe(true);
    expect(outcome.results.filter((r) => r.key.endsWith('/en')).every((r) => r.rtl?.direction === 'ltr')).toBe(true);

    // Approved explicitly; nothing was approved before (D-27).
    expect(ok<{ baselines: BaselineView[] }>(await engine.invoke('baselines.list', { projectId: s.projectId })).baselines).toEqual([]);
    const approved = ok<{ approved: BaselineView[]; replaced: number }>(await engine.invoke('baseline.approve', { projectId: s.projectId, captureIds: g.captures.map((c) => c.id) }));
    expect([approved.approved.length, approved.replaced]).toEqual([32, 0]);

    // R-11: three runs on the same reference, identical.
    for (let n = 0; n < 3; n++) {
      const again = await rerun(s.projectId, ['design.visual@.']);
      expect(exec(again.detail, 'design.visual@.').outcome, `run ${n + 1}`).toBe('passed');
      const caps = ok<{ captures: CaptureView[] }>(await engine.invoke('captures.list', { checkRunId: exec(again.detail, 'design.visual@.').checkRunId })).captures;
      expect(caps.every((c) => c.comparison === 'match' && c.diffRatio === 0), `run ${n + 1}`).toBe(true);
    }

    // The intended change (visual-change: the radius 8px → 16px in the tokens), compared: «يحتاج مراجعة».
    for (const f of ['design/tokens.json', 'styles/tokens.css']) cpSync(join(FIXTURES, 'FX-WEB-DESIGN/variants/visual-change/overlay', f), join(s.root, f));
    const changed = await rerun(s.projectId, ['design.visual@.']);
    const v = exec(changed.detail, 'design.visual@.');
    expect(v.outcome).toBe('needs_review');
    const diffs = findingsOf(changed, 'design.visual');
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.every((f) => f.ruleId === 'visual.diff' && f.proof === 'suspected')).toBe(true);
    expect(diffs[0]!.location).toMatchObject({ path: 'design/tokens.json', line: 26 });
    const caps = ok<{ captures: CaptureView[] }>(await engine.invoke('captures.list', { checkRunId: v.checkRunId })).captures;
    expect(caps.filter((c) => c.comparison === 'differs' && c.diffId !== null).length).toBe(diffs.length);
    // No reference was updated by AYAR, and nothing written in the repository but the change made by hand.
    expect(ok<{ baselines: BaselineView[] }>(await engine.invoke('baselines.list', { projectId: s.projectId })).baselines.map((b) => b.id).sort()).toEqual(approved.approved.map((b) => b.id).sort());
    const after = tree(s.root);
    const touched = [...after.keys()].filter((k) => after.get(k) !== before.get(k)).sort();
    expect(touched).toEqual(['design/tokens.json', 'styles/tokens.css']);
    expect([...before.keys()].filter((k) => !after.has(k))).toEqual([]);
  }, 1_800_000);
});

describe('AT-18: the design section with no reference (FX-NOTEST)', () => {
  it.runIf(READY)('says what each check lacks, runs design.a11y by axe alone, and offers the «تجهيز فحص» cards', async () => {
    const checks = ['design.tokens.static', 'design.tokens.render', 'design.fonts.static', 'design.fonts.render', 'design.states', 'design.visual', 'design.a11y'];
    const s = await scanVariant(engine, root, 'FX-NOTEST', 'good', { selection: { kind: 'group', instances: checks.map((c) => `${c}@.`) }, timeoutMs: 300_000, folder: 'at18' });
    // Discovery proposed the documentation page as the render target (static docs/).
    expect(s.profile.checks.find((c) => c.instance === 'design.a11y@.')?.referenceValues.renderTarget).toEqual({ discovered: { kind: 'static', dir: 'docs', entry: 'index.html' } });
    const reasons = Object.fromEntries(checks.map((c) => [c, [exec(s.detail, `${c}@.`).outcome, exec(s.detail, `${c}@.`).outcomeReason?.params?.ref ?? exec(s.detail, `${c}@.`).outcomeReason?.key]]));
    expect(reasons).toMatchObject({
      'design.tokens.static': ['missing', 'tokens'],
      'design.tokens.render': ['missing', 'tokens'],
      'design.fonts.static': ['missing', 'fonts'],
      'design.fonts.render': ['missing', 'fonts'],
      'design.states': ['missing', 'states'],
      'design.visual': ['missing', 'probe.reason.noApprovedReference'],
    });
    // design.a11y ran: by axe's rules, never an invented aesthetic finding.
    const a11y = exec(s.detail, 'design.a11y@.');
    expect(['passed', 'warning', 'failed', 'needs_review']).toContain(a11y.outcome);
    expect(s.results.findings.filter((f) => f.checkId !== 'design.a11y' && f.checkId.startsWith('design.'))).toEqual([]);
    expect(s.results.findings.filter((f) => f.checkId === 'design.a11y').every((f) => f.toolRuleId !== null && /^a11y\./.test(f.ruleId))).toBe(true);
    // Outside the index: none of them counts, their conditions are not met.
    expect(s.profile.checks.filter((c) => checks.includes(c.checkId) && c.checkId !== 'design.a11y').every((c) => !c.included)).toBe(true);
    // «تجهيز فحص» cards for what is missing (C-20 source 1).
    for (const c of ['design.tokens.render', 'design.fonts.render', 'design.states']) {
      const created = ok<{ task: TaskRecord }>(await engine.invoke('task.create', { projectId: s.projectId, source: { kind: 'check', checkId: c, outcome: 'missing_configuration' } }));
      expect(created.task.card.type, c).toBe('check_setup');
    }
  }, 900_000);
});

describe('AT-19: interface states with a companion service (FX-WEB-DESIGN)', () => {
  it.runIf(READY)('shows the loading and error states, fails the defect with its image, asks for a missing expectation, and is «تعذّر» when the port is taken', async () => {
    const good = await scanVariant(engine, root, 'FX-WEB-DESIGN', 'good', { include: ['design.states@.'], patch: webDesignPatch(4174), selection: { kind: 'group', instances: ['design.states@.'] }, timeoutMs: 600_000, folder: 'at19-good' });
    const states = exec(good.detail, 'design.states@.');
    expect(states.outcome).toBe('passed');
    const evidence = (checkRunId: string, runId: string, projectId: string) => readdirSync(join(root, 'AYAR', 'evidence', projectId, runId, checkRunId), { recursive: true }).map(String);
    // The service's log is evidence; the service stopped after the check.
    expect(evidence(states.checkRunId, good.detail.run.runId, good.projectId)).toContain('service-preview.log');
    expect(await portTaken(4174)).toBe(false);
    // The loading state (a 2 s delay) and the error state (500) showed what they declare.
    const outcome = JSON.parse(readFileSync(join(root, 'AYAR', 'evidence', good.projectId, good.detail.run.runId, states.checkRunId, 'probe.json'), 'utf8')) as { results: { key: string; expectations: { ok: boolean }[]; mocked: { status: number | null; delayMs: number }[] }[] };
    const loading = outcome.results.filter((r) => r.key.startsWith('loading/'));
    expect(loading.every((r) => r.expectations.every((e) => e.ok) && r.mocked.some((m) => m.delayMs === 2000))).toBe(true);
    expect(outcome.results.filter((r) => r.key.startsWith('error/')).every((r) => r.expectations.every((e) => e.ok) && r.mocked.some((m) => m.status === 500))).toBe(true);

    // The defect: «أخفق» with its image and the expectation that did not hold.
    const bad = await scanVariant(engine, root, 'FX-WEB-DESIGN', 'error-message-missing', { include: ['design.states@.'], patch: webDesignPatch(4174), selection: { kind: 'group', instances: ['design.states@.'] }, timeoutMs: 600_000, folder: 'at19-bad' });
    const failed = exec(bad.detail, 'design.states@.');
    expect(failed.outcome).toBe('failed');
    const f = findingsOf(bad, 'design.states');
    expect(f.map((x) => [x.ruleId, x.location?.path, x.location?.line, x.location?.state])).toEqual([['states.expectation-failed', 'src/i18n.js', 9, 'error']]);
    expect(evidence(failed.checkRunId, bad.detail.run.runId, bad.projectId).some((n) => n.startsWith('captures/error/') && n.endsWith('.png'))).toBe(true);

    // A third state with no expectation, added to the sound one: «ناقص إعداد», the others' details kept.
    const file = join(good.root, 'design/states.json');
    const j = JSON.parse(readFileSync(file, 'utf8')) as { states: unknown[] };
    j.states.push({ id: 'about', path: '/?panel=about', mock: [{ url: '/api/items', status: 200, bodyFile: 'mocks/items.json' }] });
    writeFileSync(file, JSON.stringify(j, null, 2));
    const third = await rerun(good.projectId, ['design.states@.']);
    const t = exec(third.detail, 'design.states@.');
    expect([t.outcome, t.outcomeReason]).toEqual(['missing', { key: 'probe.reason.stateWithoutExpectation', params: { states: 'about' } }]);
    const kept = JSON.parse(readFileSync(join(root, 'AYAR', 'evidence', good.projectId, third.detail.run.runId, t.checkRunId, 'probe.json'), 'utf8')) as { results: { key: string; expectations: { ok: boolean }[] }[] };
    expect(kept.results.filter((r) => r.key.startsWith('default/') || r.key.startsWith('error/')).every((r) => r.expectations.length > 0 && r.expectations.every((e) => e.ok))).toBe(true);

    // The port taken by another program: «تعذّر: الخدمة المرافقة لم تجهز» with its log, never «أخفق».
    const blocker = await listen(4174);
    try {
      const busy = await rerun(good.projectId, ['design.states@.']);
      const b = exec(busy.detail, 'design.states@.');
      expect([b.outcome, b.outcomeReason]).toEqual(['unavailable', { key: 'run.reason.serviceNotReady', params: { service: 'preview' } }]);
      const log = readFileSync(join(root, 'AYAR', 'evidence', good.projectId, busy.detail.run.runId, b.checkRunId, 'service-preview.log'), 'utf8');
      expect(log).toContain('port 4174 is already in use');
    } finally {
      await new Promise<void>((r) => blocker.close(() => r()));
    }
  }, 1_800_000);
});

describe('AT-20: the extension in its host (FX-EXT built)', () => {
  it.runIf(READY && toolchainReady())('loads the sound one, fails the console error and Chromium\'s refusal at their lines, and records the mode', async () => {
    const run = (variant: string) => scanVariant(engine, root, 'FX-EXT', variant, { include: ['beh.ext.host@.'], selection: { kind: 'group', instances: ['beh.ext.host@.'] }, timeoutMs: 600_000, folder: `at20-${variant}` });
    const good = await run('good');
    const host = exec(good.detail, 'beh.ext.host@.');
    expect(host.outcome).toBe('passed');
    const outcome = JSON.parse(readFileSync(join(root, 'AYAR', 'evidence', good.projectId, good.detail.run.runId, host.checkRunId, 'probe.json'), 'utf8')) as { summary: { mode: string; extension: { loaded: boolean; serviceWorker: string | null } } };
    expect(outcome.summary.mode).toBe('headless');
    expect(outcome.summary.extension.loaded).toBe(true);
    expect(outcome.summary.extension.serviceWorker).toMatch(/^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
    const console = await run('options-console-error');
    expect(exec(console.detail, 'beh.ext.host@.').outcome).toBe('failed');
    expect(findingsOf(console, 'beh.ext.host').map((x) => [x.ruleId, x.location?.path, x.location?.line])).toEqual([['ext.console-error', 'src/options.ts', 17]]);
    const csp = await run('manifest-csp');
    expect(exec(csp.detail, 'beh.ext.host@.').outcome).toBe('failed');
    expect(findingsOf(csp, 'beh.ext.host').map((x) => [x.ruleId, x.location?.path, x.location?.line])).toEqual([['ext.load-failed', 'public/manifest.json', 28]]);
    expect(findingsOf(csp, 'beh.ext.host')[0]!.message).toContain("Insecure CSP value \"'unsafe-eval'\"");
  }, 1_800_000);
});

describe('AT-10: honest progress (FR-29)', () => {
  it.runIf(READY && toolchainReady())('gives a ratio for the probe alone, the step for a test runner, and an estimate only with history', async () => {
    const s = await scanVariant(engine, root, 'FX-WEB-DESIGN', 'good', { include: ['design.a11y@.'], patch: webDesignPatch(4175), selection: { kind: 'group', instances: ['design.a11y@.'] }, timeoutMs: 600_000, folder: 'at10' });
    const a11y = exec(s.detail, 'design.a11y@.');
    const progress = engine.events.filter((e) => e.topic === 'check.progress' && (e.payload as { checkRunId: string }).checkRunId === a11y.checkRunId).map((e) => e.payload as { step: number; total: number | null });
    expect(progress.length).toBe(40);
    expect(progress.every((p) => p.total === 40)).toBe(true);
    expect(progress.map((p) => p.step)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    // A test runner's progress has no total: the step and the lines seen.
    const ext = await scanVariant(engine, root, 'FX-EXT', 'good', { selection: { kind: 'group', instances: ['beh.unit@.'] }, timeoutMs: 300_000, folder: 'at10-ext' });
    const unit = exec(ext.detail, 'beh.unit@.');
    expect(engine.events.filter((e) => e.topic === 'check.progress' && (e.payload as { checkRunId: string }).checkRunId === unit.checkRunId).every((e) => (e.payload as { total: number | null }).total === null)).toBe(true);
    // No history, no estimate (the first run's plan); with one, an estimate the UI marks «تقديري».
    expect(ext.detail.plan?.items.find((i) => i.instance === 'beh.unit@.')?.estimateMs).toBeNull();
    expect(s.detail.plan?.items.find((i) => i.instance === 'design.a11y@.')?.estimateMs).toBeNull();
    const second = await plan(engine, ext.projectId, { kind: 'group', instances: ['beh.unit@.'] });
    expect(second.items.find((i) => i.instance === 'beh.unit@.')?.estimateMs).toEqual(expect.any(Number));
  }, 1_800_000);
});

function listen(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => resolve(s));
  });
}

function portTaken(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(true));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(false)));
  });
}

