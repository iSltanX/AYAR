// The screens of DEV-12 on the development build, in Arabic, one app for the whole file, on the DEV-11 journey's
// project (Node only) with a local dependency not yet installed and a Git head read from files (13.4):
//   J6 / AT-06 (UI): a check «ناقص» for its dependencies, «ثبّت التبعيات» → the setup panel → its preview → done, then
//        «أعد غير المكتمل» inside the same round (AT-08: each re-run linked to the run before it).
//   J1 (end) / J7 / AT-22 (UI): an outside fix, «أعد فحص المحدد» from the findings, then the comparison with its notes.
//   AT-08 (rest): a section from its page, a saved group from the Run menu.
//   J5: a check cancelled from the monitor («يُلغى» then «أُلغي») and a hung one reaching its timeout, nothing left.
//   AT-24 / AT-46 (UI): a silenced test → «يحتاج مراجعة» → a review accepted → «اجتاز (بمراجعة)», the review expired
//        by a change in its scope, the integrity page's four panels and its «يمنع حكم ‹نقي›» line, no section karat.
//   J8: a change context → the advisor's checks and cards with their reasons → cards made → «شغّل هذه».
//   J2 / AT-05 (UI): a changed test script read again → only the affected check asks, the dangerous command alone.
//   The section pages 9–14, the runs (18.1) with their commit, the tools (AT-35 part), the settings with «حول»
//   (D-DEV12-02), the language switched and kept after a reload (AT-28 part), the configuration's eight tabs —
//   axe on every screen in both themes, and zero CSP violations.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, tempDataDir, until, type Launched } from './support.ts';
import { CUSTOM_CHECKS, loginShell, makeJourneyProject } from './journey-project.ts';

type Invoke<T> = { ok: boolean; result: T; error?: { code: string } };
type RunRow = { runId: string; kind: string; state: string; displayId: string; commit: string | null; purity: { roundId: string | null } | null };
type CheckRow = { instance: string; state: string; outcome: string | null; previousCheckRunId: string | null; reviewId: string | null; checkRunId: string };

let t: ReturnType<typeof tempDataDir>;
let run: Launched;
let folder: string;
let projectId: string;
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const axeFound: Record<string, string[]> = {};
/** Errors the page threw or logged (none is expected). */
const pageErrors: string[] = [];
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const runs: Record<string, RunRow> = {};

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
const processes = (marker: string) => {
  try {
    return execFileSync('/bin/ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n').filter((l) => l.includes(marker));
  } catch {
    return [];
  }
};

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
/** The run that appears after `before`, once it is over. */
async function nextRun(before: readonly RunRow[], timeoutMs = 120_000): Promise<RunRow> {
  const seen = new Set(before.map((r) => r.runId));
  const got = await until(runsNow, (rs) => rs.some((r) => !seen.has(r.runId) && ['finished', 'interrupted'].includes(r.state)), timeoutMs);
  const r = got.find((x) => !seen.has(x.runId) && ['finished', 'interrupted'].includes(x.state));
  if (!r) throw new Error(`no new run finished: ${JSON.stringify(got.slice(0, 3))}`);
  return r;
}
/** Approves what waits for approval (the dangerous ones by themselves), as «اعتمد الكل» then «اعتمد هذا وحده». */
async function approveAll(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const p = await invoke<{ pending: { id: string; items: { approvable: boolean; approveAlone: boolean; instance: string }[] } }>('profile.get', { projectId });
    const items = p.result.pending.items.filter((x) => x.approvable);
    if (!items.length) return;
    const alone = items.find((x) => x.approveAlone);
    await invoke('profile.approve', { projectId, changeSetId: p.result.pending.id, ...(alone ? { instances: [alone.instance] } : {}) });
  }
}
async function checksOf(runId: string): Promise<CheckRow[]> {
  return (await invoke<{ checks: CheckRow[] }>('run.get', { runId })).result.checks;
}
/** Opens a run's results from the overview's table. */
async function openRun(r: RunRow): Promise<void> {
  await nav('overview');
  await run.page.locator(`tr[data-run="${r.runId}"]`).click();
  await until(async () => (await run.page.getAttribute('[data-testid="results"]', 'data-run').catch(() => null)) ?? '', (id) => id === r.displayId, 15_000);
}
/** The next native menu picks the item with this label (a native menu cannot be clicked from the page). */
async function pickFromNextMenu(label: string): Promise<void> {
  await run.app.evaluate(({ Menu }, l) => {
    type Popup = (this: Electron.Menu, o?: Electron.PopupOptions) => void;
    const original = Object.getOwnPropertyDescriptor(Menu.prototype, 'popup');
    const once: Popup = function (o) {
      if (original) Object.defineProperty(Menu.prototype, 'popup', original);
      (globalThis as unknown as { __lastMenu: string[] }).__lastMenu = this.items.map((i) => i.label);
      const item = this.items.find((i) => i.label === l);
      if (item) (item.click as (this: Electron.MenuItem) => void).call(item);
      o?.callback?.();
    };
    Reflect.set(Menu.prototype, 'popup', once);
  }, label);
}
const lastMenu = () => run.app.evaluate(() => (globalThis as unknown as { __lastMenu?: string[] }).__lastMenu ?? []);

beforeAll(async () => {
  t = tempDataDir();
  folder = makeJourneyProject(t.root);
  // A local dependency, installed by «ثبّت التبعيات» without the network (J6), and npm kept offline and quiet.
  mkdirSync(join(folder, 'vendor', 'helper'), { recursive: true });
  writeFileSync(join(folder, 'vendor', 'helper', 'package.json'), `${JSON.stringify({ name: 'ayar-helper', version: '1.0.0', type: 'module', main: 'index.js' }, null, 2)}\n`);
  writeFileSync(join(folder, 'vendor', 'helper', 'index.js'), 'export const helper = () => 1;\n');
  writeFileSync(join(folder, '.npmrc'), 'offline=true\naudit=false\nfund=false\nupdate-notifier=false\n');
  const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as Record<string, unknown>;
  writeFileSync(join(folder, 'package.json'), `${JSON.stringify({ ...pkg, dependencies: { 'ayar-helper': 'file:./vendor/helper' } }, null, 2)}\n`);
  // Its lock file, so the setup is `npm ci` and writes nothing the project tracks (J6: «الحالة لم تتغير»).
  const bin = dirname(process.execPath);
  execFileSync(join(bin, 'npm'), ['install', '--package-lock-only', '--ignore-scripts'], { cwd: folder, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: process.env.HOME ?? '' }, stdio: 'ignore' });
  // A Git head read from the files (E-16), for the runs' «الالتزام» (18.1).
  mkdirSync(join(folder, '.git', 'refs', 'heads'), { recursive: true });
  writeFileSync(join(folder, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(join(folder, '.git', 'refs', 'heads', 'main'), `${COMMIT}\n`);
  writeFileSync(join(folder, '.git', 'config'), '[core]\n\trepositoryformatversion = 0\n');
  run = await launch(t.dataDir);
  run.page.on('pageerror', (e) => pageErrors.push(`${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`));
  run.page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });
  await invoke('settings.set', { key: 'ui.language', value: 'ar' });
  await invoke('settings.set', { key: 'environment.shell', value: loginShell(t.root) });
  await invoke('settings.set', { key: 'run.notify', value: false });
  await run.page.reload();
  await run.page.waitForLoadState('load');
  await run.app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [f] });
  }, folder);
  await button('اختر مجلدًا…').click();
  await button('راجع ملف المعايير').waitFor({ timeout: 30_000 });
  projectId = (await invoke<{ projects: { id: string }[] }>('project.list', {})).result.projects[0]!.id;
  await invoke('profile.update', { projectId, patch: { custom: CUSTOM_CHECKS } });
  const p = await invoke<{ pending: { id: string } }>('profile.get', { projectId });
  await invoke('profile.approve', { projectId, changeSetId: p.result.pending.id });
  await run.page.reload();
  await run.page.waitForLoadState('load');
  await run.page.locator('[data-testid="projects-table"]').getByRole('button', { name: 'افتح' }).first().click();
  await run.page.waitForTimeout(1500);
}, 120_000);
afterAll(async () => {
  await run?.app.close();
  t?.cleanup();
});

describe('J6 and AT-06 (UI): the full scan, its setup, and the incomplete re-run inside the round', () => {
  it('runs the full scan from its plan, with the commit it started on (18.1), and the unit tests «ناقص» for their dependencies', async () => {
    const before = await runsNow();
    await nav('fullScan');
    await run.page.waitForSelector('[data-testid="plan-table"]', { timeout: 30_000 });
    // AT-46 part: a cost tag on every check of the plan, «محلي» for the most, never «مجاني».
    const plan = await textOf('[data-testid="plan-table"]');
    expect(plan).toContain('محلي');
    expect(plan).not.toContain('مجاني');
    await run.page.locator('.page').getByRole('button', { name: 'ابدأ الفحص الكامل' }).last().click();
    const r = await nextRun(before, 150_000);
    runs.full1 = r;
    expect(r.kind).toBe('full');
    expect(r.commit).toBe(COMMIT);
    const unit = (await checksOf(r.runId)).find((c) => c.instance.startsWith('beh.unit@'));
    expect(unit?.outcome).toBe('missing');
    await run.page.waitForSelector('[data-testid="results"]', { timeout: 15_000 });
  }, 180_000);

  it('«ثبّت التبعيات» leads to the setup panel; its preview shows the command and where it writes, and nothing runs before «نفّذ…»', async () => {
    const step = run.page.locator('.for-you .group').filter({ hasText: 'تعالجها مباشرة' }).getByRole('button', { name: /^(ثبّت التبعيات|جهّز…)$/ });
    await step.first().click();
    await run.page.waitForSelector('[data-testid="plan-table"]', { timeout: 20_000 });
    await button(/^جهّز الناقص/).click();
    const panel = run.page.locator('dialog[open]');
    await panel.waitFor();
    await axeBoth('5.2 · لوحة التجهيز');
    const action = panel.locator('li.action').filter({ hasText: 'ثبّت التبعيات' }).first();
    await action.getByRole('button', { name: 'نفّذ…' }).click();
    const preview = run.page.locator('dialog[open]');
    await until(() => preview.textContent(), (x) => /npm ci/.test(x ?? ''), 10_000);
    expect(await preview.textContent()).toMatch(/node_modules/);
    expect(existsSync(join(folder, 'node_modules'))).toBe(false);
    await axeBoth('22.4 · معاينة التجهيز');
    await preview.getByRole('button', { name: 'نفّذ…' }).click();
    await until(() => Promise.resolve(existsSync(join(folder, 'node_modules', 'ayar-helper'))), (x) => x, 60_000);
    expect(existsSync(join(folder, 'node_modules', 'ayar-helper'))).toBe(true);
    await run.page.locator('dialog[open]').getByRole('button', { name: 'أغلق' }).click();
  }, 120_000);

  it('re-runs what was incomplete in the same round, each check linked to the one before it (AT-08)', async () => {
    await openRun(runs.full1!);
    const before = await runsNow();
    await button('أعد غير المكتمل').click();
    const sheet = run.page.locator('dialog[open]');
    await sheet.waitFor();
    await axeBoth('22.3 · نافذة الإعادة');
    await sheet.getByRole('button', { name: /^أعد \(\d+\)$/ }).click();
    const r = await nextRun(before, 150_000);
    runs.incomplete = r;
    expect(r.kind).toBe('rerun_incomplete');
    expect(r.purity?.roundId).toBe(runs.full1!.purity?.roundId);
    const checks = await checksOf(r.runId);
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((c) => c.previousCheckRunId !== null)).toBe(true);
    expect(checks.find((c) => c.instance.startsWith('beh.unit@'))?.outcome).toBe('failed');
  }, 180_000);
});

describe('J1 (end), J7 and AT-22: an outside fix, re-checked from the findings, then compared', () => {
  it('re-checks the selected finding after the fix, and the failure is gone', async () => {
    // The outside fix (a model or the user): the expired-token test now expects what the code does.
    const file = join(folder, 'test', 'a-fast.test.js');
    writeFileSync(file, readFileSync(file, 'utf8').replace("assert.equal(add(2, 2), 5, 'expired token ' + token + ' was accepted')", 'assert.equal(add(2, 2), 4)'));
    await openRun(runs.incomplete!);
    await run.page.getByRole('tab', { name: 'الاكتشافات' }).click();
    const row = run.page.locator('.finding-row').filter({ hasText: 'beh.unit' }).first();
    await row.getByRole('checkbox').check();
    const before = await runsNow();
    await button(/^أعد فحص المحدد/).click();
    const r = await nextRun(before, 120_000);
    runs.recheck = r;
    expect((await checksOf(r.runId)).find((c) => c.instance.startsWith('beh.unit@'))?.outcome).toBe('passed');
  }, 150_000);

  it('lists the runs with their commit, then compares two of them with the comparability notes', async () => {
    await nav('runs');
    await run.page.waitForSelector('[data-testid="runs"] tbody tr[data-run]', { timeout: 15_000 });
    expect(await textOf('[data-testid="runs"] tbody')).toContain(COMMIT.slice(0, 7));
    await axeBoth('18.1 · التشغيلات');
    for (const r of [runs.full1!, runs.recheck!]) await run.page.locator(`[data-testid="runs"] tr[data-run="${r.displayId}"]`).getByRole('checkbox').check();
    await button(/^قارن المحددين/).click();
    await run.page.waitForSelector('[data-testid="compare"]', { timeout: 15_000 });
    await run.page.waitForTimeout(1000);
    const page = await textOf('[data-testid="compare"]');
    expect(page).toMatch(/ملاحظات قابلية المقارنة/);
    // A different scope is never described as better (AT-22).
    expect(page).not.toMatch(/تحسّن|تحسن/);
    await axeBoth('18.2 · المقارنة');
  }, 60_000);
});

describe('AT-08: the other run modes', () => {
  it('runs a section from its page', async () => {
    await nav('custom');
    await run.page.waitForSelector('[data-testid="section"][data-section="custom"]', { timeout: 15_000 });
    const before = await runsNow();
    await button('شغّل القسم').click();
    const r = await nextRun(before);
    expect(r.kind).toBe('section');
  }, 150_000);

  it('offers a saved group in the Run menu and runs it', async () => {
    await invoke('groups.save', { projectId, name: 'المخصصة السريعة', instanceKeys: ['custom.failfast@.'] });
    await nav('overview');
    const before = await runsNow();
    await pickFromNextMenu('المخصصة السريعة');
    await run.page.getByRole('button', { name: 'قائمة «شغّل»' }).click();
    const r = await nextRun(before);
    expect(r.kind).toBe('group');
    expect((await checksOf(r.runId)).map((c) => c.instance)).toEqual(['custom.failfast@.']);
    expect(await lastMenu()).toEqual(expect.arrayContaining(['الفحص الكامل', 'أعد الفاشل', 'أعد غير المكتمل', 'المجموعات المحفوظة', 'المخصصة السريعة']));
  }, 150_000);
});

describe('J5: cancelling and the timeout', () => {
  it('cancels a running check from the monitor: «يُلغى», then «أُلغي», and nothing of it is left', async () => {
    const stoppable = { argv: ['sh', '-c', 'echo ayar-e2e-stoppable; trap "echo stopping; sleep 2; exit 143" TERM; i=0; while [ $i -lt 40 ]; do echo "step $i"; sleep 1; i=$((i+1)); done'], cwd: '.', timeoutMin: 2, success: { exitCode: 0 } };
    const hang = { argv: ['sh', '-c', 'echo ayar-e2e-hang; sleep 600'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } };
    await invoke('profile.update', { projectId, patch: { custom: { stoppable, hang } } });
    const p = await invoke<{ pending: { id: string } }>('profile.get', { projectId });
    await invoke('profile.approve', { projectId, changeSetId: p.result.pending.id });
    await nav('overview');
    await nav('custom');
    await run.page.locator('tr[data-instance="custom.stoppable@."]').getByRole('button', { name: 'شغّل' }).click();
    const row = run.page.locator('.check-row').filter({ hasText: 'custom.stoppable' }).first();
    await until(() => row.getAttribute('data-status').catch(() => null), (s) => s === 'running', 20_000);
    await run.page.waitForTimeout(1500);
    await row.getByRole('button', { name: 'ألغِ' }).click();
    const seen = new Set<string>();
    await until(
      async () => {
        const s = await row.getAttribute('data-status', { timeout: 500 }).catch(() => null);
        const txt = (await row.textContent({ timeout: 500 }).catch(() => null)) ?? '';
        if (s) seen.add(s);
        if (txt.includes('يُلغى')) seen.add('يُلغى');
        return seen;
      },
      (x) => x.has('يُلغى') || x.has('cancelled'),
      15_000,
    );
    const last = (await runsNow())[0]!;
    await until(() => checksOf(last.runId), (cs) => cs.every((c) => c.outcome !== null), 20_000);
    expect((await checksOf(last.runId)).find((c) => c.instance === 'custom.stoppable@.')?.outcome).toBe('cancelled');
    expect(seen.has('يُلغى') || seen.has('cancelling')).toBe(true);
    await until(() => Promise.resolve(processes('ayar-e2e-stoppable')), (x) => x.length === 0, 10_000);
    expect(processes('ayar-e2e-stoppable')).toEqual([]);
  }, 90_000);

  it('ends a hung check at its timeout with «انتهت المهلة», and leaves no process', async () => {
    await nav('custom');
    const before = await runsNow();
    await run.page.locator('tr[data-instance="custom.hang@."]').getByRole('button', { name: 'شغّل' }).click();
    const r = await nextRun(before, 150_000);
    expect((await checksOf(r.runId)).find((c) => c.instance === 'custom.hang@.')?.outcome).toBe('timed_out');
    await run.page.waitForSelector('[data-testid="results"]', { timeout: 15_000 });
    expect(await run.page.locator('[data-testid="results"]').textContent()).toContain('انتهت المهلة');
    expect(processes('ayar-e2e-hang')).toEqual([]);
  }, 180_000);
});

describe('AT-24 and AT-46 (UI): a silenced test, its review, and the integrity page', () => {
  it('turns a silenced test into «يحتاج مراجعة» on the next full round, linked to its check', async () => {
    // Back to the journey's custom checks: the cancel and timeout checks leave the profile.
    await invoke('profile.update', { projectId, patch: { custom: { stoppable: null, hang: null } } });
    const removal = await invoke<{ pending: { id: string } }>('profile.get', { projectId });
    await invoke('profile.approve', { projectId, changeSetId: removal.result.pending.id });
    const file = join(folder, 'test', 'b-slow.test.js');
    writeFileSync(file, readFileSync(file, 'utf8').replace('test(`waits step', 'test.skip(`waits step'));
    const before = await runsNow();
    await nav('fullScan');
    await run.page.waitForSelector('[data-testid="plan-table"]', { timeout: 30_000 });
    await run.page.locator('.page').getByRole('button', { name: 'ابدأ الفحص الكامل' }).last().click();
    const r = await nextRun(before, 150_000);
    runs.full2 = r;
    const unit = (await checksOf(r.runId)).find((c) => c.instance.startsWith('beh.unit@'));
    expect(unit?.outcome).toBe('needs_review');
    await nav('integrity');
    await run.page.waitForSelector('[data-testid="panel-guard"]', { timeout: 15_000 });
    expect(await textOf('[data-testid="panel-guard"]')).toContain('beh.unit');
    expect(await textOf('[data-testid="integrity-blockers"]')).toMatch(/يمنع حكم ‹نقي›/);
  }, 180_000);

  it('records an accepting review: the check reads «اجتاز (بمراجعة)» with its eye', async () => {
    await run.page.locator('[data-testid="panel-guard"]').getByRole('button', { name: 'راجع وقرّر' }).first().click();
    const sheet = run.page.locator('dialog[open]');
    await sheet.waitFor();
    await axeBoth('22.6 · تسجيل مراجعة');
    await sheet.getByRole('radio', { name: /^قبول/ }).check();
    await sheet.getByRole('textbox').first().fill('الخطوات البطيئة تُشغَّل في جولة الأداء');
    await sheet.getByRole('button', { name: 'سجّل المراجعة' }).click();
    const unit = await until(async () => (await checksOf(runs.full2!.runId)).find((c) => c.instance.startsWith('beh.unit@')), (c) => !!c?.reviewId, 10_000);
    expect(unit?.reviewId).not.toBeNull();
    await nav('behavior');
    await run.page.waitForSelector('[data-testid="section"][data-section="behavior"]', { timeout: 15_000 });
    // The unit tests' panel carries the check's result (the checks list is folded under the panels).
    const badge = run.page.locator('[data-testid="panel-counts"] [data-result]').first();
    await badge.waitFor({ timeout: 15_000 });
    expect(await badge.getAttribute('data-result')).toBe('passed-reviewed');
    expect(await badge.textContent()).toContain('اجتاز (بمراجعة)');
    expect(await badge.locator('.eye').count()).toBe(1);
  }, 60_000);

  it('expires the review when a file in its scope changes, and the integrity page shows its four panels, the line and no karat', async () => {
    const file = join(folder, 'test', 'b-slow.test.js');
    writeFileSync(file, `${readFileSync(file, 'utf8')}// touched\n`);
    await nav('behavior');
    const before = await runsNow();
    await button('شغّل القسم').click();
    await nextRun(before, 120_000);
    const reviews = await invoke<{ reviews: { valid: boolean }[] }>('reviews.list', { projectId });
    expect(reviews.result.reviews.some((r) => !r.valid)).toBe(true);
    // The first review made integ.reviews apply: approved like any check, it counts the expired review at the next
    // full round (the integrity checks run with the round).
    await approveAll();
    const beforeRound = await runsNow();
    await nav('fullScan');
    await run.page.waitForSelector('[data-testid="plan-table"]', { timeout: 30_000 });
    await run.page.locator('.page').getByRole('button', { name: 'ابدأ الفحص الكامل' }).last().click();
    const round = await nextRun(beforeRound, 150_000);
    expect((await checksOf(round.runId)).find((c) => c.instance.startsWith('integ.reviews@'))?.outcome).toBe('needs_review');
    await nav('integrity');
    await run.page.waitForSelector('[data-testid="panel-reviews"]', { timeout: 15_000 });
    await run.page.waitForTimeout(800);
    expect(await textOf('[data-testid="panel-reviews"]')).toContain('منتهية');
    for (const id of ['panel-integrity-checks', 'panel-guard', 'panel-state', 'panel-claims', 'panel-reviews']) expect(await run.page.locator(`[data-testid="${id}"]`).count()).toBe(1);
    expect(await run.page.locator('[data-testid="panel-integrity-checks"] tbody tr').count()).toBe(4);
    expect(await textOf('[data-testid="integrity-blockers"]')).toMatch(/يمنع حكم ‹نقي›: /);
    expect(await run.page.locator('[data-testid="section"] .header .karat').count()).toBe(0);
    await axeBoth('15 · النزاهة');
  }, 300_000);
});

describe('the section pages (9–14)', () => {
  it('shows each section with its header, its checks and its panels, or why nothing applies', async () => {
    for (const s of ['design', 'security', 'code', 'behavior', 'performance', 'custom']) {
      await nav(s);
      await run.page.waitForSelector(`[data-testid="section"][data-section="${s}"], [data-testid="no-applicable"]`, { timeout: 15_000 });
      await run.page.waitForTimeout(600);
      await axeBoth(`9–14 · ${s}`);
    }
  }, 120_000);
});

describe('J8: a change context (17.3, 17.4)', () => {
  it('suggests checks and cards with their reasons, makes the cards, and runs the suggested checks', async () => {
    await nav('tasks');
    await run.page.waitForSelector('[data-testid="tasks"]', { timeout: 15_000 });
    await axeBoth('17.1 · المهام');
    await button('اقترح فحوصًا لتغيير…').click();
    await run.page.waitForSelector('[data-testid="advisor-inputs"]', { timeout: 15_000 });
    await axeBoth('17.3 · مدخلات المستشار');
    await run.page.locator('[data-testid="advisor-inputs"] select').first().selectOption('bugfix');
    await run.page.locator('[data-testid="advisor-inputs"] fieldset').first().getByRole('checkbox').first().check();
    await button('اقترح').click();
    await run.page.waitForSelector('[data-testid="advisor-outputs"], [data-testid="advisor-inputs"] [role="alert"]', { timeout: 15_000 });
    const refused = run.page.locator('[data-testid="advisor-inputs"] [role="alert"]');
    if (await refused.count()) throw new Error(`advisor refused: ${await refused.textContent()}`);
    await run.page.waitForTimeout(800);
    await axeBoth('17.4 · مخرجات المستشار');
    // Each suggestion says why (the rule and its weight).
    expect(await textOf('[data-testid="advisor-outputs"]')).toMatch(/الوزن|وزن/);
    const create = button(/^أنشئ البطاقات المحددة/);
    if (await create.isEnabled()) {
      await create.click();
      const tasks = await until(() => invoke<{ tasks: unknown[] }>('tasks.list', { projectId }), (r) => r.result.tasks.length > 0, 10_000);
      expect(tasks.result.tasks.length).toBeGreaterThan(0);
    }
    const before = await runsNow();
    await button('شغّل هذه').click();
    const r = await nextRun(before, 150_000);
    expect(r.kind).toBe('advisor');
  }, 240_000);
});

describe('AT-35 part: the tools page (20)', () => {
  it('shows each tool with its pinned version, its official source, its licence and its state', async () => {
    await nav('tools');
    await run.page.waitForSelector('[data-testid="tools"] tbody tr', { timeout: 15_000 });
    const rows = await run.page.locator('[data-testid="tools"] tbody tr[data-tool]').allTextContents();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toMatch(/الرسمي/);
      expect(row).toMatch(/الترخيص/);
    }
    await axeBoth('20 · الأدوات');
  });
});

describe('the settings (21) and «حول» (D-DEV12-02)', () => {
  it('names who made AYAR and links its repository', async () => {
    await nav('settings');
    await run.page.waitForSelector('[data-testid="settings-about"]', { timeout: 15_000 });
    const about = await textOf('[data-testid="settings-about"]');
    expect(about).toContain('سلطان');
    expect(about).toContain('github.com/iSltanX/AYAR');
    await axeBoth('21 · الإعدادات');
  });

  it('AT-28 part: switches the whole interface to English at once, and keeps it after a reload', async () => {
    try {
      await run.page.locator('[data-testid="settings"] select').first().selectOption('en');
      await until(() => run.page.locator('h1').first().textContent(), (x) => x === 'Settings', 10_000);
      expect(await run.page.locator('h1').first().textContent()).toBe('Settings');
      expect(await run.page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang }))).toEqual({ dir: 'ltr', lang: 'en' });
      // No Arabic word left on the page, the project's own names aside.
      const arabic = await run.page.evaluate(() => (document.body.innerText.match(/[\u0600-\u06FF]+/g) ?? []).filter((w) => !['مشروع', 'آمن', 'المخصصة', 'السريعة'].some((n) => w.normalize('NFC').includes(n.normalize('NFC')))));
      expect(arabic).toEqual([]);
      await axeBoth('21 · Settings (en)');
      await run.page.reload();
      await run.page.waitForLoadState('load');
      await run.page.waitForTimeout(1500);
      expect(await run.page.evaluate(() => document.documentElement.lang)).toBe('en');
    } finally {
      // Back to Arabic for the rest of the file, whatever happened above.
      await invoke('settings.set', { key: 'ui.language', value: 'ar' });
      await run.page.reload();
      await run.page.waitForLoadState('load');
      await run.page.waitForTimeout(1500);
    }
    expect(await run.page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  }, 60_000);
});

describe('J2 and AT-05 (UI): a known project whose setup changed', () => {
  it('reads the changed test script again: only the affected check asks, a mass deletion alone, and sudo refused', async () => {
    await approveAll();
    const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    writeFileSync(join(folder, 'package.json'), `${JSON.stringify({ ...pkg, scripts: { ...pkg.scripts, test: 'node --test --test-reporter=spec' } }, null, 2)}\n`);
    // AT-05: a command that starts with sudo is refused outright; a mass deletion is dangerous and approved by itself.
    const sudo = await invoke('profile.update', { projectId, patch: { custom: { privileged: { argv: ['sudo', '-n', 'true'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } });
    expect(sudo.ok).toBe(false);
    await invoke('profile.update', { projectId, patch: { custom: { cleanup: { argv: ['sh', '-c', 'rm -rf ./build'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } });
    await nav('projects');
    await run.page.locator('[data-testid="projects-table"]').getByRole('button', { name: 'افتح' }).first().click();
    await run.page.waitForTimeout(1000);
    await button('أعد القراءة').click();
    await button('راجع ملف المعايير').waitFor({ timeout: 60_000 });
    await button('راجع ملف المعايير').click();
    await run.page.waitForTimeout(800);
    const pending = (await invoke<{ pending: { items: { instance: string; approveAlone: boolean; approvable: boolean; change: string }[] } }>('profile.get', { projectId })).result.pending.items.filter((i) => i.approvable);
    // Only what the change touches asks again: the unit tests (their script changed) and the new command. (A check
    // the reading newly finds applicable, like integ.reviews once a review exists, is new, not asked again.)
    const asked = pending.filter((i) => i.change !== 'added' || i.instance.startsWith('custom.')).map((i) => i.instance.split('@')[0]).sort();
    expect(asked).toEqual(['beh.unit', 'custom.cleanup']);
    expect(pending.find((i) => i.instance.startsWith('custom.cleanup'))?.approveAlone).toBe(true);
    await nav('projectConfiguration');
    await run.page.waitForSelector('[data-testid="config"][data-tab="approval"]', { timeout: 15_000 });
    await button('اعرض الفرق…').click();
    const diff = run.page.locator('dialog[open]');
    await diff.waitFor();
    expect(await diff.textContent()).toContain('--test-reporter=spec');
    await axeBoth('19.6 · فرق الاعتماد');
    await run.page.keyboard.press('Escape');
    await button('اعتمد الكل').click();
    // «اعتمد الكل» leaves the dangerous command: it is approved by itself.
    const approvable = (r: Invoke<{ pending: { items: { instance: string; approvable: boolean }[] } }>) => r.result.pending.items.filter((i) => i.approvable).map((i) => i.instance);
    const left = await until(() => invoke<{ pending: { items: { instance: string; approvable: boolean }[] } }>('profile.get', { projectId }), (r) => approvable(r).length === 1, 10_000);
    expect(approvable(left)).toEqual(['custom.cleanup@.']);
    await button('اعتمد هذا وحده').click();
    const done = await until(() => invoke<{ pending: { items: { instance: string; approvable: boolean }[] } }>('profile.get', { projectId }), (r) => approvable(r).length === 0, 10_000);
    expect(approvable(done)).toEqual([]);
  }, 120_000);

  it('passes axe on each of the configuration tabs', async () => {
    for (const tab of ['الملف', 'الفحوص', 'البيئة', 'المراجع', 'السياق', 'الاعتماد', 'الخدمات', 'الوضع']) {
      await run.page.getByRole('tab', { name: tab }).click();
      await run.page.waitForTimeout(600);
      await axeBoth(`19 · ${tab}`);
    }
  }, 90_000);
});

describe('accessibility and CSP over the DEV-12 screens', () => {
  it('axe: no critical or serious problem on any screen, in light and dark', () => {
    const problems = Object.fromEntries(Object.entries(axeFound).filter(([, v]) => v.length));
    if (Object.keys(problems).length) console.log('axe', JSON.stringify(problems, null, 1));
    expect(Object.keys(axeFound).length).toBeGreaterThan(30);
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
