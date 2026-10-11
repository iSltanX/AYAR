// The probe's judges on the fixture projects (C-14 with C-16; AT-16's rendered half, judge by judge): each planted
// defect becomes a finding with its rule and its source line, none in the sound variant, and the limits — no
// reference, no judgement («ناقص إعداد»); a target that did not answer or an invalid selector, «تعذّر»; a state with
// no declared expectation, «ناقص إعداد» (AT-19); no approved reference, «ناقص إعداد» (AT-17); a timing that is not
// stable, never judged (E-21).
import { afterEach, describe, expect, it } from 'vitest';
import type { AnalyzerResult } from '@ayar/analyzers';
import { judgeProbe, median, variation } from '../src/index.ts';
import { cell, judgeInput, materialize, meta, outcome } from './support.ts';

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups) c();
  cleanups = [];
});
function fx(project: string, variant: string): string {
  const m = materialize(project, variant);
  cleanups.push(m.cleanup);
  return m.root;
}
const found = (r: AnalyzerResult) => r.report.findings.map((f) => [f.rule, f.toolRule, f.location?.path ?? null, f.location?.line ?? null]);
const TOKENS = { tokens: { declared: 'design/tokens.json' } };
const TOKEN_FACTS = [{ key: 'references.tokens', component: '.', value: { path: 'design/tokens.json' }, source: null, proof: 'declared' as const, detector: 'test@1' }];

describe('design.tokens.render', () => {
  const sample = (prop: string, value: string, selector = '.status') => ({ selector, prop, value });
  it('passes when every computed value is a token, and finds an off-scale colour and spacing at their source lines', () => {
    const good = fx('FX-WEB-DESIGN', 'good');
    const inGood = outcome({ cells: [meta(0, 'default')], results: [cell(0, 'default/desktop/light/ar', { styles: [sample('background-color', 'rgb(11, 92, 213)'), sample('padding-top', '16px', '.item'), sample('border-top-left-radius', '8px'), sample('font-size', '14px')] })] });
    expect(judgeProbe(judgeInput(good, 'design.tokens.render', inGood, { references: TOKENS }))).toMatchObject({ exit: { kind: 'ok' }, report: { findings: [] } });
    const color = fx('FX-WEB-DESIGN', 'hardcoded-color');
    const c = judgeProbe(judgeInput(color, 'design.tokens.render', outcome({ cells: [meta(0, 'default'), meta(1, 'default', { lang: 'en' })], results: [cell(0, 'default/desktop/light/ar', { styles: [sample('background-color', 'rgb(26, 115, 232)')] }), cell(1, 'default/desktop/light/en', { styles: [sample('background-color', 'rgb(26, 115, 232)')] })] }), { references: TOKENS }));
    expect(found(c)).toEqual([['tokens.render-off-scale', null, 'styles/app.css', 101]]);
    expect(c.report.findings[0]!.location).toMatchObject({ state: 'default', viewport: 'desktop', theme: 'light', lang: 'ar', key: '.status' });
    const spacing = fx('FX-WEB-DESIGN', 'off-scale-spacing');
    const sides = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'].map((p) => sample(p, '15px', '.item'));
    expect(found(judgeProbe(judgeInput(spacing, 'design.tokens.render', outcome({ cells: [meta(0, 'default')], results: [cell(0, 'default/desktop/light/ar', { styles: sides })] }), { references: TOKENS })))).toEqual([['tokens.render-off-scale', null, 'styles/app.css', 87]]);
  });
  it('says what is missing without the tokens reference, and judges nothing', () => {
    const r = judgeProbe(judgeInput(fx('FX-WEB-DESIGN', 'good'), 'design.tokens.render', outcome({ cells: [meta(0, 'default')], results: [cell(0, 'k', { styles: [sample('color', 'rgb(1, 2, 3)')] })] })));
    expect(r.exit).toEqual({ kind: 'missing', reason: { key: 'analyzer.reason.noTokens' } });
    expect(r.report.findings).toEqual([]);
  });
});

describe('design.fonts.render', () => {
  it('finds an approved family whose face did not load, at its @font-face', () => {
    const root = fx('FX-WEB-DESIGN', 'silent-font-fallback');
    const faces = [{ family: 'Cairo', status: 'error', unicodeRange: 'U+600-6FF', style: 'normal', weight: '200 1000' }, { family: 'Cairo', status: 'loaded', unicodeRange: 'U+0-FF', style: 'normal', weight: '200 1000' }];
    const out = outcome({ cells: [meta(0, 'default')], results: [cell(0, 'default/desktop/light/ar', { fonts: { faces, families: ['Cairo'] }, failed: [{ url: 'GET http://127.0.0.1:1/fonts/cairo-arabic-wght-normal-missing.woff2', status: 404, reason: 'HTTP 404' }] })] });
    expect(found(judgeProbe(judgeInput(root, 'design.fonts.render', out, { references: { fonts: { declared: { approved: ['Cairo'] } } } })))).toEqual([['fonts.not-loaded', null, 'styles/app.css', 7]]);
    expect(judgeProbe(judgeInput(root, 'design.fonts.render', out)).exit).toEqual({ kind: 'missing', reason: { key: 'analyzer.reason.noFonts' } });
    const loaded = outcome({ cells: [meta(0, 'default')], results: [cell(0, 'k', { fonts: { faces: [faces[1]!], families: ['Cairo'] } })] });
    expect(found(judgeProbe(judgeInput(root, 'design.fonts.render', loaded, { references: { fonts: { declared: ['Cairo'] } } })))).toEqual([]);
  });
});

describe('design.a11y', () => {
  const contrast = (fg: string) => ({ id: 'color-contrast', impact: 'serious', help: 'Elements must meet minimum color contrast ratio thresholds', tags: ['wcag2aa'], nodeCount: 1, nodes: [{ target: '.item-meta', html: '<div class="item-meta">', summary: 'Fix any of the following', fgColor: fg, bgColor: '#ffffff', contrastRatio: 2.5 }] });
  it('finds a contrast violation at the colour token that sets it (FX-WEB-DESIGN) or at the style sheet (FX-EXT)', () => {
    const web = fx('FX-WEB-DESIGN', 'low-contrast-default');
    const r = judgeProbe(judgeInput(web, 'design.a11y', outcome({ cells: [meta(0, 'default')], results: [cell(0, 'default/desktop/light/ar', { axe: { version: '4.14.0', violations: [contrast('#9aa3af')], incomplete: [], passes: 30 } })] }), { facts: TOKEN_FACTS }));
    expect(found(r)).toEqual([['a11y.violation', 'color-contrast', 'design/tokens.json', 8]]);
    expect(r.report.findings[0]).toMatchObject({ severity: 'high', level: 'error' });
    const ext = fx('FX-EXT', 'low-contrast');
    expect(found(judgeProbe(judgeInput(ext, 'design.a11y', outcome({ targetKind: 'extension', targetDir: 'dist', cells: [meta(0, 'popup', { path: 'popup.html' })], results: [cell(0, 'popup/popup/light/ar', { axe: { version: '4.14.0', violations: [contrast('#b8b8b8')], incomplete: [], passes: 15 } })] }))))).toEqual([['a11y.violation', 'color-contrast', 'src/popup.css', 2]]);
  });
  it('makes a moderate impact a warning and an undecided item a suspicion to review', () => {
    const root = fx('FX-WEB-DESIGN', 'good');
    const item = (impact: string) => ({ id: 'region', impact, help: 'All page content should be contained by landmarks', tags: ['best-practice'], nodeCount: 1, nodes: [{ target: '.x', html: '<div>', summary: '', fgColor: null, bgColor: null, contrastRatio: null }] });
    const r = judgeProbe(judgeInput(root, 'design.a11y', outcome({ cells: [meta(0, 'default')], results: [cell(0, 'k', { axe: { version: '4.14.0', violations: [item('moderate')], incomplete: [{ ...item('serious'), id: 'color-contrast' }], passes: 1 } })] })));
    expect(r.report.findings.map((f) => [f.rule, f.level, f.proof])).toEqual([['a11y.violation', 'warning', null], ['a11y.incomplete', null, null]]);
    expect(r.report.signals.unresolved).toBe(1);
  });
});

describe('design.states', () => {
  const ex = (index: number, ok: boolean, expected: string, actual: string | null) => ({ index, ok, expected, actual, invalidSelector: false });
  it('finds an expectation that did not hold, at the source of what was shown instead', () => {
    const root = fx('FX-WEB-DESIGN', 'error-message-missing');
    const r = judgeProbe(judgeInput(root, 'design.states', outcome({ cells: [meta(0, 'error'), meta(1, 'error', { lang: 'en' })], states: [{ id: 'error', sensitive: false, reason: null, expectations: 2 }], results: [cell(0, 'error/desktop/light/ar', { expectations: [ex(0, true, 'visible', null), ex(1, false, 'تعذّر تحميل العناصر', 'حدث خطأ ما')] }), cell(1, 'error/desktop/light/en', { expectations: [ex(0, true, 'visible', null), ex(1, false, 'Could not load items', 'Something went wrong')] })] })));
    expect(found(r)).toEqual([['states.expectation-failed', null, 'src/i18n.js', 9]]);
  });
  it('is «ناقص إعداد» with a state that declares no expectation, and keeps what held (AT-19)', () => {
    const root = fx('FX-WEB-DESIGN', 'good');
    const r = judgeProbe(judgeInput(root, 'design.states', outcome({ cells: [meta(0, 'default'), meta(1, 'extra')], states: [{ id: 'default', sensitive: false, reason: null, expectations: 1 }, { id: 'extra', sensitive: false, reason: null, expectations: 0 }], results: [cell(0, 'default/d/l/ar', { expectations: [ex(0, true, 'x', null)] }), cell(1, 'extra/d/l/ar')] })));
    expect(r.exit).toEqual({ kind: 'missing', reason: { key: 'probe.reason.stateWithoutExpectation', params: { states: 'extra' } } });
  });
  it('is «تعذّر» when the target did not answer or a selector was invalid, never «أخفق»', () => {
    const root = fx('FX-WEB-DESIGN', 'good');
    const down = judgeProbe(judgeInput(root, 'design.states', outcome({ cells: [meta(0, 'default')], results: [cell(0, 'k', { error: { code: 'target_unreachable', detail: 'net::ERR_CONNECTION_REFUSED' } })] })));
    expect(down.exit).toMatchObject({ kind: 'tool_error', reason: { key: 'probe.reason.targetUnreachable' } });
    const bad = judgeProbe(judgeInput(root, 'design.states', outcome({ cells: [meta(0, 'default')], results: [cell(0, 'k', { expectations: [{ index: 0, ok: false, expected: 'x', actual: 'is not a valid selector', invalidSelector: true }] })] })));
    expect(bad.exit).toMatchObject({ kind: 'tool_error', reason: { key: 'probe.reason.invalidSelector' } });
    expect(judgeProbe(judgeInput(root, 'design.a11y', outcome({ failure: { code: 'browser_missing', detail: '' } }))).exit).toEqual({ kind: 'missing', reason: { key: 'probe.reason.browserMissing' } });
  });
});

describe('design.visual', () => {
  const key = { state: 'default', viewport: 'desktop', theme: 'light', lang: 'ar', platform: 'darwin-arm64', browser: '156.0.8078.4', density: 1, mode: 'headless' as const };
  const comp = (comparison: 'no_reference' | 'match' | 'differs' | 'other_environment', changed: { path: string; line: number | null; text: string }[] = []) => ({ index: 0, captureId: 'evd_1', key, comparison, diffRatio: comparison === 'differs' ? 0.02 : comparison === 'match' ? 0 : null, diffId: null, baselineId: comparison === 'no_reference' ? null : 'bas_1', changed });
  it('is «ناقص إعداد» without approved references, passes when they match, and asks for review on a difference', () => {
    const root = fx('FX-WEB-DESIGN', 'visual-change');
    expect(judgeProbe(judgeInput(root, 'design.visual', outcome({ cells: [meta(0, 'default')], comparisons: [comp('no_reference')] }))).exit).toEqual({ kind: 'missing', reason: { key: 'probe.reason.noApprovedReference', params: { count: 1 } } });
    expect(judgeProbe(judgeInput(root, 'design.visual', outcome({ cells: [meta(0, 'default')], comparisons: [comp('match')] })))).toMatchObject({ exit: { kind: 'ok' }, report: { findings: [] } });
    const d = judgeProbe(judgeInput(root, 'design.visual', outcome({ cells: [meta(0, 'default')], comparisons: [comp('differs', [{ path: 'design/tokens.json', line: 26, text: '"md": { "$value": "16px" }' }])] })));
    expect(found(d)).toEqual([['visual.diff', null, 'design/tokens.json', 26]]);
    expect(found(judgeProbe(judgeInput(root, 'design.visual', outcome({ cells: [meta(0, 'default')], comparisons: [comp('other_environment')] }))))).toEqual([['visual.diff', null, null, null]]);
  });
});

describe('beh.ext.host', () => {
  const ext = (o: Partial<{ loaded: boolean; error: string | null }>) => ({ loaded: o.loaded ?? true, error: o.error ?? null, id: o.loaded === false ? null : 'abcdefghijklmnopabcdefghijklmnop', serviceWorker: null, workerConsole: [] });
  const sum = (e: ReturnType<typeof ext>) => ({ browserVersion: '156.0.8078.4', mode: 'headless' as const, density: 1, platform: 'darwin-arm64', extension: e, servedAt: null, durationMs: 1 });
  it('finds Chromium\'s refusal at the manifest line it names', () => {
    for (const [variant, error, line] of [
      ['missing-icon', "Could not load icon 'assets/icon128.png' specified in 'icons'.", 10],
      ['msg-undefined', 'Variable __MSG_extTagline__ used but not defined.', 4],
      ['manifest-csp', `'content_security_policy.extension_pages': Insecure CSP value "'unsafe-eval'" in directive 'script-src'.`, 28],
    ] as const) {
      const r = judgeProbe(judgeInput(fx('FX-EXT', variant), 'beh.ext.host', outcome({ mode: 'extension', targetKind: 'extension', targetDir: 'dist', summary: sum(ext({ loaded: false, error })) })));
      expect(found(r), variant).toEqual([['ext.load-failed', null, 'public/manifest.json', line]]);
    }
  });
  it('finds a console error of a declared page at the source line of the code that threw, and passes the sound one', () => {
    const root = fx('FX-EXT', 'options-console-error');
    const near = 'r=document.getElementById(`saved`);t().then(e=>{n.checked=e.countSpaces}),n.addEventListener(`change`,()=>{e({countSpaces:n.checked}).then(()=>{r.textContent=`تم الحفظ`})}),document.getElementById(`experimental-panel`).hidden=!0;';
    const out = outcome({ mode: 'extension', targetKind: 'extension', targetDir: 'dist', cells: [meta(0, 'popup', { path: 'popup.html' }), meta(1, 'options', { path: 'options.html' })], summary: sum(ext({})), results: [cell(0, 'popup/popup/light/ar'), cell(1, 'options/popup/light/ar', { console: [{ level: 'pageerror', text: "TypeError: Cannot set properties of null (setting 'hidden')", url: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/assets/options-DorVEYir.js', line: 0, column: 316, near, nearAt: near.indexOf('.hidden') }] })] });
    expect(found(judgeProbe(judgeInput(root, 'beh.ext.host', out)))).toEqual([['ext.console-error', null, 'src/options.ts', 17]]);
    const good = outcome({ mode: 'extension', targetKind: 'extension', targetDir: 'dist', cells: [meta(0, 'popup')], summary: sum(ext({})), results: [cell(0, 'popup/popup/light/ar')] });
    expect(judgeProbe(judgeInput(fx('FX-EXT', 'good'), 'beh.ext.host', good))).toMatchObject({ exit: { kind: 'ok' }, report: { findings: [] } });
  });
});

describe('perf.web (E-21)', () => {
  const run = (fcp: number, load: number) => ({ fcp, lcp: fcp, load, domContentLoaded: 10, ttfb: 1, cls: 0, taskMs: 130, scriptMs: 20, layoutMs: 80, bytes: 80_000, requests: 9 });
  it('judges the median of the runs against the web budgets, and leaves an unstable timing unjudged', () => {
    const root = fx('FX-WEB-DESIGN', 'good');
    const stable = [run(118, 128), run(120, 130), run(117, 127), run(121, 129), run(119, 131)];
    const out = outcome({ mode: 'perf', cells: [meta(0, 'default')], results: [cell(0, 'default/desktop/light/ar', { perf: { runs: stable } })] });
    const over = judgeProbe(judgeInput(root, 'perf.web', out, { references: { budgets: { declared: { web: { fcpMs: 100, loadMs: 200 } } } } }));
    expect(over.report.findings.map((f) => [f.rule, f.expected, f.actual])).toEqual([['perf.budget-exceeded', '100', '119']]);
    const noisy = outcome({ mode: 'perf', cells: [meta(0, 'default')], results: [cell(0, 'k', { perf: { runs: [run(60, 128), run(130, 130), run(70, 127), run(160, 129), run(90, 131)] } })] });
    expect(judgeProbe(judgeInput(root, 'perf.web', noisy, { references: { budgets: { declared: { web: { fcpMs: 50 } } } } })).report.findings).toEqual([]);
    expect(judgeProbe(judgeInput(root, 'perf.web', out)).exit).toEqual({ kind: 'missing', reason: { key: 'probe.reason.noWebBudgets' } });
    expect([median([3, 1, 2]), median([4, 1, 2, 3]), Math.round(variation([10, 10, 10]) * 100)]).toEqual([2, 2.5, 0]);
  });
});
