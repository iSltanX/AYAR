// The probe's own contract (C-14, D-DEV7-01): the job the engine hands over — a resolved target, the cells of the
// matrix enumerated in advance (so the total is known and the progress is a true ratio, FR-29), what to measure, the
// network rule, the folder its images go to — and the messages it sends back while it works: one per cell, as each
// ends, then the end of the job. Both sides validate every message: the engine trusts nothing the probe sends that
// does not match, and the probe runs nothing it was not sent.
import { ProbeExpectation, ProbeMock, ProbeStep, z } from '@ayar/protocol';

const Abs = z.string().min(1).max(4096).refine((p) => p.startsWith('/') && !p.includes('\0'), 'not an absolute path');
const Text = (max: number) => z.string().max(max);

/** The browser (C-11, E-11): Playwright's Chromium, run headless; its version enters every reference key. */
export const ProbeBrowser = z.strictObject({ executablePath: Abs, version: z.string().max(64) });

export const ProbeTargetSpec = z.discriminatedUnion('kind', [
  /** A companion service's address (it is running when the job starts). */
  z.strictObject({ kind: z.literal('url'), baseUrl: z.string().max(2048) }),
  /** A folder the probe serves itself on 127.0.0.1, at a random port, with nothing outside it reachable. */
  z.strictObject({ kind: z.literal('static'), root: Abs, entry: z.string().max(1024) }),
  /** A static Storybook build: its `iframe.html?id=<story>` pages, served the same way. */
  z.strictObject({ kind: z.literal('storybook'), root: Abs }),
  /** A built extension's folder, loaded in a persistent context (S-18, E-11). */
  z.strictObject({ kind: z.literal('extension'), dir: Abs }),
]);
export type ProbeTargetSpec = z.infer<typeof ProbeTargetSpec>;

export const ActivationSpec = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('media') }),
  z.strictObject({ kind: z.literal('query'), param: z.string() }),
  z.strictObject({ kind: z.literal('storage'), key: z.string() }),
  z.strictObject({ kind: z.literal('cookie'), name: z.string() }),
]);
export type ActivationSpec = z.infer<typeof ActivationSpec>;

/** One cell of the matrix: a state at one viewport, theme and language. */
export const ProbeCell = z.strictObject({
  index: z.int().nonnegative(),
  state: z.string().max(64),
  /** The page: an address path, a story id, an extension page. */
  path: z.string().max(2048),
  viewport: z.strictObject({ name: z.string().max(32), width: z.int().positive(), height: z.int().positive() }),
  theme: z.strictObject({ value: z.string().max(64), activation: ActivationSpec }),
  lang: z.strictObject({ value: z.string().max(16), activation: ActivationSpec }),
  setup: z.array(ProbeStep),
  /** Mock bodies from the project's files are read by the engine and passed as text. */
  mock: z.array(ProbeMock.omit({ bodyFile: true }).extend({ bodyText: z.string().max(4 * 1024 * 1024).optional() })),
  expect: z.array(ProbeExpectation),
  /** G-29: no image, ever; its measures and axe results stay. */
  sensitive: z.boolean(),
});
export type ProbeCell = z.infer<typeof ProbeCell>;

export const MeasureSpec = z.strictObject({
  /** design.tokens.render: computed values of the visible elements. */
  styles: z.boolean(),
  /** design.fonts.render: document.fonts and the families in use. */
  fonts: z.boolean(),
  /** design.rtl.render: direction, overflow and clipped text, in a right-to-left language. */
  rtl: z.boolean(),
  /** design.a11y: axe with these tags (C-14 «إعداد axe»), or null. */
  axeTags: z.array(z.string().regex(/^[a-z0-9-]{2,32}$/)).max(16).nullable(),
  screenshots: z.boolean(),
});
export type MeasureSpec = z.infer<typeof MeasureSpec>;

/** E-21: perf.web's method — the processor slowed, the median of repeated loads. */
export const PerfSpec = z.strictObject({ cpuThrottle: z.number().min(1).max(20), repeats: z.int().min(1).max(15) });

export const ProbeJob = z.strictObject({
  jobId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  mode: z.enum(['pages', 'extension', 'perf']),
  browser: ProbeBrowser,
  target: ProbeTargetSpec,
  cells: z.array(ProbeCell).max(2000),
  measure: MeasureSpec,
  perf: PerfSpec.nullable(),
  /** Hosts allowed by name (a declared network action); everything else outside this machine is refused and logged. */
  allowHosts: z.array(z.string().max(253)).max(20),
  /** Where the images go (inside AYAR's tmp, the instance's folder); the profile of a persistent context too. */
  outDir: Abs,
  /** axe-core's source, read by the probe from this file (its own copy, bundled with AYAR). */
  axePath: Abs.nullable(),
  /** Per cell: the page load, the expectations, the measures (C-14 «الهدف لا يستجيب»: «تعذّر»). */
  cellTimeoutMs: z.int().min(1000).max(300_000),
  /** Fixed for stable renders (C-14 «ثبات العرض»). */
  locale: z.string().max(16),
  timezone: z.string().max(64),
});
export type ProbeJob = z.infer<typeof ProbeJob>;

export const ConsoleEntry = z.strictObject({
  level: z.enum(['error', 'warning', 'pageerror']),
  text: Text(4000),
  url: Text(2048).nullable(),
  line: z.int().nonnegative().nullable(),
  column: z.int().nonnegative().nullable(),
  /** The source code around the position in the loaded script (for the source's line, D-DEV7-05), and where in it. */
  near: Text(600).nullable(),
  nearAt: z.int().nonnegative().nullable().optional(),
});
export type ConsoleEntry = z.infer<typeof ConsoleEntry>;

export const ExpectationResult = z.strictObject({
  index: z.int().nonnegative(),
  ok: z.boolean(),
  /** What was expected, in words (the selector, the text in this language, the role). */
  expected: Text(1200),
  /** What was found instead: the text of the element the expectation names, or why nothing was found. */
  actual: Text(1200).nullable(),
  /** An invalid selector is the probe's «تعذّر», not the project's failure (C-14 «الأخطاء»). */
  invalidSelector: z.boolean(),
});

export const StyleSample = z.strictObject({
  selector: Text(512),
  prop: z.string().max(64),
  value: Text(256),
});

export const FontFace = z.strictObject({ family: Text(256), status: z.string().max(16), unicodeRange: Text(1024), style: z.string().max(32), weight: z.string().max(32) });

export const AxeNode = z.strictObject({
  target: Text(1024),
  html: Text(600),
  summary: Text(1200),
  fgColor: z.string().max(32).nullable(),
  bgColor: z.string().max(32).nullable(),
  contrastRatio: z.number().nullable(),
});
export const AxeItem = z.strictObject({ id: z.string().max(128), impact: z.string().max(16).nullable(), help: Text(500), tags: z.array(z.string().max(64)).max(40), nodes: z.array(AxeNode).max(50), nodeCount: z.int().nonnegative() });
export type AxeItem = z.infer<typeof AxeItem>;

export const RtlMeasure = z.strictObject({
  dirAttribute: z.string().max(8).nullable(),
  direction: z.string().max(8),
  /** Horizontal overflow of the document, in CSS pixels. */
  overflowX: z.number(),
  /** Elements whose text is cut (clipped without an ellipsis), at most 20. */
  clipped: z.array(z.strictObject({ selector: Text(512), text: Text(200) })).max(20),
});

export const PerfRun = z.strictObject({
  fcp: z.number().nullable(),
  lcp: z.number().nullable(),
  load: z.number().nullable(),
  domContentLoaded: z.number().nullable(),
  ttfb: z.number().nullable(),
  cls: z.number().nullable(),
  taskMs: z.number().nullable(),
  scriptMs: z.number().nullable(),
  layoutMs: z.number().nullable(),
  bytes: z.int().nonnegative(),
  requests: z.int().nonnegative(),
});
export type PerfRun = z.infer<typeof PerfRun>;

export const CellResult = z.strictObject({
  index: z.int().nonnegative(),
  key: z.string().max(256),
  url: Text(2048),
  /** The page could not be shown: the target did not answer, or the cell did not finish in time. */
  error: z.strictObject({ code: z.enum(['target_unreachable', 'navigation', 'timeout', 'setup_failed', 'invalid_selector', 'crashed']), detail: Text(1000) }).nullable(),
  expectations: z.array(ExpectationResult),
  /** The image's file name in outDir, or null (a «حساسة» state, or an error before it could be taken). */
  screenshot: z.strictObject({ file: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/), sha256: z.string().regex(/^[0-9a-f]{64}$/), width: z.int().positive(), height: z.int().positive() }).nullable(),
  console: z.array(ConsoleEntry).max(200),
  blocked: z.array(Text(2048)).max(200),
  allowed: z.array(Text(2048)).max(200),
  /** Requests that failed or answered 4xx/5xx (a missing image or font shows here), with mocked ones apart. */
  failed: z.array(z.strictObject({ url: Text(2048), status: z.int().nullable(), reason: Text(200) })).max(200),
  mocked: z.array(z.strictObject({ url: Text(2048), status: z.int().nullable(), delayMs: z.int().nonnegative(), aborted: z.boolean() })).max(200),
  fonts: z.strictObject({ faces: z.array(FontFace).max(100), families: z.array(Text(256)).max(100) }).nullable(),
  styles: z.array(StyleSample).max(5000).nullable(),
  rtl: RtlMeasure.nullable(),
  axe: z.strictObject({ version: z.string().max(32), violations: z.array(AxeItem).max(200), incomplete: z.array(AxeItem).max(200), passes: z.int().nonnegative() }).nullable(),
  perf: z.strictObject({ runs: z.array(PerfRun).max(15) }).nullable(),
  durationMs: z.int().nonnegative(),
});
export type CellResult = z.infer<typeof CellResult>;

/** E-11, AT-20: what the extension's loading gave, and the mode it ran in (recorded in the evidence). */
export const ExtensionResult = z.strictObject({
  loaded: z.boolean(),
  /** Chromium's own words when it refused to load it (CDP Extensions.loadUnpacked, D-DEV7-04). */
  error: Text(2000).nullable(),
  id: z.string().regex(/^[a-p]{32}$/).nullable(),
  serviceWorker: Text(2048).nullable(),
  /** The service worker's console errors while the pages were open. */
  workerConsole: z.array(ConsoleEntry).max(100),
});
export type ExtensionResult = z.infer<typeof ExtensionResult>;

export const ProbeSummary = z.strictObject({
  browserVersion: z.string().max(64),
  mode: z.enum(['headless', 'headed']),
  density: z.number().positive(),
  platform: z.string().max(32),
  extension: ExtensionResult.nullable(),
  /** The address the pages were served at (a static folder on 127.0.0.1, with its random port). */
  servedAt: Text(2048).nullable(),
  durationMs: z.int().nonnegative(),
});
export type ProbeSummary = z.infer<typeof ProbeSummary>;

export const ToProbe = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('run'), job: ProbeJob }),
  z.strictObject({ type: z.literal('cancel') }),
]);
export type ToProbe = z.infer<typeof ToProbe>;

export const FromProbe = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), pid: z.int().positive(), node: z.string().max(32), playwright: z.string().max(32) }),
  z.strictObject({ type: z.literal('started'), jobId: z.string(), total: z.int().nonnegative() }),
  z.strictObject({ type: z.literal('cell'), jobId: z.string(), done: z.int().nonnegative(), total: z.int().nonnegative(), result: CellResult }),
  z.strictObject({ type: z.literal('done'), jobId: z.string(), summary: ProbeSummary }),
  /** The job could not run at all (the browser would not start): «تعذّر» or «ناقص» with this reason. */
  z.strictObject({ type: z.literal('failed'), jobId: z.string(), code: z.enum(['browser_missing', 'browser_failed', 'target_unreachable', 'cancelled', 'internal']), detail: Text(2000) }),
]);
export type FromProbe = z.infer<typeof FromProbe>;

/** The key of a cell, as its captures and findings name it (`state/viewport/theme/lang`). */
export function cellKey(c: Pick<ProbeCell, 'state' | 'viewport' | 'theme' | 'lang'>): string {
  return `${c.state}/${c.viewport.name}/${c.theme.value}/${c.lang.value}`;
}
