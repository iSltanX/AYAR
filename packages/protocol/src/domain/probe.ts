// The web probe's contracts (C-14, protocol 1.4, DEV-7): what the profile declares for it — the render target
// with its matrix (viewports, themes, languages, the hosts allowed by name), the states with their setup steps,
// network simulations and declared expectations, the web budgets — and what the UI reads of a run: the captures
// (one per state × viewport × theme × language, none for a «حساسة» state) with their comparison to the approved
// reference image of the same key, and the approved references themselves (FR-35, D-27: approved explicitly, per
// platform, browser, viewport, theme, language and state; never updated by AYAR on its own).
import { Id, IsoTimestamp, JsonValue } from '../common.ts';
import { z } from '../zod.ts';
import { RelPath } from './discovery.ts';
import { ServiceName } from './profile.ts';

/** Only this machine (C-14 «شبكة المسبار»): a service URL, like a readiness URL, never leaves it. */
const LOOPBACK_URL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/[^\s]*)?$/;
const Name = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/);
/** A host the user allows by name for this project's pages (a declared network action, «يحتاج شبكة»). */
const HostName = z.string().regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
/** A CSS selector as declared: checked by the browser itself; an invalid one makes its state «تعذّر» (C-14). */
const Selector = z.string().min(1).max(1024);
/** Text per language (`{ "ar": "…", "en": "…" }`), or one text for every language. */
const LangText = z.union([z.string().min(1).max(1000), z.record(z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/), z.string().min(1).max(1000))]);

export const ProbeViewport = z.strictObject({ name: Name, width: z.int().min(200).max(4000), height: z.int().min(200).max(4000) });
export type ProbeViewport = z.infer<typeof ProbeViewport>;

/**
 * How a theme or a language is turned on (C-14 «المصفوفة»): `media` emulates `prefers-color-scheme` (themes `light`
 * and `dark` only); `query` adds a parameter to the page's address; `storage` sets a key in localStorage before the
 * page loads; `cookie` sets a cookie for the page's origin. A language with no mechanism is the browser's alone,
 * which does not switch an application's language (S-21): its matrix keeps one language.
 */
export const ProbeActivation = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('media') }),
  z.strictObject({ kind: z.literal('query'), param: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/) }),
  z.strictObject({ kind: z.literal('storage'), key: z.string().min(1).max(128) }),
  z.strictObject({ kind: z.literal('cookie'), name: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/) }),
]);
export type ProbeActivation = z.infer<typeof ProbeActivation>;

export const ProbeAxis = z.strictObject({ values: z.array(Name).min(1).max(8), activation: ProbeActivation });
export type ProbeAxis = z.infer<typeof ProbeAxis>;

const matrix = {
  /** Default: one desktop size (1440×900, C-14's example). */
  viewports: z.array(ProbeViewport).min(1).max(6).optional(),
  themes: ProbeAxis.optional(),
  languages: ProbeAxis.optional(),
  /** Hosts allowed by name for these pages: a network action declared in the profile, each request logged. */
  allowHosts: z.array(HostName).max(20).optional(),
};

/**
 * C-14 «الأهداف»: a companion service's address (FR-21: the service named here starts before the probe and stops
 * after it), a folder AYAR serves itself on 127.0.0.1 (a random port, no directory listing, nothing outside it), a
 * static Storybook build (its stories from index.json), or a built extension's folder loaded in a persistent context
 * (its pages opened at chrome-extension://<id>/…).
 */
export const RenderTarget = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('service'), service: ServiceName, url: z.string().max(2048).regex(LOOPBACK_URL, 'an address on this machine'), ...matrix }),
  z.strictObject({ kind: z.literal('static'), dir: RelPath, entry: RelPath.optional(), ...matrix }),
  z.strictObject({ kind: z.literal('storybook'), dir: RelPath, ...matrix }),
  z.strictObject({ kind: z.literal('extension'), dir: RelPath, pages: z.array(RelPath).min(1).max(20).optional(), ...matrix }),
]);
export type RenderTarget = z.infer<typeof RenderTarget>;

/** A setup step of a state (C-14: «خطوات تهيئة محدودة»): click, fill, press a key, or wait for an element. */
export const ProbeStep = z.union([
  z.strictObject({ click: Selector }),
  z.strictObject({ fill: Selector, value: z.string().max(2000) }),
  z.strictObject({ press: z.string().regex(/^[A-Za-z0-9+]{1,32}$/) }),
  z.strictObject({ waitFor: Selector, timeoutMs: z.int().min(100).max(30_000).optional() }),
]);
export type ProbeStep = z.infer<typeof ProbeStep>;

/**
 * A network simulation (C-14: «نمط طلب مع تأخير أو رمز حالة أو جسم من ملف تجهيز»): the request's path (or a glob of
 * it, `*` within a segment and `**` across), answered with a status, after a delay, with a body or a file of the
 * project; or aborted (a connection failure).
 */
export const ProbeMock = z.strictObject({
  url: z.string().min(1).max(1024),
  status: z.int().min(100).max(599).optional(),
  delayMs: z.int().min(0).max(60_000).optional(),
  body: JsonValue.optional(),
  bodyFile: RelPath.optional(),
  contentType: z.string().max(128).optional(),
  abort: z.boolean().optional(),
});
export type ProbeMock = z.infer<typeof ProbeMock>;

/** A declared expectation (C-14): an element shown, a text shown (inside an element), or an accessibility role. */
export const ProbeExpectation = z.union([
  z.strictObject({ visible: Selector }),
  z.strictObject({ text: LangText, within: Selector.optional() }),
  z.strictObject({ role: z.string().regex(/^[a-z]{2,32}$/), name: LangText.optional() }),
]);
export type ProbeExpectation = z.infer<typeof ProbeExpectation>;

export const ProbeState = z.strictObject({
  id: Name,
  description: z.string().max(500).optional(),
  /** The page: an address path for a service or a folder, a story id for Storybook, an extension page. */
  path: z.string().min(1).max(2048),
  setup: z.array(ProbeStep).max(20).optional(),
  mock: z.array(ProbeMock).max(20).optional(),
  /** None: «ناقص إعداد: حالة بلا توقع معلن» (AT-19), never «اجتاز». */
  expect: z.array(ProbeExpectation).max(20).optional(),
  /** «حساسة»: no image is ever taken of it (its measures and axe results stay), and it says why (G-29). */
  sensitive: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});
export type ProbeState = z.infer<typeof ProbeState>;

/** The states, written in the profile or in a JSON file of the project (`{ "file": "design/states.json" }`). */
export const ProbeStates = z.union([z.strictObject({ states: z.array(ProbeState).min(1).max(100) }), z.strictObject({ file: RelPath })]);
export type ProbeStates = z.infer<typeof ProbeStates>;
export const ProbeStatesFile = z.looseObject({ states: z.array(ProbeState).min(1).max(100) });

/**
 * perf.web's budgets (E-21: measured with the processor slowed 4×, the median of five runs): in milliseconds for
 * the paint, load and main-thread times, a number for the layout shift, bytes and requests for the transfer. Under
 * `web` in the profile's budgets, beside code.size's.
 */
export const WebBudgets = z.strictObject({
  fcpMs: z.number().positive().optional(),
  lcpMs: z.number().positive().optional(),
  loadMs: z.number().positive().optional(),
  taskMs: z.number().positive().optional(),
  scriptMs: z.number().positive().optional(),
  layoutMs: z.number().positive().optional(),
  cls: z.number().nonnegative().optional(),
  bytes: z.int().positive().optional(),
  requests: z.int().positive().optional(),
});
export type WebBudgets = z.infer<typeof WebBudgets>;

/**
 * The key of a reference image (C-14 «المقارنة البصرية», plan 14.1 `baselines.key_json`): the state, the viewport,
 * the theme, the language, the platform, the browser's version, the pixel density, and E-11's mode (a headless
 * capture is never compared with a headed reference).
 */
export const CaptureKey = z.strictObject({
  state: Name,
  viewport: Name,
  theme: z.string().max(64),
  lang: z.string().max(16),
  platform: z.string().max(32),
  browser: z.string().max(64),
  density: z.number().positive(),
  mode: z.enum(['headless', 'headed']),
});
export type CaptureKey = z.infer<typeof CaptureKey>;

/** How a capture compares (C-14): the approved reference of the same key, or why there is none to compare with. */
export const CaptureComparison = z.enum(['no_reference', 'match', 'differs', 'other_environment']);

export const CaptureView = z.strictObject({
  /** The capture's evidence id: what baseline.approve names. */
  id: Id,
  checkRunId: Id,
  key: CaptureKey,
  page: z.string().max(2048),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  width: z.int().positive(),
  height: z.int().positive(),
  comparison: CaptureComparison,
  /** The share of pixels that differ (0–1) when compared; null otherwise. */
  diffRatio: z.number().min(0).max(1).nullable(),
  /** The evidence ids of the diff image and of the reference it was compared with. */
  diffId: Id.nullable(),
  baselineId: Id.nullable(),
});
export type CaptureView = z.infer<typeof CaptureView>;

/** A state with no image (G-29): shown in the gallery with its reason, never captured. */
export const UncapturedView = z.strictObject({ state: Name, viewport: Name, theme: z.string(), lang: z.string(), reason: z.string() });

export const BaselineView = z.strictObject({
  id: Id,
  projectId: Id,
  key: CaptureKey,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  approvedAt: IsoTimestamp,
  /** The capture it was approved from (its run may be gone since; the image stays with the reference). */
  approvedFromCheckRunId: Id.nullable(),
  status: z.enum(['active', 'replaced']),
});
export type BaselineView = z.infer<typeof BaselineView>;
