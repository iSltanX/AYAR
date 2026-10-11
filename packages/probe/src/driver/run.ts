// C-14 the probe's work: one job, the cells of its matrix one after the other, a message after each (FR-29: the
// total is known from the start). Playwright's Chromium (D-26), headless (E-11), with the render held still — reduced
// motion, a fixed locale, time zone and pixel density — and every request through the network rule. Per cell: the
// page at its viewport, theme and language, its setup steps, its declared expectations, then its image (never for a
// «حساسة» state, G-29), then axe and the measures. An extension is loaded into a persistent context and Chromium's
// own answer is asked for (D-DEV7-04). Nothing here writes outside the job's folder, and the context's profile goes
// with the job.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, BrowserType, ConsoleMessage, Page, Request, Route } from 'playwright-core';
import { cellKey, type CellResult, type ConsoleEntry, type ExtensionResult, type FromProbe, type PerfRun, type ProbeCell, type ProbeJob, type ProbeSummary } from '../contract.ts';
import { findMock, judgeUrl, proxyArgs, shownUrl, type NetworkLog } from './network.ts';
import { FONTS_STATE, PERF_TIMINGS, RTL_MEASURE, SAMPLE_STYLES, SCRIPT_NEAR } from './page-scripts.ts';
import { serveFolder, type StaticServer } from './server.ts';

/** How long one declared expectation may wait for its element or text. */
const EXPECT_WAIT_MS = 5000;
/** At most this many elements are sampled per cell (design.tokens.render: samples, not every pixel). */
const MAX_SAMPLED = 400;
const STABLE_ARGS = ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check'];

type Chromium = BrowserType;

export interface RunOptions {
  chromium: Chromium;
  emit: (m: FromProbe) => void;
  signal: AbortSignal;
}

class Cancelled extends Error {}

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** The page's address of a cell: the base, the path, and the query parameters that turn on its theme and language. */
export function cellUrl(base: string, cell: ProbeCell): string {
  const u = new URL(cell.path, base.endsWith('/') ? base : `${base}/`);
  for (const a of [cell.theme, cell.lang]) if (a.activation.kind === 'query') u.searchParams.set(a.activation.param, a.value);
  return u.toString();
}

export async function runJob(job: ProbeJob, o: RunOptions): Promise<void> {
  const t0 = Date.now();
  const { emit } = o;
  if (!existsSync(job.browser.executablePath)) {
    emit({ type: 'failed', jobId: job.jobId, code: 'browser_missing', detail: 'the probe browser is not installed' });
    return;
  }
  emit({ type: 'started', jobId: job.jobId, total: job.cells.length });
  const axeSource = job.axePath && job.measure.axeTags ? readFileSync(job.axePath, 'utf8') : null;
  let server: StaticServer | null = null;
  let browser: Browser | null = null;
  let persistent: BrowserContext | null = null;
  let profile: string | null = null;
  let extension: ExtensionResult | null = null;
  let base: string;
  try {
    if (job.target.kind === 'static' || job.target.kind === 'storybook') {
      server = await serveFolder(job.target.root);
      base = server.url;
    } else if (job.target.kind === 'url') base = job.target.baseUrl;
    else base = '';

    const launchArgs = [...STABLE_ARGS, ...proxyArgs(job.allowHosts)];
    if (job.target.kind === 'extension') {
      profile = mkdtempSync(join(job.outDir, 'profile-'));
      persistent = await o.chromium.launchPersistentContext(profile, {
        executablePath: job.browser.executablePath,
        headless: true,
        viewport: job.cells[0] ? { width: job.cells[0].viewport.width, height: job.cells[0].viewport.height } : { width: 420, height: 640 },
        deviceScaleFactor: 1,
        locale: job.locale,
        timezoneId: job.timezone,
        reducedMotion: 'reduce',
        colorScheme: 'light',
        args: [...launchArgs, `--disable-extensions-except=${job.target.dir}`, `--load-extension=${job.target.dir}`, '--enable-unsafe-extension-debugging'],
      });
      extension = await loadExtension(persistent, job.target.dir);
      base = extension.id ? `chrome-extension://${extension.id}/` : '';
      await persistent.route('**/*', (route) => routeFor(route, job, null, { blocked: [], allowed: [], mocked: [] }));
    } else {
      browser = await o.chromium.launch({ executablePath: job.browser.executablePath, headless: true, args: launchArgs });
    }
  } catch (e) {
    await server?.close();
    await persistent?.close().catch(() => {});
    if (profile) rmSync(profile, { recursive: true, force: true });
    emit({ type: 'failed', jobId: job.jobId, code: 'browser_failed', detail: clip(e instanceof Error ? e.message : String(e), 2000) });
    return;
  }

  const browserVersion = browser?.version() ?? persistent?.browser()?.version() ?? job.browser.version;
  try {
    let done = 0;
    for (const cell of job.cells) {
      if (o.signal.aborted) throw new Cancelled();
      const started = Date.now();
      let result: CellResult;
      if (job.target.kind === 'extension' && (!extension?.loaded || !extension.id)) {
        result = emptyCell(cell, '', { code: 'target_unreachable', detail: extension?.error ?? 'the extension did not load' }, started);
      } else if (job.mode === 'perf') {
        result = await perfCell(browser!, job, cell, base);
      } else {
        result = await withTimeout(pageCell(job, cell, base, browser, persistent, axeSource, o.signal), job.cellTimeoutMs, () => emptyCell(cell, cellUrl(base, cell), { code: 'timeout', detail: `the cell did not finish in ${job.cellTimeoutMs} ms` }, started));
      }
      emit({ type: 'cell', jobId: job.jobId, done: ++done, total: job.cells.length, result });
    }
    const summary: ProbeSummary = { browserVersion, mode: 'headless', density: 1, platform: `${process.platform}-${process.arch}`, extension, servedAt: server?.url ?? null, durationMs: Date.now() - t0 };
    emit({ type: 'done', jobId: job.jobId, summary });
  } catch (e) {
    if (e instanceof Cancelled || o.signal.aborted) emit({ type: 'failed', jobId: job.jobId, code: 'cancelled', detail: 'cancelled' });
    else emit({ type: 'failed', jobId: job.jobId, code: 'internal', detail: clip(e instanceof Error ? (e.stack ?? e.message) : String(e), 2000) });
  } finally {
    await persistent?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await server?.close();
    if (profile) rmSync(profile, { recursive: true, force: true });
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<T>((resolve) => (timer = setTimeout(() => resolve(onTimeout()), ms)));
  try {
    return await Promise.race([p, t]);
  } finally {
    clearTimeout(timer);
  }
}

function emptyCell(cell: ProbeCell, url: string, error: CellResult['error'], started: number): CellResult {
  return { index: cell.index, key: cellKey(cell), url, error, expectations: [], screenshot: null, console: [], blocked: [], allowed: [], failed: [], mocked: [], fonts: null, styles: null, rtl: null, axe: null, perf: null, durationMs: Date.now() - started };
}

/** D-DEV7-04: Chromium's own answer for an unpacked extension — its id, or the error it refused it with. */
async function loadExtension(ctx: BrowserContext, dir: string): Promise<ExtensionResult> {
  const workerConsole: ConsoleEntry[] = [];
  let id: string | null = null;
  let error: string | null = null;
  const cdp = await ctx.browser()!.newBrowserCDPSession();
  try {
    const r = (await cdp.send('Extensions.loadUnpacked' as never, { path: dir } as never)) as { id?: string };
    id = typeof r.id === 'string' ? r.id : null;
  } catch (e) {
    error = clip(String(e instanceof Error ? e.message : e).replace(/^.*?Extensions\.loadUnpacked\):\s*/, ''), 2000);
  } finally {
    await cdp.detach().catch(() => {});
  }
  let serviceWorker: string | null = null;
  if (id) {
    const manifest = readManifest(dir);
    const declares = typeof manifest?.background === 'object' && manifest.background !== null && typeof (manifest.background as Record<string, unknown>).service_worker === 'string';
    let sw = ctx.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${id}/`));
    if (!sw && declares) sw = await ctx.waitForEvent('serviceworker', { timeout: 10_000, predicate: (w) => w.url().startsWith(`chrome-extension://${id}/`) }).catch(() => undefined);
    serviceWorker = sw?.url() ?? null;
    if (declares && !serviceWorker) error = 'the service worker declared in the manifest did not register';
  }
  return { loaded: id !== null && error === null, error, id, serviceWorker, workerConsole };
}

function readManifest(dir: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The network rule for one request (and the cell's simulations, when a cell is given). */
async function routeFor(route: Route, job: ProbeJob, cell: ProbeCell | null, log: NetworkLog): Promise<void> {
  const req = route.request();
  const url = req.url();
  const verdict = judgeUrl(url, job.allowHosts);
  if (verdict.kind === 'blocked') {
    if (log.blocked.length < 200) log.blocked.push(shownUrl(req.method(), url));
    await route.abort('blockedbyclient').catch(() => {});
    return;
  }
  const mock = cell && verdict.kind === 'local' ? findMock(cell.mock, url) : null;
  if (mock) {
    log.simulated?.(url);
    const delay = mock.delayMs ?? 0;
    log.mocked.push({ url: shownUrl(req.method(), url), status: mock.abort ? null : (mock.status ?? 200), delayMs: delay, aborted: mock.abort === true });
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (mock.abort) {
      await route.abort('connectionfailed').catch(() => {});
      return;
    }
    const body = mock.bodyText ?? (mock.body !== undefined ? JSON.stringify(mock.body) : '');
    await route.fulfill({ status: mock.status ?? 200, contentType: mock.contentType ?? (mock.bodyText !== undefined && !/^\s*[[{]/.test(mock.bodyText) ? 'text/plain' : 'application/json'), body }).catch(() => {});
    return;
  }
  if (verdict.kind === 'allowed' && log.allowed.length < 200) log.allowed.push(shownUrl(req.method(), url));
  await route.continue().catch(() => {});
}

function consoleEntry(level: ConsoleEntry['level'], text: string, loc: { url?: string; lineNumber?: number; columnNumber?: number } | null): ConsoleEntry {
  return { level, text: clip(text, 4000), url: loc?.url ? clip(loc.url, 2048) : null, line: loc?.lineNumber ?? null, column: loc?.columnNumber ?? null, near: null };
}

/** The first frame of an error's stack: its script and position. */
function firstFrame(stack: string | undefined): { url: string; lineNumber: number; columnNumber: number } | null {
  const m = /\(?((?:https?|chrome-extension):\/\/[^\s)]+):(\d+):(\d+)\)?/.exec(stack ?? '');
  return m ? { url: m[1]!, lineNumber: Number(m[2]) - 1, columnNumber: Number(m[3]) - 1 } : null;
}

function selectorError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /not a valid selector|Unexpected token|SyntaxError|Failed to execute 'querySelector/i.test(m);
}

async function pageCell(job: ProbeJob, cell: ProbeCell, base: string, browser: Browser | null, persistent: BrowserContext | null, axeSource: string | null, signal: AbortSignal): Promise<CellResult> {
  const started = Date.now();
  const url = cellUrl(base, cell);
  const net: NetworkLog = { blocked: [], allowed: [], mocked: [], simulated: (u) => simulated.add(u) };
  const consoleLog: ConsoleEntry[] = [];
  const failed: CellResult['failed'] = [];
  /** The simulated requests (their failures are AYAR's doing), and the end of the cell (what fails after it is the close). */
  const simulated = new Set<string>();
  let closing = false;
  let context: BrowserContext;
  let page: Page | null = null;
  const ownContext = persistent === null;
  if (ownContext) {
    context = await browser!.newContext({
      viewport: { width: cell.viewport.width, height: cell.viewport.height },
      deviceScaleFactor: 1,
      locale: job.locale,
      timezoneId: job.timezone,
      reducedMotion: 'reduce',
      colorScheme: cell.theme.activation.kind === 'media' && (cell.theme.value === 'dark' || cell.theme.value === 'light') ? cell.theme.value : 'light',
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) => routeFor(route, job, cell, net));
  } else context = persistent!;
  try {
    page = await context.newPage();
    if (!ownContext) {
      await page.setViewportSize({ width: cell.viewport.width, height: cell.viewport.height });
      await page.route('**/*', (route) => routeFor(route, job, cell, net));
    }
    // Storage and cookie activation, before the page's own scripts.
    const storage = [cell.theme, cell.lang].filter((a) => a.activation.kind === 'storage') as { value: string; activation: { kind: 'storage'; key: string } }[];
    if (storage.length) await page.addInitScript((pairs: [string, string][]) => { for (const [k, v] of pairs) try { localStorage.setItem(k, v); } catch { /* no storage */ } }, storage.map((a) => [a.activation.key, a.value] as [string, string]));
    const cookies = [cell.theme, cell.lang].filter((a) => a.activation.kind === 'cookie') as { value: string; activation: { kind: 'cookie'; name: string } }[];
    if (cookies.length && /^https?:/.test(url)) await context.addCookies(cookies.map((a) => ({ name: a.activation.name, value: a.value, url })));
    page.on('console', (m: ConsoleMessage) => {
      if (consoleLog.length >= 200) return;
      const type = m.type();
      if (type !== 'error' && type !== 'warning') return;
      const loc = m.location();
      // A request the network rule refused, or a simulated answer (a 500, a failed connection), is AYAR's doing: the
      // browser's own line about it is not the page's error.
      if (/^Failed to load resource/.test(m.text()) && loc.url && (simulated.has(loc.url) || judgeUrl(loc.url, job.allowHosts).kind === 'blocked')) return;
      if (/net::ERR_BLOCKED_BY_CLIENT/.test(m.text()) && net.blocked.length) return;
      consoleLog.push(consoleEntry(type === 'error' ? 'error' : 'warning', m.text(), loc));
    });
    page.on('pageerror', (e) => {
      if (consoleLog.length < 200) consoleLog.push(consoleEntry('pageerror', `${e.name}: ${e.message}`, firstFrame(e.stack)));
    });
    page.on('requestfailed', (r: Request) => {
      if (closing || failed.length >= 200 || judgeUrl(r.url(), job.allowHosts).kind === 'blocked' || simulated.has(r.url())) return;
      if (failed.some((f) => f.url === shownUrl(r.method(), r.url()))) return; // its error status is already there
      failed.push({ url: shownUrl(r.method(), r.url()), status: null, reason: clip(r.failure()?.errorText ?? 'failed', 200) });
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && failed.length < 200 && !simulated.has(r.url())) failed.push({ url: shownUrl(r.request().method(), r.url()), status: r.status(), reason: `HTTP ${r.status()}` });
    });

    // The page.
    try {
      const res = await page.goto(url, { waitUntil: 'load', timeout: Math.min(job.cellTimeoutMs, 30_000) });
      if (res && res.status() >= 400 && /^https?:/.test(url)) return { ...emptyCell(cell, url, { code: 'navigation', detail: `HTTP ${res.status()}` }, started), console: consoleLog, blocked: net.blocked, allowed: net.allowed, failed, mocked: net.mocked };
    } catch (e) {
      const detail = clip(e instanceof Error ? e.message.split('\n')[0]! : String(e), 1000);
      const code = /ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_EMPTY_RESPONSE/.test(detail) ? 'target_unreachable' : 'navigation';
      return { ...emptyCell(cell, url, { code, detail }, started), console: consoleLog, blocked: net.blocked, allowed: net.allowed, failed, mocked: net.mocked };
    }
    if (signal.aborted) throw new Cancelled();

    // Its setup steps.
    for (const step of cell.setup) {
      try {
        if ('click' in step) await page.locator(step.click).first().click({ timeout: EXPECT_WAIT_MS });
        else if ('fill' in step) await page.locator(step.fill).first().fill(step.value, { timeout: EXPECT_WAIT_MS });
        else if ('press' in step) await page.keyboard.press(step.press);
        else await page.locator(step.waitFor).first().waitFor({ state: 'visible', timeout: step.timeoutMs ?? EXPECT_WAIT_MS });
      } catch (e) {
        const invalid = selectorError(e);
        return { ...emptyCell(cell, url, { code: invalid ? 'invalid_selector' : 'setup_failed', detail: clip(e instanceof Error ? e.message.split('\n')[0]! : String(e), 1000) }, started), console: consoleLog, blocked: net.blocked, allowed: net.allowed, failed, mocked: net.mocked };
      }
    }

    // Its expectations (C-14: «توقعات معلنة»).
    const expectations: CellResult['expectations'] = [];
    for (const [index, ex] of cell.expect.entries()) expectations.push(await checkExpectation(page, ex, cell.lang.value, index));
    if (!cell.expect.length) await page.waitForTimeout(300);

    // Held still, then the image (never for a «حساسة» state).
    await page.evaluate('document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))').catch(() => {});
    let screenshot: CellResult['screenshot'] = null;
    if (job.measure.screenshots && !cell.sensitive) {
      const png = await page.screenshot({ type: 'png', fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css' });
      const file = `cell-${String(cell.index).padStart(4, '0')}.png`;
      writeFileSync(join(job.outDir, file), png, { mode: 0o600 });
      const size = pngSize(png);
      screenshot = { file, sha256: sha(png), width: size.width, height: size.height };
    }

    // axe, then the measures.
    let axe: CellResult['axe'] = null;
    if (axeSource && job.measure.axeTags) {
      await page.evaluate(axeSource);
      axe = await page.evaluate<CellResult['axe']>(
        `(async (tags) => {
          const r = await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'], preload: false });
          const item = (v) => ({ id: v.id, impact: v.impact ?? null, help: String(v.help).slice(0, 500), tags: v.tags.slice(0, 40), nodeCount: v.nodes.length, nodes: v.nodes.slice(0, 50).map((n) => {
            const d = (n.any || []).concat(n.all || [], n.none || []).find((c) => c.data && (c.data.fgColor || c.data.contrastRatio)) ;
            return { target: n.target.join(' ').slice(0, 1024), html: String(n.html).slice(0, 600), summary: String(n.failureSummary ?? '').slice(0, 1200), fgColor: d && d.data.fgColor ? String(d.data.fgColor) : null, bgColor: d && d.data.bgColor ? String(d.data.bgColor) : null, contrastRatio: d && typeof d.data.contrastRatio === 'number' ? d.data.contrastRatio : null };
          }) });
          return { version: r.testEngine.version, violations: r.violations.map(item), incomplete: r.incomplete.map(item), passes: r.passes.length };
        })(${JSON.stringify(job.measure.axeTags)})`,
      );
    }
    const styles = job.measure.styles ? await page.evaluate<CellResult['styles']>(`(${SAMPLE_STYLES})(${MAX_SAMPLED})`) : null;
    const fonts = job.measure.fonts ? await page.evaluate<CellResult['fonts']>(`(${FONTS_STATE})()`) : null;
    const rtl = job.measure.rtl ? await page.evaluate<CellResult['rtl']>(`(${RTL_MEASURE})()`) : null;

    // Where in the loaded scripts each error was thrown (for its source line).
    for (const c of consoleLog) {
      if (c.url && c.line !== null && c.column !== null && (c.level === 'pageerror' || c.level === 'error') && /\.m?js(\?|$)/.test(c.url)) {
        c.near = (await page.evaluate(`(${SCRIPT_NEAR})(${JSON.stringify({ url: c.url, line: c.line, column: c.column })})`).catch(() => null)) as string | null;
        c.nearAt = c.near === null ? null : Math.min(c.column, 300);
      }
    }
    closing = true;
    return { index: cell.index, key: cellKey(cell), url, error: null, expectations, screenshot, console: consoleLog, blocked: net.blocked, allowed: net.allowed, failed, mocked: net.mocked, fonts, styles, rtl, axe, perf: null, durationMs: Date.now() - started };
  } catch (e) {
    if (e instanceof Cancelled) throw e;
    return { ...emptyCell(cell, url, { code: 'crashed', detail: clip(e instanceof Error ? e.message.split('\n')[0]! : String(e), 1000) }, started), console: consoleLog, blocked: net.blocked, allowed: net.allowed, failed, mocked: net.mocked };
  } finally {
    if (ownContext) await context.close().catch(() => {});
    else await page?.close().catch(() => {});
  }
}

async function checkExpectation(page: Page, ex: ProbeCell['expect'][number], lang: string, index: number): Promise<CellResult['expectations'][number]> {
  const textOf = (t: string | Record<string, string>) => (typeof t === 'string' ? t : (t[lang] ?? t[lang.split('-')[0]!] ?? null));
  try {
    if ('visible' in ex) {
      const ok = await page.locator(ex.visible).first().waitFor({ state: 'visible', timeout: EXPECT_WAIT_MS }).then(() => true, (e: unknown) => {
        if (selectorError(e)) throw e;
        return false;
      });
      return { index, ok, expected: `visible: ${ex.visible}`, actual: ok ? null : 'not shown', invalidSelector: false };
    }
    if ('text' in ex) {
      const want = textOf(ex.text);
      if (want === null) return { index, ok: false, expected: `text (${lang})`, actual: 'no text declared for this language', invalidSelector: false };
      const scope = page.locator(ex.within ?? 'body').first();
      const ok = await scope.getByText(want).first().waitFor({ state: 'visible', timeout: EXPECT_WAIT_MS }).then(() => true, (e: unknown) => {
        if (selectorError(e)) throw e;
        return false;
      });
      const actual = ok ? null : await scope.innerText({ timeout: 1000 }).then((t) => clip(t.trim().replace(/\s+/g, ' '), 1200), () => (ex.within ? `not shown: ${ex.within}` : 'not shown'));
      return { index, ok, expected: `${ex.within ? `${ex.within}: ` : ''}${want}`, actual, invalidSelector: false };
    }
    const name = ex.name ? textOf(ex.name) : null;
    const ok = await page.getByRole(ex.role as Parameters<Page['getByRole']>[0], name ? { name } : {}).first().waitFor({ state: 'visible', timeout: EXPECT_WAIT_MS }).then(() => true, () => false);
    return { index, ok, expected: `role: ${ex.role}${name ? ` «${name}»` : ''}`, actual: ok ? null : 'not shown', invalidSelector: false };
  } catch (e) {
    return { index, ok: false, expected: JSON.stringify(ex).slice(0, 1200), actual: clip(e instanceof Error ? e.message.split('\n')[0]! : String(e), 1200), invalidSelector: true };
  }
}

/** E-21: the processor slowed 4×, a fresh context per load, the browser's timings and CDP's task times. */
async function perfCell(browser: Browser, job: ProbeJob, cell: ProbeCell, base: string): Promise<CellResult> {
  const started = Date.now();
  const url = cellUrl(base, cell);
  const runs: PerfRun[] = [];
  const net: NetworkLog = { blocked: [], allowed: [], mocked: [] };
  for (let i = 0; i < (job.perf?.repeats ?? 5); i++) {
    const context = await browser.newContext({ viewport: { width: cell.viewport.width, height: cell.viewport.height }, deviceScaleFactor: 1, locale: job.locale, timezoneId: job.timezone, reducedMotion: 'reduce', serviceWorkers: 'block' });
    try {
      await context.route('**/*', (route) => routeFor(route, job, cell, net));
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: job.perf?.cpuThrottle ?? 4 });
      try {
        await page.goto(url, { waitUntil: 'load', timeout: Math.min(job.cellTimeoutMs, 60_000) });
      } catch (e) {
        return { ...emptyCell(cell, url, { code: 'target_unreachable', detail: clip(e instanceof Error ? e.message.split('\n')[0]! : String(e), 1000) }, started), blocked: net.blocked };
      }
      await page.waitForTimeout(200);
      const t = await page.evaluate<Omit<PerfRun, 'taskMs' | 'scriptMs' | 'layoutMs'>>(`(${PERF_TIMINGS})()`);
      const metrics = (await cdp.send('Performance.getMetrics')).metrics;
      const m = (name: string) => {
        const v = metrics.find((x) => x.name === name)?.value;
        return typeof v === 'number' ? Math.round(v * 1000 * 10) / 10 : null;
      };
      runs.push({ ...t, taskMs: m('TaskDuration'), scriptMs: m('ScriptDuration'), layoutMs: m('LayoutDuration') });
    } finally {
      await context.close().catch(() => {});
    }
  }
  return { ...emptyCell(cell, url, null, started), blocked: net.blocked, allowed: net.allowed, perf: { runs } };
}

/** The width and height of a PNG from its header (IHDR). */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}
