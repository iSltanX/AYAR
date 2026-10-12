// The core journey of DEV-11 on the development build, in Arabic, one app for the whole file: add a project by the
// system dialog and by a drop (AT-04), approve its profile, run the full scan and watch it live (AT-09), read the
// results (AT-03/AT-21, AT-23, AT-43, AT-45), its logs (AT-29), and re-run what failed or was incomplete (AT-08);
// axe on the eight screens in both themes, and zero CSP violations throughout (AT-30 part). The project is made at
// test time (journey-project.ts) and needs only Node.
import { mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_DIR, launch, tempDataDir, until, type Launched } from './support.ts';
import { CUSTOM_CHECKS, loginShell, makeJourneyProject, NFD_NAME } from './journey-project.ts';

type Invoke = { ok: boolean; result?: unknown; error?: { code: string } };
type Counts = { queued: number; running: number; cancelling: number; finished: Record<string, number> };

let t: ReturnType<typeof tempDataDir>;
let run: Launched;
let folder: string;
let projectId: string;
const axeFound: Record<string, string[]> = {};
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const invoke = <T>(command: string, payload: unknown) =>
  run.page.evaluate(([c, p]) => (window as unknown as { ayar: { invoke: (c: string, p: unknown) => Promise<Invoke> } }).ayar.invoke(c, p), [command, payload] as const) as Promise<{ ok: boolean; result: T; error?: { code: string } }>;
const clipboard = () => run.app.evaluate(({ clipboard: c }) => c.readText());
const csp = () => run.app.evaluate(() => (globalThis as unknown as { ayarDiagnostics: { cspViolations: { directive: string }[] } }).ayarDiagnostics.cspViolations.map((v) => v.directive));
const button = (name: string | RegExp) => run.page.getByRole('button', { name, exact: typeof name === 'string' });

/** axe on the current page in light and dark: the critical and serious problems, by screen (part of AT-40). */
async function axeBoth(screen: string): Promise<void> {
  await run.page.evaluate(axeSource);
  for (const scheme of ['light', 'dark'] as const) {
    await run.page.emulateMedia({ colorScheme: scheme });
    await run.page.waitForTimeout(150);
    const found = await run.page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (ctx: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
      return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
    });
    axeFound[`${screen} (${scheme})`] = found;
  }
  await run.page.emulateMedia({ colorScheme: 'light' });
}

/** A drop of real files on the window, through the browser's own drag path (CDP), so the preload sees their paths. */
async function dropFolder(path: string): Promise<void> {
  const cdp = await run.page.context().newCDPSession(run.page);
  const data = { items: [], files: [path], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) await cdp.send('Input.dispatchDragEvent', { type, x: 600, y: 400, data });
  await cdp.detach();
}

/** The monitor's counts row as numbers: each cycle indicator and result badge with its count. */
async function uiCounts(): Promise<Counts | null> {
  return run.page.evaluate(() => {
    const row = document.querySelector('[data-testid="monitor-counts"]');
    if (!row) return null;
    const n = (el: Element | null) => Number(el?.querySelector('.count')?.textContent ?? '0');
    const finished: Record<string, number> = {};
    for (const b of row.querySelectorAll('[data-result]')) finished[b.getAttribute('data-result')!.replaceAll('-', '_')] = n(b);
    return { queued: n(row.querySelector('[data-cycle="queued"]')), running: n(row.querySelector('[data-cycle="running"]')), cancelling: n(row.querySelector('[data-cycle="cancelling"]')), finished };
  });
}

/** The same counts written with sorted keys, so two readings compare by value. */
const key = (c: Counts | null) => (c ? JSON.stringify({ ...c, finished: Object.fromEntries(Object.entries(c.finished).sort()) }) : 'null');

async function dbCounts(runId: string): Promise<{ counts: Counts; state: string }> {
  const d = await invoke<{ run: { state: string }; checks: { state: string; outcome: string | null }[] }>('run.get', { runId });
  const c: Counts = { queued: 0, running: 0, cancelling: 0, finished: {} };
  for (const x of d.result.checks) {
    if (x.state === 'planned' || x.state === 'queued') c.queued++;
    else if (x.state === 'running') c.running++;
    else if (x.state === 'cancelling') c.cancelling++;
    else if (x.outcome && x.outcome !== 'not_applicable') c.finished[x.outcome] = (c.finished[x.outcome] ?? 0) + 1;
  }
  return { counts: c, state: d.result.run.state };
}

type RunRow = { runId: string; kind: string; state: string; displayId: string };
async function runsNow(): Promise<RunRow[]> {
  return (await invoke<{ runs: RunRow[] }>('runs.list', { projectId })).result.runs;
}
async function latestRun(): Promise<RunRow> {
  return (await runsNow())[0]!;
}
/** The run that appears after `before` (a queued run sorts first, so the list is compared as a set). When none appears, the failure says what the page showed (a refusal's toast, the open dialog) and what the engine logged, instead of a bare undefined. */
async function newRun(before: readonly RunRow[]): Promise<RunRow> {
  const seen = new Set(before.map((r) => r.runId));
  const got = await until(runsNow, (rs) => rs.some((r) => !seen.has(r.runId)), 15_000);
  const found = got.find((r) => !seen.has(r.runId));
  if (found) return found;
  const page = await run.page.evaluate(() => ({ toasts: [...document.querySelectorAll('[role="status"], [role="alert"], .toast')].map((e) => e.textContent?.trim()).filter(Boolean), dialog: document.querySelector('dialog[open]')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 300) ?? null }));
  const log = (() => {
    try {
      return readFileSync(join(t.dataDir, 'logs', 'main.log'), 'utf8').split('\n').filter((l) => /error|warn|refus|stale|busy/i.test(l)).slice(-12).join('\n');
    } catch {
      return '(no main.log)';
    }
  })();
  throw new Error(`no new run within 15 s; runs: ${got.map((r) => `${r.displayId} ${r.kind} ${r.state}`).join(', ')}; page: ${JSON.stringify(page)}; log:\n${log}`);
}

async function waitFinished(runId: string, timeoutMs = 120_000): Promise<void> {
  await until(() => dbCounts(runId), (d) => d.state === 'finished', timeoutMs);
  await run.page.waitForSelector(`[data-testid="results"]`, { timeout: 15_000 });
}

beforeAll(async () => {
  t = tempDataDir();
  folder = makeJourneyProject(t.root);
  run = await launch(t.dataDir);
  await invoke('settings.set', { key: 'ui.language', value: 'ar' });
  await invoke('settings.set', { key: 'environment.shell', value: loginShell(t.root) });
  // No system notification from the test runs (13.3 «الإشعارات», DEV-12).
  await invoke('settings.set', { key: 'run.notify', value: false });
  await run.app.evaluate(({ clipboard: c }) => c.writeText(''));
  await run.page.reload();
  await run.page.waitForLoadState('load');
  await button('اختر مجلدًا…').waitFor();
}, 90_000);
afterAll(async () => {
  await run?.app.close();
  t?.cleanup();
});

describe('adding the project (AT-04, FR-59)', () => {
  it('adds through the system dialog, keeps the NFD path as it is on disk, and shows it isolated from the left', async () => {
    await axeBoth('1 · المشاريع (فارغة)');
    await run.app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [f] });
    }, folder);
    await button('اختر مجلدًا…').click();
    await button('راجع ملف المعايير').waitFor({ timeout: 30_000 });
    const list = await invoke<{ projects: { id: string; rootPath: string }[] }>('project.list', {});
    expect(list.result.projects).toHaveLength(1);
    projectId = list.result.projects[0]!.id;
    const stored = list.result.projects[0]!.rootPath;
    expect(stored.normalize('NFC')).toBe(realpathSync(folder).normalize('NFC'));
    // The path on disk is never rewritten (FR-03): the decomposed letter is still there.
    expect({ nfd: stored.endsWith(NFD_NAME), nfc: stored.endsWith(NFD_NAME.normalize('NFC')) }).toEqual({ nfd: true, nfc: false });
    await axeBoth('2 · الاكتشاف');
  });

  it('finds the same project when its NFC spelling is dropped on the window', async () => {
    await dropFolder(join(t.root, NFD_NAME.normalize('NFC')));
    await run.page.waitForSelector('h1, h2', { timeout: 15_000 });
    await until(() => invoke<{ projects: unknown[] }>('project.list', {}), (r) => r.ok, 5000);
    await run.page.waitForTimeout(1500);
    expect((await invoke<{ projects: unknown[] }>('project.list', {})).result.projects).toHaveLength(1);
    // The overview shows the path isolated from the left, its Arabic segment in a <bdi> of its own (D-DES3-04).
    const shown = await run.page.evaluate((name) => {
      const holders = [...document.querySelectorAll('[dir="ltr"]')].filter((e) => (e.textContent ?? '').normalize('NFC').includes(name.normalize('NFC')));
      return { isolated: holders.length > 0, bdi: holders.some((h) => [...h.querySelectorAll('bdi')].some((b) => (b.textContent ?? '').normalize('NFC') === name.normalize('NFC'))) };
    }, NFD_NAME);
    expect(shown).toEqual({ isolated: true, bdi: true });
  });

  it('explains the permission before macOS asks, for a folder dropped on a removable volume', async () => {
    const volume = realpathSync(APP_DIR);
    if (!volume.startsWith('/Volumes/')) return; // the worktree is not on an external volume here
    const cache = join(volume, '..', '..', 'node_modules', '.cache');
    const drop = join(cache, `ayar-e2e-drop-${process.pid}`);
    mkdirSync(drop, { recursive: true });
    try {
      await dropFolder(drop);
      const sheet = run.page.locator('dialog[open]');
      await sheet.waitFor({ timeout: 15_000 });
      expect(await sheet.textContent()).toContain('سيطلب macOS إذنًا باسم عِيَار');
      // Nothing was added before the user chose to continue.
      expect((await invoke<{ projects: unknown[] }>('project.list', {})).result.projects).toHaveLength(1);
      await run.page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
    } finally {
      rmSync(drop, { recursive: true, force: true });
    }
  });
});

describe('the profile (screen 3)', () => {
  it('approves every pending check from its page', async () => {
    await invoke('profile.update', { projectId, patch: { custom: CUSTOM_CHECKS } });
    if (await button('المشاريع').count()) await button('المشاريع').first().click();
    await run.page.waitForSelector('[data-testid="projects-table"]', { timeout: 10_000 });
    await run.page.locator('[data-testid="projects-table"]').getByRole('button', { name: 'افتح' }).first().click();
    await run.page.getByRole('button', { name: 'إعداد المشروع' }).click();
    await button('اعتمد الكل').waitFor({ timeout: 15_000 });
    await axeBoth('3 · اعتماد الملف');
    await button('اعتمد الكل').click();
    const pending = await until(
      () => invoke<{ pending: { items: unknown[] } }>('profile.get', { projectId }),
      (r) => r.result.pending.items.length === 0,
      15_000,
    );
    expect(pending.result.pending.items).toEqual([]);
  });
});

describe('the full scan, live (AT-09, screens 4–6)', () => {
  it('shows the overview and the plan', async () => {
    await run.page.getByRole('button', { name: 'نظرة عامة' }).click();
    await run.page.waitForSelector('main, [role="main"], h1', { timeout: 10_000 });
    await run.page.waitForTimeout(1500);
    await axeBoth('4 · نظرة عامة');
    await run.page.getByRole('button', { name: 'الفحص الكامل' }).first().click();
    await run.page.waitForSelector('[data-testid="plan-table"]', { timeout: 20_000 });
    await axeBoth('5 · خطة الفحص الكامل');
  });

  it('matches the database in every sample, shows a final «أخفق» under a running run, and provisional findings', async () => {
    await run.page.locator('[data-testid="plan-table"] ~ *, .page').getByRole('button', { name: 'ابدأ الفحص الكامل' }).last().click();
    await run.page.waitForSelector('[data-testid="monitor-summary"]', { timeout: 20_000 });
    const runId = (await latestRun()).runId;
    await axeBoth('6 · متابعة التشغيل');
    let samples = 0;
    const mismatches: string[] = [];
    let redUnderRunning = false;
    let provisional = false;
    let liveFields = false;
    for (;;) {
      const db = await dbCounts(runId);
      if (db.state === 'finished') break;
      // The page follows the engine's events: within a second it shows what the database holds (or the run moved on).
      const shown = await until(uiCounts, (u) => key(u) === key(db.counts), 1500);
      const now = await dbCounts(runId);
      if (key(shown) !== key(db.counts) && key(now.counts) === key(db.counts)) mismatches.push(`${key(db.counts)} ≠ ${key(shown)}`);
      samples++;
      const page = await run.page.evaluate(() => ({
        state: document.querySelector('[data-testid="monitor-summary"]')?.getAttribute('data-state'),
        failed: !!document.querySelector('.check-row[data-status="failed"]'),
        verdict: !!document.querySelector('[data-testid="monitor-summary"] [data-verdict]'),
        provisional: [...document.querySelectorAll('.check-row[data-status="running"]')].some((r) => /مبدئي/.test(r.textContent ?? '')),
        live: [...document.querySelectorAll('.check-row[data-status="running"]')].some((r) => /آخر نشاط قبل/.test(r.textContent ?? '')),
      }));
      if (page.failed && page.state === 'running' && !page.verdict) redUnderRunning = true;
      if (page.provisional) provisional = true;
      if (page.live) liveFields = true;
      await run.page.waitForTimeout(500);
    }
    expect(samples).toBeGreaterThan(5);
    if (mismatches.length) console.log('AT-09 mismatches', mismatches);
    expect(mismatches).toEqual([]);
    expect({ redUnderRunning, provisional, liveFields }).toEqual({ redUnderRunning: true, provisional: true, liveFields: true });
    await waitFinished(runId);
  }, 180_000);
});

describe('the results (screens 7 and 8)', () => {
  it('turns into the results with the blocked verdict, the karat and its scope (AT-03, AT-21)', async () => {
    await run.page.waitForSelector('[data-testid="results"]');
    const card = await run.page.evaluate(() => {
      const text = document.querySelector('[data-testid="results"]')?.textContent ?? '';
      return { blocked: text.includes('محجوب'), scope: text.includes('النطاق') };
    });
    expect(card).toEqual({ blocked: true, scope: true });
    // Never the number alone (11.5): where the karat is drawn, its verdict and scope are in the same card.
    const dial = await run.page.evaluate(() => {
      const k = document.querySelector('[data-testid="results"] .karat-dial, [data-testid="results"] [data-karat]');
      const cardEl = k?.closest('section, .card, article');
      return k ? { verdict: /محجوب|غير مكتمل|نقي/.test(cardEl?.textContent ?? ''), scope: /النطاق/.test(cardEl?.textContent ?? '') } : null;
    });
    if (dial) expect(dial).toEqual({ verdict: true, scope: true });
    await axeBoth('7 · نتائج التشغيل');
  });

  it('AT-23: puts nothing on the clipboard before the button, and shows the redaction count above the tabs', async () => {
    expect(await clipboard()).toBe('');
    const counters = await until(
      () => run.page.evaluate(() => document.querySelector('.copy-bar .counters')?.textContent ?? ''),
      (c) => /محرف/.test(c),
      15_000,
    );
    expect(counters).toMatch(/إخفاء (موضع واحد|موضعين|\d+ مواضع|\d+ موضعًا|\d+ موضع)/);
  });

  it('AT-43: copies model-report/1 from any view, with the toast, the note shown before, and every term explained', async () => {
    expect(await run.page.locator('.copy-bar .note').first().textContent()).toMatch(/يُنسخ تقرير «للنموذج» دائمًا/);
    for (const view of ['لك', 'الاكتشافات', 'الفحوص', 'للنموذج']) {
      await run.app.evaluate(({ clipboard: c }) => c.writeText(''));
      if (view === 'لك' || view === 'للنموذج') await run.page.getByRole('radio', { name: view }).click();
      else await run.page.getByRole('tab', { name: view }).click();
      await run.page.locator('.copy-bar').getByRole('button', { name: 'انسخ للنموذج' }).click();
      const text = await until(clipboard, (c) => c.length > 0, 10_000);
      expect(text).toContain('model-report/1');
      expect(text).not.toMatch(/gh[p]_[A-Za-z0-9]{20,}/);
      expect(await run.page.locator('.toast').first().textContent()).toMatch(/نُسخ تقرير للنموذج/);
    }
    await axeBoth('8 · تقرير «للنموذج»');
    await run.page.getByRole('radio', { name: 'لك' }).click();
    const terms = await run.page.evaluate(() =>
      [...document.querySelectorAll('.terms button')].map((b) => document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent?.trim() ?? ''),
    );
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.every((x) => x.length > 0)).toBe(true);
  });

  it('AT-45: gives each next step its own button, and nothing handled directly offers «حدّد للنسخ»', async () => {
    const groups = await run.page.evaluate(() =>
      [...document.querySelectorAll('.for-you .group')].map((g) => ({ head: g.querySelector('.group-head')?.textContent?.trim() ?? '', buttons: [...g.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '') })),
    );
    const direct = groups.find((g) => g.head === 'تعالجها مباشرة');
    const model = groups.find((g) => g.head === 'تحتاج نموذجًا');
    expect(direct?.buttons.length).toBeGreaterThan(0);
    expect(direct!.buttons.every((b) => ['جهّز…', 'اعتمد', 'عرّف…', 'ثبّت التبعيات', 'أثبِت بإعادة الفحص', 'أعد غير المكتمل'].includes(b))).toBe(true);
    expect(model?.buttons.length).toBeGreaterThan(0);
    expect(model!.buttons.every((b) => b === 'حدّد للنسخ')).toBe(true);
    for (const g of groups.filter((x) => x.head === 'تحتاج مراجعتك')) expect(g.buttons.every((b) => b === 'راجع وقرّر')).toBe(true);
    // «حدّد للنسخ» narrows the one copy to the selection.
    await run.page.locator('.for-you .group').filter({ hasText: 'تحتاج نموذجًا' }).getByRole('button', { name: 'حدّد للنسخ' }).first().click();
    expect(await run.page.locator('.copy-bar select').inputValue()).toBe('selected');
  });

  it('passes axe on the four tabs and with a finding in the inspector', async () => {
    for (const tab of ['الاكتشافات', 'الفحوص', 'الأدلة', 'الآثار الجانبية']) {
      await run.page.getByRole('tab', { name: tab }).click();
      await run.page.waitForTimeout(400);
      await axeBoth(`7 · نتائج التشغيل — ${tab}`);
    }
    await run.page.getByRole('tab', { name: 'الاكتشافات' }).click();
    await run.page.locator('[role="row"][aria-selected]').first().focus();
    await run.page.keyboard.press('Enter');
    await run.page.waitForSelector('#ayar-inspector[data-content="finding"]', { timeout: 10_000 });
    await axeBoth('7 · نتائج التشغيل — المفتش');
  });

  it('AT-29: draws logs as text — no markup runs, no colour codes, controls as marks, a long line without freezing', async () => {
    await run.page.getByRole('tab', { name: 'الفحوص' }).click();
    const unit = run.page.locator('.check').filter({ hasText: 'beh.unit' });
    await unit.getByRole('button', { name: 'السجل' }).click();
    await run.page.waitForSelector('#ayar-inspector .lines .line', { timeout: 15_000 });
    const started = Date.now();
    const shown = await run.page.evaluate(() => {
      const insp = document.getElementById('ayar-inspector')!;
      return {
        text: insp.textContent ?? '',
        images: insp.querySelectorAll('img').length,
        bold: insp.querySelectorAll('b').length,
        xss: (window as unknown as { __ayarXss?: number }).__ayarXss ?? null,
        controls: [...insp.querySelectorAll('.control')].map((c) => c.textContent),
      };
    });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(shown.images).toBe(0);
    expect(shown.bold).toBe(0);
    expect(shown.xss).toBeNull();
    expect(shown.text).toContain('<img src=x');
    expect(shown.text).not.toContain('\u001b');
    expect(shown.text).not.toMatch(/[‪-‮⁦-⁩]/);
    expect(shown.controls).toContain('⟦U+202E⟧');
    expect(shown.text).not.toMatch(/gh[p]_[A-Za-z0-9]{20,}/);
  });

  it('AT-08: re-runs what failed through its sheet, then what was incomplete', async () => {
    const first = await latestRun();
    const before = await runsNow();
    await button('أعد الفاشل').click();
    const failedSheet = run.page.locator('dialog[open]');
    await failedSheet.waitFor();
    expect(await failedSheet.getByRole('checkbox', { name: 'أخفق' }).isChecked()).toBe(true);
    // The sheet's button carries the count of what it will re-run; a run of nothing would start nothing.
    const rerunButton = failedSheet.getByRole('button', { name: /^أعد \(\d+\)$/ });
    const rerunLabel = (await rerunButton.textContent())?.trim() ?? '';
    expect(rerunLabel, 'the failed sheet counts what it re-runs').toMatch(/\([1-9]\d*\)/);
    await rerunButton.click();
    const rerun = await newRun(before);
    expect(rerun.kind).toBe('rerun_failed');
    await waitFinished(rerun.runId);
    await until(async () => (await run.page.getAttribute('[data-testid="results"]', 'data-run')) ?? '', (id) => id === rerun.displayId, 15_000);

    // «أعد غير المكتمل» from the first run's results (the re-run of the failed ones left nothing incomplete).
    await run.page.getByRole('button', { name: 'نظرة عامة' }).click();
    await run.page.locator(`tr[data-run="${first.runId}"]`).click();
    await until(async () => (await run.page.getAttribute('[data-testid="results"]', 'data-run')) ?? '', (id) => id === first.displayId, 15_000);
    const beforeIncomplete = await runsNow();
    await button('أعد غير المكتمل').click();
    const incompleteSheet = run.page.locator('dialog[open]');
    await incompleteSheet.waitFor();
    await incompleteSheet.getByRole('button', { name: /^أعد \(\d+\)$/ }).click();
    const again = await newRun(beforeIncomplete);
    expect(again.kind).toBe('rerun_incomplete');
    await waitFinished(again.runId);
  }, 240_000);

  it('shows the project with its verdict and scope in the list (AT-21) and on the overview', async () => {
    await run.page.getByRole('button', { name: 'نظرة عامة' }).click();
    await run.page.waitForTimeout(1500);
    const overview = await run.page.evaluate(() => document.body.innerText);
    expect(overview).toContain('محجوب');
    await run.page.getByRole('button', { name: 'المشاريع' }).first().click();
    await run.page.waitForSelector('[data-testid="projects-table"]');
    const row = await until(() => run.page.locator('[data-testid="projects-table"] tbody tr').first().textContent(), (x) => /محجوب/.test(x ?? ''), 10_000);
    expect(row).toMatch(/محجوب/);
    await axeBoth('1 · المشاريع (القائمة)');
  });
});

describe('accessibility and CSP over the journey', () => {
  it('axe: no critical or serious problem on the eight screens, in light and dark', () => {
    const screens = new Set(Object.keys(axeFound).map((k) => k.split(' · ')[0]));
    expect([...screens].sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    const found = Object.fromEntries(Object.entries(axeFound).filter(([, v]) => v.length));
    if (Object.keys(found).length) console.log('axe', JSON.stringify(found, null, 1));
    expect(found).toEqual({});
  });

  it('records zero CSP violations', async () => {
    expect(await csp()).toEqual([]);
  });
});
