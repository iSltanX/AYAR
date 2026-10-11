// The probe's judges (C-14 with C-16): what one probe execution saw, turned into findings in AYAR's terms for one
// check — design.tokens.render, design.fonts.render, design.rtl.render, design.a11y, design.states, design.visual,
// beh.ext.host and perf.web — with the exit signal of 7.3 when the execution itself says the check could not judge
// (the browser did not start, the target did not answer, a selector was invalid: «تعذّر»; a reference missing:
// «ناقص إعداد»). A judge never invents an aesthetic rule: without the reference it needs, it says what is missing
// (AT-18). Pure: the project's files through the analyzers' bounded reader, nothing written, nothing run.
import { finding, pushFinding } from '@ayar/adapters';
import { factValues, loadTokenScale, normalizeColor, refValue, report, SCALE_PROPS, type AnalyzerInput, type AnalyzerResult } from '@ayar/analyzers';
import type { ExitSignal, FindingLocation, ParsedReport, WebBudgets } from '@ayar/protocol';
import { WebBudgets as WebBudgetsSchema } from '@ayar/protocol';
import type { AxeItem, CellResult, PerfRun } from '../contract.ts';
import type { CellMeta, ProbeOutcome } from './outcome.ts';
import { Sources, type SourcePlace } from './sources.ts';

export * from './outcome.ts';
export * from './sources.ts';

export const PROBE_JUDGE_VERSION = '1.0.0';
const reader = { id: 'web-probe', version: PROBE_JUDGE_VERSION };
const OK: ExitSignal = { kind: 'ok' };

export interface ProbeJudgeInput extends AnalyzerInput {
  outcome: ProbeOutcome;
}

/** Right-to-left languages (design.rtl.render applies to their cells). */
export const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'ckb', 'dv', 'yi', 'sd', 'ug']);
const isRtl = (lang: string) => RTL_LANGS.has(lang.toLowerCase().split('-')[0]!);

function stateLocation(m: CellMeta | undefined, path: SourcePlace | null, extra: Partial<FindingLocation> = {}): FindingLocation {
  return {
    path: path?.path ?? null,
    ...(path ? { line: path.line } : {}),
    ...(m ? { page: m.path.slice(0, 1024), state: m.state, viewport: m.viewport, theme: m.theme, lang: m.lang } : {}),
    ...extra,
  };
}

function metaOf(o: ProbeOutcome): Map<number, CellMeta> {
  return new Map(o.cells.map((c) => [c.index, c]));
}

/**
 * What the execution says before any finding: it never ran (the browser missing or failed, cancelled), or its target
 * did not answer in any cell, or a declared selector was invalid. Null when the cells can be judged.
 */
function executionExit(o: ProbeOutcome, needsCells: boolean): ExitSignal | null {
  if (o.failure) {
    if (o.failure.code === 'browser_missing') return { kind: 'missing', reason: { key: 'probe.reason.browserMissing' } };
    return { kind: 'tool_error', reason: { key: `probe.reason.${o.failure.code === 'browser_failed' ? 'browserFailed' : 'failed'}`, params: { detail: o.failure.detail.slice(0, 300) } } };
  }
  if (!needsCells) return null;
  const invalid = o.results.find((r) => r.error?.code === 'invalid_selector' || r.expectations.some((e) => e.invalidSelector));
  if (invalid) return { kind: 'tool_error', reason: { key: 'probe.reason.invalidSelector', params: { detail: (invalid.error?.detail ?? invalid.expectations.find((e) => e.invalidSelector)?.actual ?? '').slice(0, 300) } } };
  if (o.results.length && o.results.every((r) => r.error)) {
    const e = o.results[0]!.error!;
    if (o.targetKind === 'extension' && o.summary?.extension && !o.summary.extension.loaded) return { kind: 'tool_error', reason: { key: 'probe.reason.extensionNotLoaded', params: { detail: (o.summary.extension.error ?? '').slice(0, 300) } } };
    return { kind: 'tool_error', reason: { key: e.code === 'setup_failed' ? 'probe.reason.setupFailed' : 'probe.reason.targetUnreachable', params: { detail: e.detail.slice(0, 300) } } };
  }
  const broken = o.results.find((r) => r.error && r.error.code !== 'timeout');
  if (broken) return { kind: 'tool_error', reason: { key: broken.error!.code === 'setup_failed' ? 'probe.reason.setupFailed' : 'probe.reason.targetUnreachable', params: { detail: broken.error!.detail.slice(0, 300), state: broken.key } } };
  const late = o.results.find((r) => r.error?.code === 'timeout');
  if (late) return { kind: 'tool_error', reason: { key: 'probe.reason.cellTimeout', params: { state: late.key } } };
  return null;
}

/** The facts kept with the evidence (11.9): the matrix, the images, what was refused on the network. */
function info(r: ParsedReport, o: ProbeOutcome): void {
  r.info.cells = o.results.length;
  r.info.captures = o.results.filter((x) => x.screenshot).length;
  r.info.uncaptured = o.cells.filter((c) => c.sensitive).length;
  r.info.mode = o.summary?.mode ?? null;
  r.info.browser = o.summary?.browserVersion ?? null;
  const blocked = [...new Set(o.results.flatMap((x) => x.blocked))].sort();
  r.info.blockedRequests = blocked.slice(0, 50);
  r.info.blockedCount = blocked.length;
  r.info.allowedRequests = [...new Set(o.results.flatMap((x) => x.allowed))].sort().slice(0, 50);
}

// ── design.tokens.render ───────────────────────────────────────────────────────────────────────────────────

function judgeTokens(i: ProbeJudgeInput, r: ParsedReport): ExitSignal {
  const loaded = loadTokenScale(i);
  if ('exit' in loaded) return loaded.exit;
  const scale = loaded.scale;
  const o = i.outcome;
  const sources = new Sources(i, o.targetDir ? [o.targetDir] : []);
  const metas = metaOf(o);
  const seen = new Map<string, { cells: string[]; selectors: Set<string> }>();
  const order: { key: string; prop: string; value: string; family: 'color' | 'spacing' | 'radius' | 'fontSize'; px: number | null; color: string | null; cell: number; selector: string }[] = [];
  for (const res of o.results) {
    for (const s of res.styles ?? []) {
      let family: 'color' | 'spacing' | 'radius' | 'fontSize' | null = null;
      if (SCALE_PROPS.color.test(s.prop)) family = 'color';
      else if (SCALE_PROPS.spacing.test(s.prop)) family = 'spacing';
      else if (SCALE_PROPS.radius.test(s.prop)) family = 'radius';
      else if (SCALE_PROPS.fontSize.test(s.prop)) family = 'fontSize';
      if (!family) continue;
      let off = false;
      let px: number | null = null;
      let color: string | null = null;
      if (family === 'color') {
        if (!scale.colors.size) continue;
        color = normalizeColor(s.value);
        off = color !== null && !scale.colors.has(color);
      } else {
        const list = family === 'spacing' ? scale.spacing : family === 'radius' ? scale.radius : scale.fontSize;
        if (!list.length) continue;
        px = Number.parseFloat(s.value);
        if (!Number.isFinite(px)) continue;
        off = !list.some((v) => Math.abs(v - px!) <= Math.max(scale.tolerancePx, 0.5));
      }
      if (!off) continue;
      const k = `${family}|${s.prop.replace(/-(top|right|bottom|left)(-(left|right))?(?=-|$)/g, '')}|${color ?? `${Math.round(px! * 100) / 100}px`}`;
      const entry = seen.get(k);
      if (entry) {
        if (entry.cells.length < 50 && !entry.cells.includes(res.key)) entry.cells.push(res.key);
        if (entry.selectors.size < 5) entry.selectors.add(s.selector);
        continue;
      }
      seen.set(k, { cells: [res.key], selectors: new Set([s.selector]) });
      order.push({ key: k, prop: s.prop, value: s.value, family, px, color, cell: res.index, selector: s.selector });
    }
  }
  for (const f of order) {
    const e = seen.get(f.key)!;
    const place = f.family === 'color' ? sources.color(f.color!, [], SCALE_PROPS.color) : sources.length(f.family === 'spacing' ? SCALE_PROPS.spacing : f.family === 'radius' ? SCALE_PROPS.radius : SCALE_PROPS.fontSize, f.px!);
    const shown = f.family === 'color' ? f.value : `${f.px}px`;
    pushFinding(r, finding({
      rule: 'tokens.render-off-scale',
      message: `${f.prop}: the computed ${shown} is not a value of the tokens (${[...e.selectors].join(', ')}; ${e.cells.length} cell(s): ${e.cells.slice(0, 4).join(', ')})`,
      location: stateLocation(metas.get(f.cell), place, { key: [...e.selectors][0]!.slice(0, 1024) }),
      anchor: { kind: 'state', value: f.key },
      actual: shown,
    }));
  }
  r.info.samples = o.results.reduce((n, x) => n + (x.styles?.length ?? 0), 0);
  return OK;
}

// ── design.fonts.render ────────────────────────────────────────────────────────────────────────────────────

function approvedFonts(i: AnalyzerInput): string[] | null {
  const v = refValue(i, 'fonts');
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const list = Array.isArray(o.approved) ? o.approved : Array.isArray(o.approved_fonts) ? o.approved_fonts : [];
    return list.filter((x): x is string => typeof x === 'string');
  }
  return null;
}

function judgeFonts(i: ProbeJudgeInput, r: ParsedReport): ExitSignal {
  const approved = approvedFonts(i);
  if (!approved?.length) return { kind: 'missing', reason: { key: 'analyzer.reason.noFonts' } };
  const want = new Set(approved.map((f) => f.toLowerCase()));
  const o = i.outcome;
  const sources = new Sources(i, o.targetDir ? [o.targetDir] : []);
  const metas = metaOf(o);
  const done = new Set<string>();
  for (const res of o.results) {
    for (const face of res.fonts?.faces ?? []) {
      if (face.status !== 'error' || !want.has(face.family.toLowerCase())) continue;
      const k = `${face.family}|${face.unicodeRange}|${face.style}|${face.weight}`;
      if (done.has(k)) continue;
      done.add(k);
      // The file the face asked for and did not get, and the @font-face that names it.
      const missing = res.failed.find((f) => /\.(woff2?|ttf|otf)(\?|$)/i.test(f.url));
      const file = missing ? decodeURIComponent(missing.url.split('/').pop() ?? '') : null;
      const place = file ? (sources.declarations().filter((d) => d.prop === 'src' && d.value.includes(file)).map((d) => ({ path: d.file, line: d.line, text: `src: ${d.value}`.slice(0, 300) }))[0] ?? null) : null;
      pushFinding(r, finding({
        rule: 'fonts.not-loaded',
        message: `${face.family} (${face.unicodeRange || 'all characters'}) did not load${missing ? `: ${missing.url} ${missing.status ?? missing.reason}` : ''}; the text falls back to another font`,
        location: stateLocation(metas.get(res.index), place),
        anchor: { kind: 'state', value: k },
        expected: face.family,
        actual: 'error',
      }));
    }
  }
  r.info.families = [...new Set(o.results.flatMap((x) => x.fonts?.families ?? []))].slice(0, 30);
  return OK;
}

// ── design.rtl.render ──────────────────────────────────────────────────────────────────────────────────────

function judgeRtl(i: ProbeJudgeInput, r: ParsedReport): ExitSignal {
  const o = i.outcome;
  const metas = metaOf(o);
  const rtlCells = o.results.filter((x) => isRtl(metas.get(x.index)?.lang ?? ''));
  if (!rtlCells.length) return { kind: 'missing', reason: { key: 'probe.reason.noRtlLanguage' } };
  const seen = new Set<string>();
  for (const res of rtlCells) {
    const m = metas.get(res.index);
    const rtl = res.rtl;
    if (!rtl) continue;
    const push = (k: string, message: string, extra: Partial<FindingLocation> = {}) => {
      if (seen.has(k)) return;
      seen.add(k);
      pushFinding(r, finding({ rule: 'rtl.render', message, location: stateLocation(m, null, extra), anchor: { kind: 'state', value: k } }));
    };
    if (rtl.direction !== 'rtl') push(`${m?.state}|direction`, `the root's computed direction is ${rtl.direction} in ${res.key} (dir=${rtl.dirAttribute ?? 'none'})`);
    if (rtl.overflowX > 1) push(`${m?.state}|${m?.viewport}|overflow`, `the page overflows horizontally by ${Math.round(rtl.overflowX)}px in ${res.key}`);
    for (const c of rtl.clipped) push(`${m?.state}|clip|${c.selector}`, `text is cut in ${c.selector} in ${res.key}: «${c.text.slice(0, 80)}»`, { key: c.selector });
  }
  r.info.rtlCells = rtlCells.length;
  return OK;
}

// ── design.a11y ────────────────────────────────────────────────────────────────────────────────────────────

/** axe's impact as AYAR's severity and level: critical and serious break the criterion (10.3), the rest warn. */
function axeLevel(impact: string | null): { severity: 'critical' | 'high' | 'medium' | 'low'; level: 'error' | 'warning' } {
  switch (impact) {
    case 'critical':
      return { severity: 'critical', level: 'error' };
    case 'serious':
      return { severity: 'high', level: 'error' };
    case 'moderate':
      return { severity: 'medium', level: 'warning' };
    default:
      return { severity: 'low', level: 'warning' };
  }
}

function judgeA11y(i: ProbeJudgeInput, r: ParsedReport): ExitSignal {
  const o = i.outcome;
  const metas = metaOf(o);
  // A colour's source is looked for in the design's tokens first: the reference when this check has it, else the
  // tokens file discovery found.
  const loaded = loadTokenScale(i);
  const tokenFiles = 'scale' in loaded ? [...loaded.scale.sourceFiles] : factValues(i, 'references.tokens').map((f) => f.path).filter((p): p is string => typeof p === 'string');
  const sources = new Sources(i, o.targetDir ? [o.targetDir] : []);
  const seen = new Set<string>();
  let unresolved = 0;
  const visit = (res: CellResult, item: AxeItem, incomplete: boolean) => {
    for (const node of item.nodes.length ? item.nodes : [{ target: '', html: '', summary: '', fgColor: null, bgColor: null, contrastRatio: null }]) {
      const k = `${incomplete ? 'incomplete' : 'violation'}|${item.id}|${node.target}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const place = node.fgColor ? sources.color(node.fgColor, tokenFiles, /^color$/) : null;
      const lv = axeLevel(item.impact);
      if (incomplete) unresolved++;
      pushFinding(r, finding({
        rule: incomplete ? 'a11y.incomplete' : 'a11y.violation',
        toolRule: item.id,
        severity: lv.severity,
        level: incomplete ? null : lv.level,
        message: `${item.help}${node.target ? ` — ${node.target}` : ''}${node.contrastRatio ? ` (contrast ${node.contrastRatio}:1, ${node.fgColor} on ${node.bgColor})` : ''} in ${res.key}`,
        location: stateLocation(metas.get(res.index), place, node.target ? { key: node.target.slice(0, 1024) } : {}),
        anchor: { kind: 'state', value: k },
        actual: node.summary.slice(0, 500) || null,
      }));
    }
  };
  for (const res of o.results) {
    for (const v of res.axe?.violations ?? []) visit(res, v, false);
    for (const v of res.axe?.incomplete ?? []) visit(res, v, true);
  }
  r.signals.unresolved = unresolved;
  r.info.axe = o.results.find((x) => x.axe)?.axe?.version ?? null;
  r.info.axeChecked = o.results.filter((x) => x.axe).length;
  return OK;
}

// ── design.states ──────────────────────────────────────────────────────────────────────────────────────────

function judgeStates(i: ProbeJudgeInput, r: ParsedReport): ExitSignal {
  const o = i.outcome;
  const metas = metaOf(o);
  const sources = new Sources(i, o.targetDir ? [o.targetDir] : []);
  const seen = new Set<string>();
  for (const res of o.results) {
    const m = metas.get(res.index);
    for (const e of res.expectations) {
      if (e.ok || e.invalidSelector) continue;
      const k = `${m?.state}|${e.index}`;
      if (seen.has(k)) continue;
      seen.add(k);
      // What was shown instead, found in the sources (the message that replaced the expected one).
      const place = e.actual && !/^not shown/.test(e.actual) ? sources.text(e.actual.slice(0, 200)) : null;
      pushFinding(r, finding({
        rule: 'states.expectation-failed',
        message: `the state ${m?.state}: expected ${e.expected}${e.actual ? `, shown: «${e.actual.slice(0, 200)}»` : ''} (${res.key})`,
        location: stateLocation(m, place),
        anchor: { kind: 'state', value: k },
        expected: e.expected,
        actual: e.actual,
      }));
    }
  }
  // AT-19: a state with no declared expectation is «ناقص إعداد», never «اجتاز» (a failure found elsewhere still decides).
  const bare = o.states.filter((s) => s.expectations === 0).map((s) => s.id);
  r.info.states = o.states.length;
  r.info.statesWithoutExpectation = bare;
  if (bare.length && !r.findings.length) return { kind: 'missing', reason: { key: 'probe.reason.stateWithoutExpectation', params: { states: bare.join(', ') } } };
  return OK;
}

// ── design.visual ──────────────────────────────────────────────────────────────────────────────────────────

function judgeVisual(i: ProbeJudgeInput, r: ParsedReport): ExitSignal {
  const o = i.outcome;
  const metas = metaOf(o);
  const comps = o.comparisons;
  if (!comps.length) return { kind: 'missing', reason: { key: 'probe.reason.noCaptures' } };
  for (const c of comps) {
    if (c.comparison !== 'differs' && c.comparison !== 'other_environment') continue;
    const place = c.changed[0] ? { path: c.changed[0].path, line: c.changed[0].line ?? 1, text: c.changed[0].text } : null;
    const k = `${c.key.state}/${c.key.viewport}/${c.key.theme}/${c.key.lang}`;
    pushFinding(r, finding({
      rule: 'visual.diff',
      message:
        c.comparison === 'differs'
          ? `${k}: ${((c.diffRatio ?? 0) * 100).toFixed(2)}% of the pixels differ from the approved reference${c.changed.length ? `; changed since its approval: ${c.changed.map((x) => `${x.path}${x.line ? `:${x.line}` : ''}`).join(', ')}` : ''}`
          : `${k}: the approved reference was taken in another rendering environment (platform or browser version); compare and approve again`,
      location: stateLocation(metas.get(c.index), c.changed[0]?.line ? place : null, c.changed[0] && !c.changed[0].line ? { path: c.changed[0].path } : {}),
      anchor: { kind: 'state', value: `${k}|${c.comparison}` },
      actual: c.comparison === 'differs' ? `${((c.diffRatio ?? 0) * 100).toFixed(3)}%` : 'other environment',
    }));
  }
  const without = comps.filter((c) => c.comparison === 'no_reference').length;
  r.info.compared = comps.filter((c) => c.comparison !== 'no_reference').length;
  r.info.withoutReference = without;
  r.signals.unresolved = r.findings.length;
  if (without && !r.findings.length) return { kind: 'missing', reason: { key: 'probe.reason.noApprovedReference', params: { count: without } } };
  return OK;
}

// ── beh.ext.host ───────────────────────────────────────────────────────────────────────────────────────────

/** The quoted names in Chromium's refusal (the icon's path, the message variable, the CSP value), for the manifest line. */
function quoted(error: string): string[] {
  const out: string[] = [];
  for (const m of error.matchAll(/"([^"]{2,200})"|'([^']{2,200})'|(__MSG_\w+__)/g)) out.push((m[1] ?? m[2] ?? m[3])!);
  return out.sort((a, b) => b.length - a.length);
}

/** The project's manifest the build copied (the same JSON as the loaded one), else the one outside the build. */
function sourceManifest(i: ProbeJudgeInput, dir: string | null): string | null {
  const loaded = dir ? i.read(`${dir}/manifest.json`) : null;
  const candidates = i.files.filter((f) => /(^|\/)manifest\.json$/.test(f) && !(dir && f.startsWith(`${dir}/`)) && !/(^|\/)node_modules\//.test(f));
  const same = loaded ? candidates.find((f) => sameJson(i.read(f), loaded)) : undefined;
  return same ?? candidates[0] ?? (dir ? `${dir}/manifest.json` : null);
}

function sameJson(a: string | null, b: string): boolean {
  try {
    return a !== null && JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
  } catch {
    return false;
  }
}

function judgeExtension(i: ProbeJudgeInput, r: ParsedReport): ExitSignal {
  const o = i.outcome;
  if (o.failure) return executionExit(o, false)!;
  const ext = o.summary?.extension;
  if (!ext) return { kind: 'tool_error', reason: { key: 'probe.reason.failed', params: { detail: 'no extension result' } } };
  r.info.extensionId = ext.id;
  r.info.serviceWorker = ext.serviceWorker;
  const sources = new Sources(i, o.targetDir ? [o.targetDir] : []);
  if (!ext.loaded) {
    const manifest = sourceManifest(i, o.targetDir);
    const place = manifest ? sources.lineOf(manifest, quoted(ext.error ?? '')) : null;
    pushFinding(r, finding({
      rule: 'ext.load-failed',
      message: `Chromium did not load the extension: ${ext.error ?? 'unknown'}`,
      location: { path: place?.path ?? manifest, ...(place ? { line: place.line } : {}) },
      anchor: { kind: 'state', value: `load|${(ext.error ?? '').replace(/[a-p]{32}/g, '<id>').slice(0, 300)}` },
      actual: ext.error,
    }));
    return OK;
  }
  const metas = metaOf(o);
  const seen = new Set<string>();
  for (const res of o.results) {
    if (res.error) {
      const k = `page|${metas.get(res.index)?.path}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pushFinding(r, finding({ rule: 'ext.load-failed', message: `the declared page ${metas.get(res.index)?.path} did not open: ${res.error.detail}`, location: stateLocation(metas.get(res.index), null), anchor: { kind: 'state', value: k }, actual: res.error.code }));
      continue;
    }
    for (const c of res.console) {
      if (c.level === 'warning') continue;
      const text = c.text.replace(/chrome-extension:\/\/[a-p]{32}/g, 'chrome-extension://<id>');
      const k = `console|${metas.get(res.index)?.path}|${text.slice(0, 300)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const place = c.near ? sources.near(c.near, c.nearAt ?? null) : null;
      pushFinding(r, finding({ rule: 'ext.console-error', message: `${metas.get(res.index)?.path}: ${text}`, location: stateLocation(metas.get(res.index), place), anchor: { kind: 'state', value: k }, actual: text.slice(0, 500) }));
    }
  }
  // DEV-12 (13.3 «نتائج المضيف»): the declared pages and whether each opened, with its console errors (facts for the panel).
  r.info.pages = [...new Set(o.results.map((x) => metas.get(x.index)?.path).filter((p): p is string => !!p))].slice(0, 50).map((path) => {
    const of = o.results.filter((x) => metas.get(x.index)?.path === path);
    return { path, opened: of.every((x) => !x.error), consoleErrors: of.reduce((n, x) => n + x.console.filter((c) => c.level !== 'warning').length, 0) };
  });
  r.info.workerErrors = ext.workerConsole.filter((c) => c.level !== 'warning').length;
  for (const c of ext.workerConsole) {
    if (c.level === 'warning') continue;
    const k = `worker|${c.text.slice(0, 300)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pushFinding(r, finding({ rule: 'ext.console-error', message: `service worker: ${c.text}`, location: null, anchor: { kind: 'state', value: k }, actual: c.text.slice(0, 500) }));
  }
  return OK;
}

// ── perf.web ───────────────────────────────────────────────────────────────────────────────────────────────

/** E-21: the metrics judged against a budget, with the run fields they read; the others are information only. */
const PERF_METRICS: [keyof WebBudgets, keyof PerfRun][] = [
  ['fcpMs', 'fcp'],
  ['lcpMs', 'lcp'],
  ['loadMs', 'load'],
  ['taskMs', 'taskMs'],
  ['scriptMs', 'scriptMs'],
  ['layoutMs', 'layoutMs'],
  ['cls', 'cls'],
  ['bytes', 'bytes'],
  ['requests', 'requests'],
];

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** The coefficient of variation (standard deviation over mean), 0 for a single value. */
export function variation(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean === 0) return 0;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  return sd / mean;
}

function webBudgets(i: AnalyzerInput): WebBudgets | null {
  const v = refValue(i, 'budgets');
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const web = (v as Record<string, unknown>).web;
  const p = WebBudgetsSchema.safeParse(web);
  return p.success && Object.keys(p.data).length ? p.data : null;
}

function judgePerf(i: ProbeJudgeInput, r: ParsedReport): ExitSignal {
  const budgets = webBudgets(i);
  if (!budgets) return { kind: 'missing', reason: { key: 'probe.reason.noWebBudgets' } };
  const o = i.outcome;
  const metas = metaOf(o);
  const measured: Record<string, Record<string, number | string | null>> = {};
  for (const res of o.results) {
    const runs = res.perf?.runs ?? [];
    if (!runs.length) continue;
    const row: Record<string, number | string | null> = {};
    for (const [budgetKey, field] of PERF_METRICS) {
      const xs = runs.map((x) => x[field]).filter((x): x is number => typeof x === 'number');
      if (!xs.length) continue;
      const med = median(xs);
      const cv = variation(xs);
      row[field] = Math.round(med * 1000) / 1000;
      const timing = field !== 'cls' && field !== 'bytes' && field !== 'requests';
      // E-21: under 20 ms or varying over 10%, a timing is reported «غير مستقر», never judged.
      const unstable = timing && (med < 20 || cv > 0.1);
      if (unstable) row[`${field}Unstable`] = `cv ${(cv * 100).toFixed(1)}%`;
      const limit = budgets[budgetKey];
      if (limit === undefined || unstable || med <= limit) continue;
      pushFinding(r, finding({
        rule: 'perf.budget-exceeded',
        message: `${budgetKey}: the median of ${xs.length} loads is ${Math.round(med * 10) / 10}, over the budget of ${limit} (${res.key}, the processor slowed ${4}×)`,
        location: stateLocation(metas.get(res.index), null),
        anchor: { kind: 'state', value: `${metas.get(res.index)?.state}|${metas.get(res.index)?.viewport}|${budgetKey}` },
        expected: String(limit),
        actual: String(Math.round(med * 10) / 10),
      }));
    }
    measured[res.key] = row;
  }
  r.info.measured = measured;
  if (!Object.keys(measured).length) return executionExit(o, true) ?? { kind: 'tool_error', reason: { key: 'probe.reason.noMeasure' } };
  return OK;
}

// ── dispatch ───────────────────────────────────────────────────────────────────────────────────────────────

const JUDGES: Record<string, (i: ProbeJudgeInput, r: ParsedReport) => ExitSignal> = {
  'design.tokens.render': judgeTokens,
  'design.fonts.render': judgeFonts,
  'design.rtl.render': judgeRtl,
  'design.a11y': judgeA11y,
  'design.states': judgeStates,
  'design.visual': judgeVisual,
  'beh.ext.host': judgeExtension,
  'perf.web': judgePerf,
};

export const PROBE_CHECKS = Object.keys(JUDGES);

/** One check's judgement of a probe execution. */
export function judgeProbe(i: ProbeJudgeInput): AnalyzerResult {
  const r = report(reader, ['probe-jsonl']);
  info(r, i.outcome);
  const judge = JUDGES[i.checkId];
  if (!judge) return { report: r, exit: { kind: 'tool_error', reason: { key: 'probe.reason.noJudge', params: { check: i.checkId } } } };
  if (i.checkId !== 'beh.ext.host') {
    const exit = executionExit(i.outcome, i.checkId !== 'design.visual');
    if (exit) return { report: r, exit };
  }
  return { report: r, exit: judge(i, r) };
}
