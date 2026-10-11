// FX-WEB-DESIGN in the development build, in Arabic, with the probe's browser (13.4):
//   J3 / AT-17 (UI): the design page leads with the reference board and what is missing; «عرّف…» opens the project's
//        references, where the tokens, the fonts, the render target and the matrix are written (the states with their
//        network simulation and expectations come from the project's own file); «شغّل القسم» gives the gallery —
//        states × sizes × themes × languages, the sensitive state shown with its reason and never captured — and the
//        accessibility results; design.visual «ناقص» with no approved reference; a capture approved as a reference;
//        a human review recorded; then an intended visual change gives a difference and «يحتاج مراجعة».
//   AT-10 (UI): the probe rows count their cells; the remaining time shows «تقديريًا» only once there is a history.
//   AT-27 (UI): an evidence bundle without the captures, then with them only after the note is shown.
// axe on the screens visited in both themes, and zero CSP violations. Skipped when the probe's browser is missing.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_DIR, launch, tempDataDir, until, type Launched } from './support.ts';
import { loginShell } from './journey-project.ts';

type Invoke<T> = { ok: boolean; result: T; error?: { code: string } };
type RunRow = { runId: string; kind: string; state: string; displayId: string };
type CheckRow = { instance: string; checkId: string; outcome: string | null; checkRunId: string; outcomeReason: { key: string } | null };
type Capture = { id: string; key: { state: string }; comparison: string };

const BROWSER = join(homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const READY = existsSync(BROWSER);
const FIXTURES = join(APP_DIR, '../../fixtures');

let t: ReturnType<typeof tempDataDir>;
let run: Launched;
let folder: string;
let projectId: string;
let firstRun: RunRow;
const axeFound: Record<string, string[]> = {};
/** Errors the page threw or logged (none is expected). */
const pageErrors: string[] = [];
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

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
const refRow = (label: string) => run.page.locator('[data-testid="config-references"] .ref-row, .card .ref-row').filter({ hasText: label }).first();

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
async function nextRun(before: readonly RunRow[], timeoutMs = 300_000, sample?: () => Promise<void>): Promise<RunRow> {
  const seen = new Set(before.map((r) => r.runId));
  const got = await until(
    async () => {
      if (sample) await sample();
      return runsNow();
    },
    (rs) => rs.some((r) => !seen.has(r.runId) && ['finished', 'interrupted'].includes(r.state)),
    timeoutMs,
  );
  const r = got.find((x) => !seen.has(x.runId) && ['finished', 'interrupted'].includes(x.state));
  if (!r) throw new Error(`no new run finished: ${JSON.stringify(got.slice(0, 3))}`);
  return r;
}
const checksOf = async (runId: string) => (await invoke<{ checks: CheckRow[] }>('run.get', { runId })).result.checks;

async function approvePending(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const p = await invoke<{ pending: { id: string; items: { approvable: boolean; approveAlone: boolean; instance: string }[] } }>('profile.get', { projectId });
    const items = p.result.pending.items.filter((x) => x.approvable);
    if (!items.length) return;
    const alone = items.find((x) => x.approveAlone);
    await invoke('profile.approve', { projectId, changeSetId: p.result.pending.id, ...(alone ? { instances: [alone.instance] } : {}) });
  }
}

/** What the monitor shows while a run goes on (AT-10): the probe rows' cell counts and the remaining estimate. */
const seen = { cells: false, estimate: false };
async function sampleMonitor(): Promise<void> {
  const m = await run.page.evaluate(() => ({
    cells: [...document.querySelectorAll('.check-row[data-status="running"]')].some((r) => /يعرض الحالات/.test(r.textContent ?? '') && /\d+\s*\/\s*\d+|\d+ من \d+/.test(r.textContent ?? '')),
    estimate: /المتبقي تقديريًا/.test(document.body.innerText),
  }));
  seen.cells ||= m.cells;
  seen.estimate ||= m.estimate;
}

beforeAll(async () => {
  if (!READY) return;
  t = tempDataDir();
  folder = execFileSync(process.execPath, [join(FIXTURES, 'tools/materialize.mjs'), 'FX-WEB-DESIGN', 'good', join(t.root, 'web')], { encoding: 'utf8' }).trim().split('\n').pop()!;
  run = await launch(t.dataDir);
  run.page.on('pageerror', (e) => pageErrors.push(`${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`));
  run.page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });
  await invoke('settings.set', { key: 'ui.language', value: 'ar' });
  await invoke('settings.set', { key: 'environment.shell', value: loginShell(t.root) });
  await invoke('settings.set', { key: 'run.notify', value: false });
  // The probe's browser, as «ثبّت متصفح المسبار» registers it (the same pinned build, probe.e2e.ts).
  const db = new DatabaseSync(join(t.dataDir, 'ayar.db'));
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    db.prepare("INSERT INTO data_assets (id, kind, key, version_or_date, path, size, updated_at) VALUES ('dat_e2e_browser', 'browser', 'chromium', '156.0.8078.4', ?, 0, ?)").run(BROWSER, new Date().toISOString());
  } finally {
    db.close();
  }
  await run.page.reload();
  await run.page.waitForLoadState('load');
  await run.app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [f] });
  }, folder);
  await button('اختر مجلدًا…').click();
  await button('راجع ملف المعايير').waitFor({ timeout: 30_000 });
  projectId = (await invoke<{ projects: { id: string }[] }>('project.list', {})).result.projects[0]!.id;
  await approvePending();
  await run.page.reload();
  await run.page.waitForLoadState('load');
  await run.page.locator('[data-testid="projects-table"]').getByRole('button', { name: 'افتح' }).first().click();
  await run.page.waitForTimeout(1500);
}, 120_000);
afterAll(async () => {
  await run?.app.close();
  t?.cleanup();
});

describe.runIf(READY)('J3 and AT-17 (UI): the design check with a reference', () => {
  it('leads the design page with the reference board, and «عرّف…» opens the project\'s references', async () => {
    await nav('design');
    await run.page.waitForSelector('[data-testid="panel-reference"]', { timeout: 15_000 });
    const lead = await run.page.evaluate(() => {
      const ref = document.querySelector('[data-testid="panel-reference"]');
      const list = document.querySelector('[data-testid="section-checks"], [data-testid="section-optional"]');
      return !!ref && !!list && !!(ref.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(lead).toBe(true);
    await axeBoth('10.1 · لوحة المرجع بنواقصها');
    await run.page.locator('[data-testid="panel-reference"]').getByRole('button', { name: /^(عرّف…|عدّل…)$/ }).first().click();
    await run.page.waitForSelector('[data-testid="config-references"]', { timeout: 15_000 });
    await axeBoth('19.4 · المراجع');
  });

  it('writes the tokens, the fonts, the render target and the matrix from the references tab', async () => {
    const tokens = refRow('رموز التصميم');
    await tokens.getByRole('button', { name: 'عدّل…' }).click();
    await tokens.getByRole('textbox').fill('design/tokens.json');
    await tokens.getByRole('button', { name: 'احفظ' }).click();
    const fonts = refRow('الخطوط المعتمدة');
    await fonts.getByRole('textbox').fill('Cairo');
    await fonts.getByRole('button', { name: 'أضف' }).click();
    const target = refRow('هدف العرض');
    await target.getByRole('button', { name: /^(عرّف…|عدّل…)$/ }).click();
    await target.getByRole('radio', { name: 'البناء الثابت' }).check();
    await target.getByLabel('المجلد').fill('.');
    await target.getByLabel('الصفحة').fill('index.html');
    await target.getByRole('button', { name: 'احفظ' }).click();
    await until(() => invoke<{ references: Record<string, unknown> }>('profile.get', { projectId }), (r) => !!r.result.references.renderTarget, 10_000);
    // Typed one after the other, as fast as the page takes them: each addition is kept.
    for (const size of ['375x812', '1280x800']) {
      const row = refRow('الأحجام');
      await row.getByRole('textbox').fill(size);
      await row.getByRole('button', { name: 'أضف' }).click();
    }
    for (const [label, values] of [['الثيمات', ['light', 'dark']], ['اللغات', ['ar', 'en']]] as const) {
      for (const v of values) {
        const row = refRow(label);
        await row.getByRole('textbox').fill(v);
        await row.getByRole('button', { name: 'أضف' }).click();
      }
    }
    await until(
      () => invoke<{ references: { renderTarget?: { viewports?: unknown[]; themes?: { values: unknown[] }; languages?: { values: unknown[] } } } }>('profile.get', { projectId }),
      (r) => r.result.references.renderTarget?.viewports?.length === 2 && r.result.references.renderTarget.themes?.values.length === 2 && r.result.references.renderTarget.languages?.values.length === 2,
      15_000,
    );
    // The project turns its theme on by the address (?theme=), and its states with their network simulation and
    // expectations are in its own file — written in the profile as the user would.
    const profile = await invoke<{ references: { renderTarget: Record<string, unknown> } }>('profile.get', { projectId });
    const rt = profile.result.references.renderTarget;
    expect(rt).toMatchObject({ kind: 'static', viewports: [{ width: 375 }, { width: 1280 }], themes: { values: ['light', 'dark'] }, languages: { values: ['ar', 'en'] } });
    const updated = await invoke('profile.update', { projectId, patch: { references: { renderTarget: { ...rt, themes: { values: ['light', 'dark'], activation: { kind: 'query', param: 'theme' } } }, states: { file: 'design/states.json' } } } });
    expect(updated.ok).toBe(true);
    await approvePending();
    // The tab shows the profile it was opened with: opened again, the matrix line names the states file and the axes.
    await nav('overview');
    await nav('projectConfiguration');
    await run.page.getByRole('tab', { name: 'المراجع' }).click();
    await until(() => textOf('[data-testid="config"]'), (x) => x.includes('design/states.json × 2 × 2 × 2'), 10_000);
    expect(await textOf('[data-testid="config"]')).toContain('design/states.json × 2 × 2 × 2');
    // The context: a public audience asks for the accessibility checks and the human review (C-09).
    await run.page.getByRole('tab', { name: 'السياق' }).click();
    await run.page.getByRole('radiogroup', { name: 'الجمهور' }).getByRole('radio', { name: 'جمهور عام' }).check();
    await until(() => invoke<{ context: { audience: string | null } }>('profile.get', { projectId }), (r) => r.result.context.audience === 'public', 10_000);
    await approvePending();
  }, 90_000);

  it('runs the section: the gallery by state, size, theme and language, the sensitive state uncaptured with its reason, and design.visual «ناقص» with no reference', async () => {
    await nav('design');
    await run.page.waitForSelector('[data-testid="section"][data-section="design"]', { timeout: 15_000 });
    // The visual comparison is optional: the user includes it from the folded group.
    const optional = run.page.locator('[data-testid="section-optional"]');
    const fold = optional.locator('button.fold');
    if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
    await optional.locator('tr[data-instance^="design.visual@"]').getByRole('button', { name: 'ضمّه' }).click();
    await until(() => invoke<{ checks: { checkId: string; included: boolean }[] }>('profile.get', { projectId }), (r) => !!r.result.checks.find((c) => c.checkId === 'design.visual')?.included, 10_000);
    await approvePending();
    await nav('overview');
    await nav('design');
    await run.page.waitForSelector('[data-testid="section"][data-section="design"]', { timeout: 15_000 });
    const before = await runsNow();
    seen.cells = false;
    seen.estimate = false;
    await button('شغّل القسم').click();
    firstRun = await nextRun(before, 400_000, sampleMonitor);
    const checks = await checksOf(firstRun.runId);
    const visual = checks.find((c) => c.checkId === 'design.visual');
    expect(visual?.outcome).toBe('missing');
    const states = checks.find((c) => c.checkId === 'design.states') ?? visual!;
    const caps = (await invoke<{ captures: Capture[] }>('captures.list', { checkRunId: states.checkRunId })).result.captures;
    expect(caps.length).toBe(32);
    expect(caps.some((c) => c.key.state === 'account')).toBe(false);
    // AT-10: the probe's rows count their cells; with no history yet, no remaining estimate.
    expect(seen.cells).toBe(true);
    expect(seen.estimate).toBe(false);
    await nav('design');
    await run.page.waitForSelector('[data-testid="panel-gallery"]', { timeout: 20_000 });
    await run.page.waitForTimeout(1500);
    expect(await textOf('[data-testid="panel-gallery"]')).toMatch(/account|حساس/);
    expect(await run.page.locator('[data-testid="panel-a11y"]').count()).toBe(1);
    await axeBoth('10.3 · المعرض ونتائج الإتاحة');
  }, 480_000);

  it('approves a capture as a reference image, with its full key, only when asked', async () => {
    expect((await invoke<{ baselines: unknown[] }>('baselines.list', { projectId })).result.baselines).toEqual([]);
    // Once the references are written the board folds behind «المرجع»; the capture offered for approval is there.
    if (!(await run.page.locator('[data-testid="panel-reference"]').count())) await button('المرجع').click();
    await run.page.locator('[data-testid="panel-reference"]').getByRole('button', { name: 'اعتمد صورة مرجعية…' }).click();
    const sheet = run.page.locator('dialog[open]');
    await sheet.waitFor();
    expect(await sheet.textContent()).toMatch(/1280|375/);
    await axeBoth('22.5 · اعتماد صورة مرجعية');
    await sheet.getByRole('button', { name: 'اعتمد' }).click();
    const b = await until(() => invoke<{ baselines: { status: string }[] }>('baselines.list', { projectId }), (r) => r.result.baselines.some((x) => x.status === 'active'), 10_000);
    expect(b.result.baselines.filter((x) => x.status === 'active')).toHaveLength(1);
  }, 60_000);

  it('records a human accessibility review for one of its items', async () => {
    const panel = run.page.locator('[data-testid="panel-review"]');
    await panel.waitFor({ timeout: 15_000 });
    await panel.getByRole('button', { name: 'سجّل مراجعة' }).first().click();
    const sheet = run.page.locator('dialog[open]');
    await sheet.waitFor();
    await sheet.getByRole('textbox').first().fill('التنقل بلوحة المفاتيح يصل إلى كل عنصر');
    await sheet.getByRole('button', { name: 'سجّل المراجعة' }).click();
    const r = await until(() => invoke<{ reviews: { target: { type: string; item?: string } }[] }>('reviews.list', { projectId }), (x) => x.result.reviews.length > 0, 10_000);
    expect(r.result.reviews.some((x) => x.target.type === 'check' && !!x.target.item)).toBe(true);
  }, 60_000);

  it('after an intended visual change, shows the difference with its image and «يحتاج مراجعة»', async () => {
    cpSync(join(FIXTURES, 'FX-WEB-DESIGN', 'variants', 'visual-change', 'overlay'), folder, { recursive: true });
    await nav('design');
    const before = await runsNow();
    seen.cells = false;
    seen.estimate = false;
    await button('شغّل القسم').click();
    const r = await nextRun(before, 400_000, sampleMonitor);
    const visual = (await checksOf(r.runId)).find((c) => c.checkId === 'design.visual');
    expect(visual?.outcome).toBe('needs_review');
    await nav('design');
    await run.page.waitForSelector('[data-testid="panel-diff"]', { timeout: 20_000 });
    await axeBoth('10.4 · الفرق مع المرجع');
  }, 480_000);

  it('AT-10 (UI): marks the remaining time «تقديريًا» once every check of the run has a history', async () => {
    await nav('design');
    const before = await runsNow();
    seen.cells = false;
    seen.estimate = false;
    await button('شغّل القسم').click();
    const r = await nextRun(before, 400_000, sampleMonitor);
    if (!seen.estimate) {
      const d = await invoke<{ plan: { items: { instance: string; status: string; estimateMs: number | null }[] } | null; checks: { instance: string; outcome: string | null; durationMs: number | null }[] }>('run.get', { runId: r.runId });
      console.log('no estimate; plan items', JSON.stringify(d.result.plan?.items.map((i) => [i.instance, i.status, i.estimateMs])), 'checks', JSON.stringify(d.result.checks.map((c) => [c.instance, c.outcome, c.durationMs])));
    }
    expect(seen.cells).toBe(true);
    expect(seen.estimate).toBe(true);
  }, 480_000);
});

describe.runIf(READY)('AT-27 (UI): the evidence bundle and the captures', () => {
  it('exports the bundle without the captures, then with them only after the note is shown', async () => {
    await nav('overview');
    await run.page.locator(`tr[data-run="${firstRun.runId}"]`).click();
    await run.page.waitForSelector('[data-testid="results"]', { timeout: 15_000 });
    const out = join(t.root, 'exports');
    mkdirSync(out, { recursive: true });
    for (const withCaptures of [false, true]) {
      const dest = join(out, withCaptures ? 'with.tar' : 'without.tar');
      await run.app.evaluate(({ dialog }, p) => {
        dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: p });
      }, dest);
      await button('صدّر التقرير…').click();
      const sheet = run.page.locator('dialog[open]');
      await sheet.waitFor();
      await sheet.locator('select').first().selectOption('evidence-bundle');
      const box = sheet.getByRole('checkbox', { name: 'ضمّن اللقطات' });
      if (withCaptures) {
        await box.check();
        expect(await sheet.textContent()).toContain('قد تظهر في اللقطات بيانات من واجهتك');
        await axeBoth('22 · التصدير مع اللقطات');
      } else expect(await box.isChecked()).toBe(false);
      await sheet.getByRole('button', { name: 'صدّر…' }).click();
      await until(() => Promise.resolve(existsSync(dest)), (x) => x, 30_000);
      const list = execFileSync('/usr/bin/tar', ['-tf', dest], { encoding: 'utf8' });
      expect(/\.png$/m.test(list)).toBe(withCaptures);
    }
  }, 120_000);
});

describe.runIf(READY)('accessibility and CSP', () => {
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
