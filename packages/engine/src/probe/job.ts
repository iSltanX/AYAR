// C-14 «المدخلات»: the probe's job, built from what the profile declares and what discovery found. The render target
// (declared, or the extension's build folder and the static site discovery proposes), the states (declared in the
// profile or in a JSON file of the project; without any, the target's entry pages, with no expectation), the matrix
// (viewports, themes, languages, each with its declared mechanism), and the cells enumerated in advance so the total
// is known (FR-29). Mock bodies from the project's files are read here, bounded, inside the project only. What cannot
// be built is a written reason, never a guess.
import { ProbeStates, ProbeStatesFile, RenderTarget, type CheckSpec, type Fact, type JsonValue, type ProbeState, type Reason } from '@ayar/protocol';
import { cellKey, type ActivationSpec, type MeasureSpec, type ProbeCell, type ProbeJob, type ProbeTargetSpec } from '@ayar/probe';
import { posix } from 'node:path';
import type { FileSystem } from '../ports/index.ts';

/** The web-probe checks that one pages execution serves (D-DEV7-03), and what each needs measured. */
export const PAGES_CHECKS = ['design.tokens.render', 'design.fonts.render', 'design.a11y', 'design.rtl.render', 'design.states', 'design.visual'] as const;
/** C-14 «إعداد axe». */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MAX_STATE_FILE = 1024 * 1024;
const MAX_MOCK_BODY = 4 * 1024 * 1024;
const MAX_CELLS = 2000;

export interface BuiltJob {
  job: Omit<ProbeJob, 'jobId' | 'browser' | 'outDir' | 'axePath'>;
  targetKind: 'url' | 'static' | 'storybook' | 'extension';
  /** The served or loaded folder, relative to the root, or null. */
  targetDir: string | null;
  states: { id: string; sensitive: boolean; reason: string | null; expectations: number }[];
  /** The companion service the target names (it must be among the spec's services). */
  service: string | null;
}

export type JobOutcome = { ok: true; built: BuiltJob } | { ok: false; outcome: 'missing' | 'unavailable'; reason: Reason };

const rec = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The value of a reference as a spec holds it (`{ declared }` or `{ discovered }`). */
export function referenceOf(v: JsonValue | undefined): unknown {
  const o = rec(v);
  return o.declared ?? o.discovered ?? null;
}

/** A file inside the project, read bounded and without leaving it through a link; null otherwise. */
async function readInside(fs: FileSystem, root: string, rel: string, max: number): Promise<string | null> {
  if (!rel || rel.includes('\0') || rel.startsWith('/') || rel.split('/').includes('..')) return null;
  const abs = posix.join(root, rel);
  const realRoot = (await fs.realpath(root)) ?? root;
  const real = await fs.realpath(abs);
  if (!real || (real !== realRoot && !real.startsWith(`${realRoot}/`))) return null;
  const st = await fs.stat(real);
  if (!st?.isFile || st.size > max) return null;
  return new TextDecoder().decode((await fs.readFilePrefix(real, max)).data);
}

/** The extension's pages its manifest declares: the popup, the options page, the side panel. */
function manifestPages(manifest: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'string' && v && !out.includes(v)) out.push(v.replace(/^\//, ''));
  };
  add(rec(manifest.action).default_popup);
  add(rec(manifest.browser_action).default_popup);
  add(manifest.options_page);
  add(rec(manifest.options_ui).page);
  add(rec(manifest.side_panel).default_path);
  return out;
}

function activation(a: { activation: { kind: string; param?: string; key?: string; name?: string } } | undefined): ActivationSpec {
  const x = a?.activation;
  if (!x) return { kind: 'none' };
  if (x.kind === 'query') return { kind: 'query', param: x.param! };
  if (x.kind === 'storage') return { kind: 'storage', key: x.key! };
  if (x.kind === 'cookie') return { kind: 'cookie', name: x.name! };
  return { kind: 'media' };
}

/** The language a target without a languages axis is shown in: the declared interface language, else discovery's. */
function defaultLanguage(context: { uiLanguages: string[] | null }, facts: readonly Fact[]): string {
  if (context.uiLanguages?.[0]) return context.uiLanguages[0];
  for (const key of ['ui.rtl', 'ui.locales', 'ui.languages']) {
    const langs = rec(facts.find((f) => f.key === key)?.value).languages;
    if (Array.isArray(langs) && typeof langs[0] === 'string') return langs[0];
  }
  const loc = rec(facts.find((f) => f.key === 'ui.defaultLocale')?.value).value;
  return typeof loc === 'string' ? loc : 'und';
}

export interface BuildInput {
  fs: FileSystem;
  root: string;
  /** The instance that runs, and the check ids its execution serves. */
  spec: CheckSpec;
  checks: readonly string[];
  /** The profile's declared references (states may be declared though the running instance does not use them). */
  declared: Record<string, JsonValue>;
  context: { uiLanguages: string[] | null };
  facts: readonly Fact[];
}

export async function buildJob(i: BuildInput): Promise<JobOutcome> {
  const mode: ProbeJob['mode'] = i.spec.checkId === 'perf.web' ? 'perf' : 'pages';
  // The target: the reference, or for beh.ext.host the extension's build folder discovery found.
  // The spec's value is wrapped (`{ declared }` or `{ discovered }`); the profile's own references are the raw values.
  let raw = referenceOf(i.spec.referenceValues.renderTarget) ?? i.declared.renderTarget ?? null;
  // beh.ext.host loads the extension whatever the pages checks render: a declared target that is not one is not its.
  if (i.spec.checkId === 'beh.ext.host' && rec(raw).kind !== 'extension') raw = null;
  if (!raw && i.spec.checkId === 'beh.ext.host') {
    const out = rec(i.facts.find((f) => f.key === 'references.buildOutput')?.value).dir;
    const manifest = rec(i.facts.find((f) => f.key === 'type.browserExtension')?.value);
    const generated = manifest.generated === true;
    // A manifest outside the build (public/) is copied into it; a source-only extension (no build) loads from its folder.
    raw = { kind: 'extension', dir: typeof out === 'string' ? out : generated ? 'dist' : posix.dirname(typeof manifest.manifest === 'string' ? manifest.manifest : 'manifest.json') };
  }
  if (!raw) return { ok: false, outcome: 'missing', reason: { key: 'setup.reason.missing.configuration', params: { ref: 'renderTarget' } } };
  const parsed = RenderTarget.safeParse(raw);
  if (!parsed.success) return { ok: false, outcome: 'unavailable', reason: { key: 'probe.reason.renderTargetInvalid', params: { detail: parsed.error.issues.slice(0, 2).map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') } } };
  const t = parsed.data;

  let target: ProbeTargetSpec;
  let targetDir: string | null = null;
  let service: string | null = null;
  switch (t.kind) {
    case 'service':
      target = { kind: 'url', baseUrl: t.url };
      service = t.service;
      break;
    case 'static':
      target = { kind: 'static', root: posix.join(i.root, t.dir), entry: t.entry ?? 'index.html' };
      targetDir = t.dir;
      break;
    case 'storybook':
      target = { kind: 'storybook', root: posix.join(i.root, t.dir) };
      targetDir = t.dir;
      break;
    case 'extension':
      target = { kind: 'extension', dir: posix.join(i.root, t.dir) };
      targetDir = t.dir;
      break;
  }
  if (targetDir !== null) {
    const st = await i.fs.stat(posix.join(i.root, targetDir)).catch(() => null);
    if (!st?.isDirectory) return { ok: false, outcome: 'unavailable', reason: { key: 'probe.reason.targetFolderMissing', params: { dir: targetDir } } };
  }

  // The states: declared (inline, or in a file of the project), else the target's own pages.
  let states: ProbeState[] = [];
  const declaredStates = referenceOf(i.spec.referenceValues.states) ?? i.declared.states ?? null;
  if (declaredStates && i.spec.checkId !== 'beh.ext.host') {
    const p = ProbeStates.safeParse(declaredStates);
    if (!p.success) return { ok: false, outcome: 'unavailable', reason: { key: 'probe.reason.statesInvalid', params: { detail: p.error.issues.slice(0, 2).map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') } } };
    if ('file' in p.data) {
      const text = await readInside(i.fs, i.root, p.data.file, MAX_STATE_FILE);
      if (text === null) return { ok: false, outcome: 'unavailable', reason: { key: 'probe.reason.statesUnreadable', params: { path: p.data.file } } };
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        return { ok: false, outcome: 'unavailable', reason: { key: 'probe.reason.statesInvalid', params: { detail: `${p.data.file}: ${e instanceof Error ? e.message.slice(0, 200) : 'invalid JSON'}` } } };
      }
      const f = ProbeStatesFile.safeParse(json);
      if (!f.success) return { ok: false, outcome: 'unavailable', reason: { key: 'probe.reason.statesInvalid', params: { detail: `${p.data.file}: ${f.error.issues.slice(0, 2).map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}` } } };
      states = f.data.states;
    } else states = p.data.states;
  } else if (t.kind === 'extension') {
    let pages = t.pages ?? [];
    if (!pages.length) {
      const m = await readInside(i.fs, i.root, posix.join(t.dir, 'manifest.json'), 1024 * 1024);
      try {
        pages = m ? manifestPages(JSON.parse(m) as Record<string, unknown>) : [];
      } catch {
        pages = [];
      }
    }
    states = pages.map((p) => ({ id: posix.basename(p).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32) || 'page', path: p }));
  } else if (t.kind === 'storybook') {
    const index = await readInside(i.fs, i.root, posix.join(t.dir, 'index.json'), 8 * 1024 * 1024);
    const entries = Object.values(rec(rec(index ? (JSON.parse(index) as unknown) : null).entries));
    states = entries.filter((e) => rec(e).type === 'story').slice(0, 50).map((e) => ({ id: String(rec(e).id).toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32), path: `iframe.html?id=${encodeURIComponent(String(rec(e).id))}&viewMode=story` }));
  } else states = [{ id: 'default', path: t.kind === 'static' ? (t.entry ?? '') || './' : '/' }];
  if (!states.length) return { ok: false, outcome: 'missing', reason: { key: 'probe.reason.noPages' } };
  const ids = new Set<string>();
  for (const s of states) {
    if (ids.has(s.id)) return { ok: false, outcome: 'unavailable', reason: { key: 'probe.reason.statesInvalid', params: { detail: `duplicate state ${s.id}` } } };
    ids.add(s.id);
  }

  // The matrix.
  const viewports = t.viewports ?? (t.kind === 'extension' ? [{ name: 'popup', width: 420, height: 640 }] : [{ name: 'desktop', width: 1440, height: 900 }]);
  const themes = t.themes ? t.themes.values.map((v) => ({ value: v, activation: activation(t.themes) })) : [{ value: 'light', activation: { kind: 'none' } as ActivationSpec }];
  const langs = t.languages ? t.languages.values.map((v) => ({ value: v, activation: activation(t.languages) })) : [{ value: defaultLanguage(i.context, i.facts), activation: { kind: 'none' } as ActivationSpec }];

  const cells: ProbeCell[] = [];
  for (const s of states) {
    const mock: ProbeCell['mock'] = [];
    for (const m of s.mock ?? []) {
      const { bodyFile, ...rest } = m;
      if (bodyFile) {
        const text = await readInside(i.fs, i.root, bodyFile, MAX_MOCK_BODY);
        if (text === null) return { ok: false, outcome: 'unavailable', reason: { key: 'probe.reason.mockUnreadable', params: { path: bodyFile, state: s.id } } };
        mock.push({ ...rest, bodyText: text });
      } else mock.push(rest);
    }
    for (const vp of viewports) {
      for (const [ti, th] of themes.entries()) {
        for (const [li, lang] of langs.entries()) {
          if (mode === 'perf' && (ti > 0 || li > 0)) continue; // E-21: one measured page per state and size
          cells.push({ index: cells.length, state: s.id, path: s.path, viewport: vp, theme: th, lang, setup: s.setup ?? [], mock, expect: s.expect ?? [], sensitive: s.sensitive === true });
        }
      }
    }
  }
  if (cells.length > MAX_CELLS) return { ok: false, outcome: 'unavailable', reason: { key: 'probe.reason.tooManyCells', params: { cells: cells.length, max: MAX_CELLS } } };

  const has = (c: string) => i.checks.includes(c);
  const tags = Array.isArray(rec(i.spec.thresholds).axeTags) ? (rec(i.spec.thresholds).axeTags as unknown[]).filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{2,32}$/.test(x)) : AXE_TAGS;
  const measure: MeasureSpec =
    i.spec.checkId === 'beh.ext.host'
      ? { styles: false, fonts: false, rtl: false, axeTags: null, screenshots: true }
      : mode === 'perf'
        ? { styles: false, fonts: false, rtl: false, axeTags: null, screenshots: false }
        : { styles: has('design.tokens.render'), fonts: has('design.fonts.render'), rtl: has('design.rtl.render'), axeTags: has('design.a11y') ? tags : null, screenshots: true };
  return {
    ok: true,
    built: {
      job: { mode: t.kind === 'extension' ? 'extension' : mode, target, cells, measure, perf: mode === 'perf' ? { cpuThrottle: 4, repeats: 5 } : null, allowHosts: [...(t.allowHosts ?? [])], cellTimeoutMs: 60_000, locale: 'en-US', timezone: 'UTC' },
      targetKind: target.kind,
      targetDir,
      states: states.map((s) => ({ id: s.id, sensitive: s.sensitive === true, reason: s.reason ?? null, expectations: s.expect?.length ?? 0 })),
      service,
    },
  };
}

/** The cells' keys as captures and findings name them. */
export function cellMeta(c: ProbeCell): { index: number; state: string; path: string; viewport: string; theme: string; lang: string; sensitive: boolean; key: string } {
  return { index: c.index, state: c.state, path: c.path, viewport: c.viewport.name, theme: c.theme.value, lang: c.lang.value, sensitive: c.sensitive, key: cellKey(c) };
}
