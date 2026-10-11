// FX-NOTEST in the development build, in Arabic: a JavaScript library of 14 logic units with no tests (13.4):
//   J9 / AT-44 (UI), after the first run (AYAR reads the files at a run): the model checks' needs with their reason
//        from the project's facts, the instructions generated and saved through the save dialog alone, three result
//        files (a valid one, one that claims a pass, a corrupt one) read as claims or refused with their reason —
//        nothing else changed —, a claim proven by re-checking after an outside test, the other left open and counted
//        by the integrity page; three groups that never mix, and no pass said of a model's item anywhere on the page.
//   J4: the plan's «اختبارات الوحدة: ناقص», the run «غير مكتمل», a «اختبار وحدة: …» card from a unit with no test
//        (D-DEV12-05), copied, the test added outside, the card «متحققة» with «قوة الاختبار غير مثبتة».
//   AT-18 (UI, with the probe's browser): the design page with no reference — the board first with what is missing,
//        the folded group with what each check lacks, design.a11y judged by axe.
// axe on the screens visited in both themes, and zero CSP violations.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { passAttributedToModel } from '../../../../packages/engine/src/reports/phrases.ts';
import { APP_DIR, launch, tempDataDir, until, type Launched } from './support.ts';
import { loginShell } from './journey-project.ts';

type Invoke<T> = { ok: boolean; result: T; error?: { code: string } };
type RunRow = { runId: string; kind: string; state: string; displayId: string; purity: unknown };
type CheckRow = { instance: string; outcome: string | null };
type Summary = { aiCheckId: string; displayId: string; template: string; templateVersion: string; status: string };
type Claim = { id: string; displayId: string; status: string; matchedCheckId: string | null };
type Task = { id: string; displayId: string; status: string; card: { location: string | null }; verification: { strength?: string } | null };

const BROWSER = join(homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROBE_READY = existsSync(BROWSER);
const FIXTURES = join(APP_DIR, '../../fixtures');

let t: ReturnType<typeof tempDataDir>;
let run: Launched;
let folder: string;
let projectId: string;
const axeFound: Record<string, string[]> = {};
/** Errors the page threw or logged (none is expected). */
const pageErrors: string[] = [];
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const made: Summary[] = [];

const invoke = <T>(command: string, payload: unknown) =>
  run.page.evaluate(([c, p]) => (window as unknown as { ayar: { invoke: (c: string, p: unknown) => Promise<unknown> } }).ayar.invoke(c, p), [command, payload] as const) as Promise<Invoke<T>>;
const csp = () => run.app.evaluate(() => (globalThis as unknown as { ayarDiagnostics: { cspViolations: { directive: string }[] } }).ayarDiagnostics.cspViolations.map((v) => v.directive));
const button = (name: string | RegExp) => run.page.getByRole('button', { name, exact: typeof name === 'string' });
/** A sheet left open by a failed step closes first, so one failure does not hide the steps after it. */
const nav = async (id: string) => {
  for (let i = 0; i < 3 && (await run.page.locator('dialog[open]').count()); i++) await run.page.keyboard.press('Escape');
  await run.page.locator(`nav [data-nav="${id}"]`).first().click();
  await run.page.waitForTimeout(700);
};
const textOf = async (selector: string) => (await run.page.locator(selector).first().textContent({ timeout: 15_000 })) ?? '';

async function axeBoth(screen: string): Promise<void> {
  await run.page.evaluate(axeSource);
  for (const scheme of ['light', 'dark'] as const) {
    await run.page.emulateMedia({ colorScheme: scheme });
    await run.page.waitForTimeout(150);
    axeFound[`${screen} (${scheme})`] = await run.page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (ctx: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
      return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
    });
  }
  await run.page.emulateMedia({ colorScheme: 'light' });
}

async function runsNow(): Promise<RunRow[]> {
  return (await invoke<{ runs: RunRow[] }>('runs.list', { projectId })).result.runs;
}
async function nextRun(before: readonly RunRow[], timeoutMs = 150_000): Promise<RunRow> {
  const seen = new Set(before.map((r) => r.runId));
  const got = await until(runsNow, (rs) => rs.some((r) => !seen.has(r.runId) && ['finished', 'interrupted'].includes(r.state)), timeoutMs);
  const r = got.find((x) => !seen.has(x.runId) && ['finished', 'interrupted'].includes(x.state));
  if (!r) throw new Error(`no new run finished: ${JSON.stringify(got.slice(0, 3))}`);
  return r;
}
const checksOf = async (runId: string) => (await invoke<{ checks: CheckRow[] }>('run.get', { runId })).result.checks;
const tasks = async () => (await invoke<{ tasks: Task[] }>('tasks.list', { projectId })).result.tasks;
const aiList = async () => (await invoke<{ instructions: Summary[]; claims: Claim[]; proven: unknown[] }>('aiChecks.list', { projectId })).result;

async function approveAll(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const p = await invoke<{ pending: { id: string; items: { approvable: boolean; approveAlone: boolean; instance: string }[] } }>('profile.get', { projectId });
    const items = p.result.pending.items.filter((x) => x.approvable);
    if (!items.length) return;
    const alone = items.find((x) => x.approveAlone);
    await invoke('profile.approve', { projectId, changeSetId: p.result.pending.id, ...(alone ? { instances: [alone.instance] } : {}) });
  }
}

beforeAll(async () => {
  t = tempDataDir();
  folder = execFileSync(process.execPath, [join(FIXTURES, 'tools/materialize.mjs'), 'FX-NOTEST', 'good', join(t.root, 'notest')], { encoding: 'utf8' }).trim().split('\n').pop()!;
  run = await launch(t.dataDir);
  run.page.on('pageerror', (e) => pageErrors.push(`${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`));
  run.page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });
  await invoke('settings.set', { key: 'ui.language', value: 'ar' });
  await invoke('settings.set', { key: 'environment.shell', value: loginShell(t.root) });
  await invoke('settings.set', { key: 'run.notify', value: false });
  if (PROBE_READY) {
    // The probe's browser, as «ثبّت متصفح المسبار» registers it (the same pinned build, probe.e2e.ts).
    const db = new DatabaseSync(join(t.dataDir, 'ayar.db'));
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      db.prepare("INSERT INTO data_assets (id, kind, key, version_or_date, path, size, updated_at) VALUES ('dat_e2e_browser', 'browser', 'chromium', '156.0.8078.4', ?, 0, ?)").run(BROWSER, new Date().toISOString());
    } finally {
      db.close();
    }
  }
  await run.page.reload();
  await run.page.waitForLoadState('load');
  await run.app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [f] });
  }, folder);
  await button('اختر مجلدًا…').click();
  await button('راجع ملف المعايير').waitFor({ timeout: 30_000 });
  projectId = (await invoke<{ projects: { id: string }[] }>('project.list', {})).result.projects[0]!.id;
  await approveAll();
  await run.page.reload();
  await run.page.waitForLoadState('load');
  await run.page.locator('[data-testid="projects-table"]').getByRole('button', { name: 'افتح' }).first().click();
  await run.page.waitForTimeout(1500);
}, 120_000);
afterAll(async () => {
  await run?.app.close();
  t?.cleanup();
});

describe('J4: a project with no tests, the plan and the run', () => {
  it('shows «ناقص» for the unit tests in the plan, and the run ends «غير مكتمل»', async () => {
    await nav('fullScan');
    await run.page.waitForSelector('[data-testid="plan-table"]', { timeout: 30_000 });
    expect(await run.page.locator('tr[data-instance^="beh.unit@"]').first().textContent()).toMatch(/ناقص|يحتاج تجهيزًا/);
    const before = await runsNow();
    await run.page.locator('.page').getByRole('button', { name: 'ابدأ الفحص الكامل' }).last().click();
    const r = await nextRun(before, 240_000);
    expect((await checksOf(r.runId)).find((c) => c.instance.startsWith('beh.unit@'))?.outcome).toBe('missing');
    await run.page.waitForSelector('[data-testid="results"]', { timeout: 15_000 });
    expect(await textOf('[data-testid="results"]')).toContain('غير مكتمل');
  }, 300_000);

});

describe('J9 and AT-44 (UI), first part: the needs and the instructions', () => {
  it('names why each need applies from the project\'s facts, folds what does not apply, and generates only what has its inputs', async () => {
    await nav('modelChecks');
    await run.page.waitForSelector('[data-testid="model-needs"]', { timeout: 15_000 });
    await run.page.waitForTimeout(800);
    const needs = await textOf('[data-testid="model-needs"]');
    expect(needs).toMatch(/14 ملف منطق/);
    // What does not apply is folded, with its reason inside.
    const fold = run.page.locator('[data-testid="model-needs"] .folded button.fold');
    if (await fold.count()) expect(await fold.getAttribute('aria-expanded')).toBe('false');
    await axeBoth('16.1 · فحوص النموذج');
  });

  it('generates instructions that name the project\'s files, the rules, the output and its boundaries, saved through the save dialog alone', async () => {
    const ready = run.page.locator('[data-testid="model-needs"] .need-card[data-variant="ready"]');
    const count = Math.min(3, await ready.count());
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await ready.nth(i).getByRole('button', { name: 'ولّد التعليمات' }).click();
      await until(async () => (await aiList()).instructions.length, (n) => n >= i + 1, 10_000);
    }
    made.push(...(await aiList()).instructions);
    expect(made.map((i) => i.template)).toContain('ai.logic-review');
    const logic = made.find((i) => i.template === 'ai.logic-review')!;
    const full = await invoke<{ text: string; suggestedPath: string }>('aiChecks.get', { aiCheckId: logic.aiCheckId });
    expect(full.result.text).toContain('src/money.js');
    expect(full.result.text).toContain('"schema": "ai-result/1"');
    expect(full.result.text).toContain('<<<AYAR-DATA');
    expect(full.result.text).toContain('لا تعدّل شيئًا في هذا الفحص');
    expect(passAttributedToModel(full.result.text)).toEqual([]);
    // Nothing was written to the project before the save dialog.
    expect(existsSync(join(folder, '.ayar'))).toBe(false);
    const page = await textOf('[data-testid="model-checks"]');
    expect(page).toContain('تعليمات مولّدة، لم يُنفذ شيء');
    expect(page).toContain('بنموذجك');
    // «احفظ في المشروع…» through the save dialog (stubbed: the path the user would choose).
    mkdirSync(join(folder, '.ayar', 'ai-checks'), { recursive: true });
    const dest = join(folder, '.ayar', 'ai-checks', `${made.at(-1)!.displayId}.md`);
    await run.app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: p });
    }, dest);
    await run.page.locator('[data-testid="model-needs"]').getByRole('button', { name: 'احفظ في المشروع…' }).first().click();
    await until(() => Promise.resolve(existsSync(dest)), (x) => x, 10_000);
    expect(existsSync(dest)).toBe(true);
    await axeBoth('16.1 · فحوص النموذج — التعليمات');
  }, 60_000);
});

describe('J4: the cards of the units with no test', () => {
  it('offers a «اختبار وحدة» card for each logic unit with no test, and the card lands in the tasks', async () => {
    await nav('behavior');
    await run.page.waitForSelector('[data-testid="panel-gaps"]', { timeout: 15_000 });
    expect(await run.page.locator('[data-testid="panel-gaps"] tbody tr').count()).toBe(14);
    await axeBoth('13 · السلوك — وحدات بلا اختبار');
    const row = run.page.locator('[data-testid="panel-gaps"] tr[data-file="src/money.js"]');
    await row.getByRole('button', { name: 'أنشئ بطاقة' }).click();
    const card = await until(tasks, (ts) => ts.some((x) => (x.card.location ?? '').includes('src/money.js')), 10_000);
    expect(card.length).toBe(1);
    expect(await row.getByRole('button', { name: 'أنشئ بطاقة' }).isDisabled()).toBe(true);
    await nav('tasks');
    await run.page.waitForSelector('[data-testid="tasks"] .card-item', { timeout: 15_000 });
    const item = run.page.locator('.card-item').filter({ hasText: 'src/money.js' }).first();
    expect(await item.textContent()).toContain('اختبار وحدة');
    await item.click();
    await run.app.evaluate(({ clipboard: c }) => c.writeText(''));
    await run.page.locator('[data-testid="tasks"] .copy-bar').getByRole('button', { name: 'انسخ للنموذج' }).click();
    const copied = await until(() => run.app.evaluate(({ clipboard: c }) => c.readText()), (x) => x.length > 0, 10_000);
    expect(copied).toContain('src/money.js');
    expect((await until(tasks, (ts) => ts[0]?.status === 'copied', 10_000))[0]?.status).toBe('copied');
    await axeBoth('17.1 · المهام — بطاقة اختبار وحدة');
  }, 60_000);

  it('turns the card «متحققة» with «قوة الاختبار غير مثبتة» once a re-check proves a new passing test of the unit', async () => {
    // The outside work: a node:test file for the unit, and the script that runs it.
    mkdirSync(join(folder, 'test'), { recursive: true });
    writeFileSync(
      join(folder, 'test', 'money.test.js'),
      [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "import { fromMinor, splitEvenly, toMinor } from '../src/money.js';",
        '',
        "test('toMinor and fromMinor round-trip', () => assert.equal(fromMinor(toMinor(12.34)), 12.34));",
        "test('splitEvenly keeps the total', () => assert.deepEqual(splitEvenly(100, 3), [34, 33, 33]));",
        "test('splitEvenly refuses zero parts', () => assert.throws(() => splitEvenly(100, 0), RangeError));",
        '',
      ].join('\n'),
    );
    const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as Record<string, unknown>;
    writeFileSync(join(folder, 'package.json'), `${JSON.stringify({ ...pkg, scripts: { test: 'node --test' } }, null, 2)}\n`);
    await nav('overview');
    await button('أعد القراءة').click();
    await button('راجع ملف المعايير').waitFor({ timeout: 60_000 });
    await button('راجع ملف المعايير').click();
    await run.page.waitForTimeout(800);
    await nav('projectConfiguration');
    await run.page.waitForSelector('[data-testid="config"]', { timeout: 15_000 });
    await run.page.getByRole('tab', { name: 'الاعتماد' }).click();
    if (await button('اعتمد الكل').isEnabled().catch(() => false)) await button('اعتمد الكل').click();
    await approveAll();
    await nav('behavior');
    const before = await runsNow();
    await button('شغّل القسم').click();
    const r = await nextRun(before);
    expect((await checksOf(r.runId)).find((c) => c.instance.startsWith('beh.unit@'))?.outcome).toBe('passed');
    const verified = await until(tasks, (ts) => ts[0]?.status === 'verified', 15_000);
    expect(verified[0]?.status).toBe('verified');
    expect(verified[0]?.verification?.strength).toBe('unproven');
    await nav('tasks');
    const item = run.page.locator('.card-item').filter({ hasText: 'src/money.js' }).first();
    await until(() => item.textContent(), (x) => (x ?? '').includes('قوة الاختبار غير مثبتة'), 10_000);
    expect(await item.textContent()).toContain('قوة الاختبار غير مثبتة');
  }, 240_000);
});

describe('J9 and AT-44 (UI), second part: the model\'s result files, the claims and their proof', () => {
  it('reads a valid file as claims, refuses one that claims a pass and a corrupt one, and changes nothing else', async () => {
    const dir = join(folder, '.ayar', 'ai-results');
    mkdirSync(dir, { recursive: true });
    const logic = made.find((i) => i.template === 'ai.logic-review')!;
    const file = (i: Summary, notes: unknown[]) => ({ schema: 'ai-result/1', id: i.displayId, template: i.template, templateVersion: i.templateVersion, model: null, createdAt: '2026-10-11T10:00:00.000Z', notes });
    const notes = [
      { location: { path: 'src/percent.js', line: 4 }, kind: 'suspicion', severity: 'medium', summary: 'percentOf يعيد صفرًا حين يكون الكل صفرًا فيخفي القسمة على الصفر', evidence: 'return whole === 0 ? 0 : (part / whole) * 100;', localCheck: 'beh.unit' },
      { location: null, kind: 'question', severity: null, summary: 'هل يُقبل مبلغ سالب في splitEvenly؟', evidence: null, localCheck: null },
    ];
    const runsBefore = JSON.stringify(await runsNow());
    const tasksBefore = JSON.stringify((await tasks()).map((x) => x.status));
    const target = join(dir, `${logic.displayId}.json`);
    const claims = run.page.locator('[data-testid="model-claims"]');
    /** The model's file as it arrives, then the page read again (it reads .ayar/ai-results/ when it opens). */
    const arrive = async (content: string) => {
      writeFileSync(target, content);
      await nav('overview');
      await nav('modelChecks');
      await run.page.waitForSelector('[data-testid="model-claims"]', { timeout: 15_000 });
      await run.page.waitForTimeout(1000);
    };
    // A file that claims a pass is refused with its field; a corrupt one too; neither keeps a note.
    await arrive(JSON.stringify(file(logic, notes.map((n) => ({ ...n, status: 'passed' }))), null, 2));
    expect(await claims.textContent()).toMatch(/يدّعي اجتيازًا/);
    expect((await aiList()).claims).toHaveLength(0);
    await axeBoth('16.3 · فحوص النموذج — ملف مرفوض');
    await arrive('{ "schema": "ai-result/1", "notes": [');
    expect(await claims.textContent()).toMatch(/ملف تالف/);
    expect((await aiList()).claims).toHaveLength(0);
    // The valid file: two claims, each «ادعاء نموذج».
    await arrive(JSON.stringify(file(logic, notes), null, 2));
    await until(async () => (await aiList()).claims.length, (n) => n === 2, 15_000);
    await run.page.waitForTimeout(800);
    expect(await claims.locator('.claim-row').count()).toBe(2);
    expect(await claims.locator('.claim-row').first().textContent()).toContain('ادعاء نموذج');
    // The three groups never mix: no result badge among the needs and the claims, and no pass said of a model's item.
    expect(await run.page.locator('[data-testid="model-needs"] [data-result], [data-testid="model-claims"] [data-result]').count()).toBe(0);
    expect(passAttributedToModel(await run.page.locator('[data-testid="model-checks"]').innerText())).toEqual([]);
    // Nothing else changed: no run, no karat, no card.
    expect(JSON.stringify(await runsNow())).toBe(runsBefore);
    expect(JSON.stringify((await tasks()).map((x) => x.status))).toBe(tasksBefore);
    await axeBoth('16.1 · فحوص النموذج — الادعاءات');
  }, 90_000);

  it('proves the claim a local check can prove after an outside test, and leaves the other open for the integrity page', async () => {
    writeFileSync(
      join(folder, 'test', 'percent.test.js'),
      ["import assert from 'node:assert/strict';", "import { test } from 'node:test';", "import { percentOf } from '../src/percent.js';", '', "test('percentOf refuses a zero whole', () => assert.throws(() => percentOf(1, 0)));", ''].join('\n'),
    );
    // The claims arrived since the project was last read: the page read it again, and the claims check now applies.
    await until(() => invoke<{ checks: { checkId: string; applicable: boolean }[] }>('profile.get', { projectId }), (r) => r.result.checks.some((c) => c.checkId === 'integ.model-claims' && c.applicable), 60_000);
    await approveAll();
    await nav('overview');
    await nav('modelChecks');
    await run.page.waitForSelector('[data-testid="model-claims"] .claim-row', { timeout: 15_000 });
    const before = await runsNow();
    await run.page.locator('[data-testid="model-claims"] .claim-row').filter({ hasText: 'percentOf' }).getByRole('button', { name: 'أثبِت بإعادة الفحص' }).click();
    const r = await nextRun(before);
    expect((await checksOf(r.runId)).map((c) => c.instance.split('@')[0]).sort()).toEqual(['beh.unit', 'integ.model-claims']);
    const after = await until(aiList, (l) => l.claims.some((c) => c.status === 'proven'), 15_000);
    expect(after.claims.filter((c) => c.status === 'proven')).toHaveLength(1);
    expect(after.claims.filter((c) => c.status !== 'proven')).toHaveLength(1);
    await nav('modelChecks');
    await run.page.waitForSelector('[data-testid="model-proven"]', { timeout: 15_000 });
    expect(await textOf('[data-testid="model-proven"]')).toMatch(/AYR-/);
    await axeBoth('16.1 · فحوص النموذج — ما ثبت');
    await nav('integrity');
    await run.page.waitForSelector('[data-testid="panel-claims"]', { timeout: 15_000 });
    expect(await textOf('[data-testid="integrity-blockers"]')).toMatch(/يمنع حكم ‹نقي›: /);
  }, 180_000);
});

describe.runIf(PROBE_READY)('AT-18 (UI): the design page with no reference', () => {
  it('shows the reference board with what is missing, folds the checks with what each lacks, and runs design.a11y by axe', async () => {
    await nav('design');
    await run.page.waitForSelector('[data-testid="section"][data-section="design"]', { timeout: 15_000 });
    // No included check lacks a reference here (they wait in the folded group), so the board folds behind «المرجع».
    if (!(await run.page.locator('[data-testid="panel-reference"]').count())) await run.page.getByRole('button', { name: 'المرجع' }).click();
    await run.page.waitForSelector('[data-testid="panel-reference"]', { timeout: 15_000 });
    expect(await textOf('[data-testid="panel-reference"]')).toMatch(/عرّف…/);
    await axeBoth('10.1 · التصميم — لوحة المرجع');
    const before = await runsNow();
    await button('شغّل القسم').click();
    const r = await nextRun(before, 240_000);
    const a11y = (await checksOf(r.runId)).find((c) => c.instance.startsWith('design.a11y@'));
    expect(['passed', 'warning', 'failed', 'needs_review']).toContain(a11y?.outcome);
    await nav('design');
    await run.page.waitForSelector('[data-testid="section"][data-section="design"]', { timeout: 15_000 });
    await run.page.waitForTimeout(1000);
    // The checks that lack a reference wait folded, each with what it lacks (not included, or not applicable).
    const folded: string[] = [];
    for (const id of ['section-optional', 'section-not-applicable']) {
      const group = run.page.locator(`[data-testid="${id}"]`);
      if (!(await group.count())) continue;
      const fold = group.locator('button.fold');
      if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
      await group.locator('tbody tr, li').first().waitFor({ timeout: 5000 });
      folded.push(...(await group.locator('tbody tr, li').allTextContents()));
    }
    const lacking = folded.filter((x) => /design\.(tokens|fonts|states|visual)/.test(x));
    if (!lacking.length) console.log('design folded groups', folded);
    expect(lacking.length).toBeGreaterThan(0);
    await axeBoth('10 · التصميم بعد التشغيل');
  }, 300_000);
});

describe('accessibility and CSP', () => {
  it('axe: no critical or serious problem on any screen visited, in light and dark', () => {
    const problems = Object.fromEntries(Object.entries(axeFound).filter(([, v]) => v.length));
    if (Object.keys(problems).length) console.log('axe', JSON.stringify(problems, null, 1));
    expect(problems).toEqual({});
  });

  it('records zero CSP violations', async () => {
    expect(await csp()).toEqual([]);
  });

  it('throws no error in the page', () => {
    if (pageErrors.length) console.log('page errors', pageErrors.join('\n---\n'));
    expect(pageErrors).toEqual([]);
  });
});
