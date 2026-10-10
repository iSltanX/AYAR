// C-13 on the fixture projects (AT-16's static half, analyzer by analyzer): each planted defect found with its rule
// and place, none in the sound variant (the negative control), and the limits: no reference, no judgement («ناقص
// إعداد»); the main file unreadable, «تعذّر»; a suggestion never a violation.
import type { JsonValue } from '@ayar/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzerById, anchorsOf, coverageGaps, families, lcovGaps, measureFunctions, normalizeColor, parseSize, slug, stripJsonComments, untestedUnits, validVersion, type AnalyzerResult } from '../src/index.ts';
import { fact, input, materialize } from './support.ts';

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
const run = (id: string, i: Parameters<NonNullable<ReturnType<typeof analyzerById>>['run']>[0]): AnalyzerResult => analyzerById(id)!.run(i);
const found = (r: AnalyzerResult) => r.report.findings.map((f) => [f.rule, f.location?.path, f.location?.line]);

const EXT_FACTS = [fact('type.browserExtension', { manifest: 'public/manifest.json', generated: false, manifestVersion: 3 }), fact('references.buildOutput', { dir: 'dist' }), fact('ui.entryPages', { files: ['options.html', 'popup.html'] }), fact('ui.rtl', { files: ['popup.html'], languages: ['ar'] })];
const POLICY: Record<string, JsonValue> = { permissionsPolicy: { discovered: 'permissions-policy.json' } };

describe('sec.ext.manifest (FX-EXT)', () => {
  it('passes the sound extension (the build turns src/background.ts into background.js)', () => {
    const r = run('ext-manifest', input(fx('FX-EXT', 'good'), { checkId: 'sec.ext.manifest', facts: EXT_FACTS }));
    expect(r.exit).toEqual({ kind: 'ok' });
    expect(found(r)).toEqual([]);
  });
  it('finds the missing icon, the undefined message, and \'unsafe-eval\', each at its line', () => {
    expect(found(run('ext-manifest', input(fx('FX-EXT', 'missing-icon'), { checkId: 'sec.ext.manifest', facts: EXT_FACTS })))).toEqual([['manifest.missing-file', 'public/manifest.json', 10]]);
    expect(found(run('ext-manifest', input(fx('FX-EXT', 'msg-undefined'), { checkId: 'sec.ext.manifest', facts: EXT_FACTS })))).toEqual([['manifest.undefined-message', 'public/manifest.json', 4]]);
    expect(found(run('ext-manifest', input(fx('FX-EXT', 'manifest-csp'), { checkId: 'sec.ext.manifest', facts: EXT_FACTS })))).toEqual([['manifest.csp-unsafe-eval', 'public/manifest.json', 28]]);
  });
  it('makes the main file\'s failures the check\'s own: unparsable «تعذّر», a generated manifest not built «تعذّر»', () => {
    const root = fx('FX-EXT', 'good');
    const i = input(root, { checkId: 'sec.ext.manifest', facts: EXT_FACTS });
    const broken = { ...i, read: (rel: string) => (rel === 'public/manifest.json' ? '{ "name": ' : i.read(rel)) };
    expect(run('ext-manifest', broken).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'analyzer.reason.manifestUnparsable' } });
    const generated = input(root, { checkId: 'sec.ext.manifest', facts: [fact('type.browserExtension', { manifest: null, generated: true }), fact('references.buildOutput', { dir: 'dist' })] });
    expect(run('ext-manifest', generated).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'analyzer.reason.manifestNotBuilt' } });
  });
  it('reads comments as Chrome does, and warns; knows the version\'s form', () => {
    expect(stripJsonComments('{ // a\n "a": "x // y" /* b */ }')).toEqual({ json: '{     \n "a": "x // y"         }', comments: [{ line: 1 }, { line: 2 }] });
    expect(['1', '1.0.0', '0.1.2.3', '65535.0'].every(validVersion)).toBe(true);
    expect(['', '1.0.0.0.0', '01.0', '1.65536', 'v1'].some(validVersion)).toBe(false);
  });
});

describe('sec.ext.permissions (FX-EXT)', () => {
  it('passes the sound extension, and finds <all_urls> outside the policy', () => {
    expect(run('ext-permissions', input(fx('FX-EXT', 'good'), { checkId: 'sec.ext.permissions', facts: EXT_FACTS, references: POLICY })).report.findings.filter((f) => f.rule !== 'permission.maybe-unused')).toEqual([]);
    expect(found(run('ext-permissions', input(fx('FX-EXT', 'all-urls'), { checkId: 'sec.ext.permissions', facts: EXT_FACTS, references: POLICY }))).filter(([r]) => r !== 'permission.maybe-unused')).toEqual([['permission.outside-policy', 'public/manifest.json', 26]]);
  });
  it('asks a reason for a broad scope, and is «ناقص إعداد» with no policy', () => {
    const root = fx('FX-EXT', 'all-urls');
    const withBroad = { permissionsPolicy: { declared: { permissions: { storage: 'settings' }, host_permissions: { 'https://example.com/*': 'stop words', '<all_urls>': '' } } } };
    expect(found(run('ext-permissions', input(root, { checkId: 'sec.ext.permissions', facts: EXT_FACTS, references: withBroad }))).filter(([r]) => r !== 'permission.maybe-unused')).toEqual([['permission.broad-unjustified', 'public/manifest.json', 26]]);
    expect(run('ext-permissions', input(root, { checkId: 'sec.ext.permissions', facts: EXT_FACTS })).exit).toMatchObject({ kind: 'missing', reason: { key: 'analyzer.reason.noPolicy' } });
  });
});

describe('code.refs.local (FX-NOTEST)', () => {
  it('passes the sound project, and finds the broken link, the missing image and the broken anchor', () => {
    expect(found(run('refs-local', input(fx('FX-NOTEST', 'good'), { checkId: 'code.refs.local' })))).toEqual([]);
    expect(found(run('refs-local', input(fx('FX-NOTEST', 'broken-md-link'), { checkId: 'code.refs.local' })))).toEqual([['ref.missing-file', 'README.md', 5]]);
    expect(found(run('refs-local', input(fx('FX-NOTEST', 'missing-image'), { checkId: 'code.refs.local' })))).toEqual([['ref.missing-file', 'docs/index.html', 11]]);
    expect(found(run('refs-local', input(fx('FX-NOTEST', 'broken-anchor'), { checkId: 'code.refs.local' })))).toEqual([['ref.missing-anchor', 'README.md', 5]]);
  });
  it('rates a broken reference in a page high, in the documentation medium (C-16)', () => {
    expect(run('refs-local', input(fx('FX-NOTEST', 'missing-image'), { checkId: 'code.refs.local' })).report.findings[0]!.severity).toBe('medium');
  });
  it('slugs headings as GitHub does, Arabic kept', () => {
    expect(slug('Install & Run')).toBe('install--run');
    expect(slug('التثبيت السريع')).toBe('التثبيت-السريع');
    expect([...anchorsOf('a.md', '# A\n# A\n```\n# not\n```\n<a id="x"></a>')]).toEqual(['a', 'a-1', 'x']);
  });
});

const DESIGN: Record<string, JsonValue> = { tokens: { declared: { source: 'design/tokens.json', css: 'styles/tokens.css', scope: ['styles/app.css', 'index.html'], spacingScalePx: [0, 4, 8, 12, 16, 24, 32] } }, fonts: { declared: { approved: ['Cairo'] } } };

describe('design.tokens.static and design.fonts.static (FX-WEB-DESIGN)', () => {
  it('passes the sound app, with no violation', () => {
    const root = fx('FX-WEB-DESIGN', 'good');
    expect(run('tokens-static', input(root, { checkId: 'design.tokens.static', references: DESIGN })).report.findings.filter((f) => f.rule !== 'tokens.use-token')).toEqual([]);
    expect(found(run('fonts-static', input(root, { checkId: 'design.fonts.static', references: DESIGN })))).toEqual([]);
  });
  it('finds the colour and the spacing off the scale, and the undefined var(), at their lines', () => {
    const v = (variant: string) => found(run('tokens-static', input(fx('FX-WEB-DESIGN', variant), { checkId: 'design.tokens.static', references: DESIGN }))).filter(([r]) => r !== 'tokens.use-token');
    expect(v('hardcoded-color')).toEqual([['tokens.off-scale', 'styles/app.css', 101]]);
    expect(v('off-scale-spacing')).toEqual([['tokens.off-scale', 'styles/app.css', 87]]);
    expect(v('undefined-var')).toEqual([['tokens.undefined-var', 'styles/app.css', 94]]);
  });
  it('finds the missing @font-face file, and the font from a remote host as a warning', () => {
    expect(found(run('fonts-static', input(fx('FX-WEB-DESIGN', 'silent-font-fallback'), { checkId: 'design.fonts.static', references: DESIGN })))).toEqual([['fonts.face-missing', 'styles/app.css', 7]]);
    const remote = run('fonts-static', input(fx('FX-WEB-DESIGN', 'external-font-host'), { checkId: 'design.fonts.static', references: DESIGN }));
    expect(found(remote)).toEqual([['fonts.remote', 'index.html', 8]]);
    expect(remote.report.findings[0]!.level).toBe('warning');
  });
  it('invents no scale: no reference is «ناقص إعداد»', () => {
    const root = fx('FX-WEB-DESIGN', 'good');
    expect(run('tokens-static', input(root, { checkId: 'design.tokens.static' })).exit).toMatchObject({ kind: 'missing', reason: { key: 'analyzer.reason.noTokens' } });
    expect(run('fonts-static', input(root, { checkId: 'design.fonts.static' })).exit).toMatchObject({ kind: 'missing', reason: { key: 'analyzer.reason.noFonts' } });
  });
  it('normalizes colours and reads font stacks', () => {
    expect([normalizeColor('#ABC'), normalizeColor('rgb(26, 115, 232)'), normalizeColor('rgb(26 115 232 / 50%)'), normalizeColor('Red'), normalizeColor('var(--x)')]).toEqual(['#aabbcc', '#1a73e8', '#1a73e880', 'red', null]);
    expect(families(`'Cairo', "Noto Sans", sans-serif`)).toEqual(['Cairo', 'Noto Sans']);
    expect(families('var(--font-body)')).toEqual([]);
  });
});

describe('design.rtl.static (FX-EXT)', () => {
  it('passes the sound pages, and finds the entry page without dir', () => {
    expect(run('rtl-static', input(fx('FX-EXT', 'good'), { checkId: 'design.rtl.static', facts: EXT_FACTS })).report.findings.filter((f) => f.rule !== 'rtl.physical-property')).toEqual([]);
    expect(found(run('rtl-static', input(fx('FX-EXT', 'missing-dir'), { checkId: 'design.rtl.static', facts: EXT_FACTS }))).filter(([r]) => r !== 'rtl.physical-property')).toEqual([['rtl.missing-dir', 'popup.html', 2]]);
  });
});

describe('code.complexity (FX-NOTEST, ESLint\'s count)', () => {
  it('counts validatePayload 19, as ESLint does, and reports it above the declared 10', () => {
    const root = fx('FX-NOTEST', 'complex-function');
    const r = run('complexity', input(root, { checkId: 'code.complexity', thresholds: { complexity: 10 } }));
    expect(found(r)).toEqual([['complexity.cyclomatic', 'src/validate.js', 18]]);
    expect(r.report.findings[0]).toMatchObject({ toolRule: 'complexity', actual: '19', proof: null });
  });
  it('reports nothing without a threshold, and nothing in the sound project', () => {
    expect(found(run('complexity', input(fx('FX-NOTEST', 'complex-function'), { checkId: 'code.complexity' })))).toEqual([]);
    expect(found(run('complexity', input(fx('FX-NOTEST', 'good'), { checkId: 'code.complexity', thresholds: { complexity: 10 } })))).toEqual([]);
  });
  it('measures each function apart, nested ones too', () => {
    expect(measureFunctions('function a(x){ if(x){} const b = () => x ?? 1; return x && 2 }', 'a.js')).toEqual([{ name: 'a', line: 1, complexity: 3, lines: 1 }, { name: 'b', line: 1, complexity: 2, lines: 1 }]);
    expect(measureFunctions('const x = <T,>(a: T) => a', 'a.tsx')).toHaveLength(1);
    expect(measureFunctions('function (', 'a.js')).toBeNull();
  });
});

describe('code.size', () => {
  it('measures the output against the budgets, and always shows the sizes', () => {
    const root = fx('FX-NOTEST', 'good');
    const i = input(root, { checkId: 'code.size', facts: [fact('references.buildOutput', { dir: 'docs' })], references: { budgets: { declared: { total: '1 kB', byType: { css: 100000 } } } } });
    const r = run('size', i);
    expect(r.exit).toEqual({ kind: 'ok' });
    expect(r.report.findings.map((f) => f.rule)).toEqual(['size.over-budget', 'size.info']);
    expect(run('size', { ...i, references: {} }).exit).toMatchObject({ kind: 'missing', reason: { key: 'analyzer.reason.noBudgets' } });
    expect(run('size', { ...i, facts: [fact('references.buildOutput', { dir: 'out' })] }).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'analyzer.reason.noOutput' } });
    expect([parseSize('200 KB'), parseSize('1 KiB'), parseSize(5), parseSize('x')]).toEqual([200000, 1024, 5, null]);
  });
});

describe('the inventory of tests and gaps (C-13, for C-20)', () => {
  it('names the fourteen logic files of FX-NOTEST with no test (AT-44: from the inventory, not a number written)', () => {
    const root = fx('FX-NOTEST', 'good');
    const gaps = untestedUnits(input(root, { checkId: 'x' }).files);
    expect(gaps).toHaveLength(14);
    expect(gaps.every((g) => g.file.startsWith('src/'))).toBe(true);
  });
  it('reads Istanbul\'s and lcov\'s coverage for what never ran', () => {
    expect(coverageGaps({ '/p/src/a.js': { s: { 0: 0, 1: 0 }, f: {} }, '/p/src/b.js': { s: { 0: 1 }, f: { 0: 0 }, fnMap: { 0: { name: 'f', loc: { start: { line: 3 } } } } } }, '/p')).toEqual([{ file: 'src/a.js', kind: 'not-executed' }, { file: 'src/b.js', kind: 'function-not-executed', name: 'f', line: 3 }]);
    expect(lcovGaps('SF:/p/a.js\nFN:2,g\nFNDA:0,g\nLF:3\nLH:0\nend_of_record\n', '/p')).toEqual([{ file: 'a.js', kind: 'function-not-executed', name: 'g', line: 2 }, { file: 'a.js', kind: 'not-executed' }]);
  });
});
