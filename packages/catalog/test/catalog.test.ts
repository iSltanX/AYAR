// C-08 (part 1): the built-in catalog is complete against 10.3 and 11.6, every text key exists in both
// languages, and loading rejects an invalid catalog and warns about stale entries (NFR-06).
import { MESSAGES } from '@ayar/i18n';
import { describe, expect, it } from 'vitest';
import { builtinCatalogData, canonicalJson, CatalogError, loadCatalog, type CatalogData } from '../src/index.ts';

const NOW = new Date('2026-10-10T12:00:00Z');
const load = (raw: unknown = builtinCatalogData(), now = NOW) => loadCatalog(raw, { now });
const data = () => builtinCatalogData() as CatalogData;

// The checks of 10.3, by section, verbatim.
const PLAN_CHECKS = {
  design: ['design.tokens.static', 'design.tokens.render', 'design.fonts.static', 'design.fonts.render', 'design.a11y', 'design.a11y.review', 'design.rtl.static', 'design.rtl.render', 'design.states', 'design.visual'],
  security: ['sec.secrets.files', 'sec.secrets.history', 'sec.deps', 'sec.deps.audit', 'sec.sast', 'sec.ext.manifest', 'sec.ext.permissions'],
  code: ['code.build', 'code.types', 'code.lint', 'code.unused', 'code.refs.local', 'code.refs.external', 'code.size', 'code.complexity'],
  behavior: ['beh.unit', 'beh.integration', 'beh.e2e', 'beh.contract', 'beh.ext.host', 'beh.stability', 'beh.mutation'],
  performance: ['perf.web', 'perf.load', 'perf.recovery', 'perf.compat'],
  integrity: ['integ.guard', 'integ.state', 'integ.model-claims', 'integ.reviews'],
  custom: ['custom.*'],
};

describe('built-in catalog (10.3, 11.6)', () => {
  const { catalog, stale } = load();

  it('loads, with a version and a content hash', () => {
    expect(catalog.version).toBe('1.1.0');
    expect(catalog.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stale).toEqual([]);
  });

  it('defines every check of 10.3 in its section, and nothing else', () => {
    for (const [section, ids] of Object.entries(PLAN_CHECKS)) {
      expect(catalog.checks.filter((c) => c.section === section).map((c) => c.id).sort()).toEqual([...ids].sort());
    }
    expect(catalog.checks).toHaveLength(41);
    expect(catalog.aiTemplates.map((t) => t.id).sort()).toEqual(['ai.docs-consistency', 'ai.logic-review', 'ai.structure-review', 'ai.test-gaps', 'ai.threat-review', 'ai.ui-copy']);
  });

  it('follows the «الافتراضي» column of 10.3', () => {
    const kind = (id: string) => catalog.check(id)!.default;
    const ids = (pred: (id: string) => boolean) => catalog.checks.map((c) => c.id).filter(pred).sort();
    // م ح ك: the blocking list (7.4 says 10.3 is its only reference).
    expect(ids((id) => kind(id).kind === 'required' && (kind(id) as { blocking: boolean }).blocking)).toEqual(['beh.unit', 'code.build', 'code.types', 'sec.ext.manifest', 'sec.secrets.files']);
    // م ك
    expect(ids((id) => kind(id).kind === 'required' && !(kind(id) as { blocking: boolean }).blocking)).toEqual(['beh.ext.host', 'code.lint', 'code.refs.local', 'sec.deps', 'sec.ext.permissions']);
    // خ
    expect(ids((id) => kind(id).kind === 'optional')).toEqual(
      ['beh.mutation', 'beh.stability', 'code.complexity', 'code.refs.external', 'code.unused', 'custom.*', 'design.visual', 'perf.compat', 'perf.load', 'perf.recovery', 'perf.web', 'sec.deps.audit', 'sec.secrets.history'].sort(),
    );
    // بشرط
    expect(ids((id) => kind(id).kind === 'conditional')).toEqual(
      ['beh.contract', 'beh.e2e', 'beh.integration', 'code.size', 'design.a11y', 'design.a11y.review', 'design.fonts.render', 'design.fonts.static', 'design.rtl.render', 'design.rtl.static', 'design.states', 'design.tokens.render', 'design.tokens.static', 'sec.sast'].sort(),
    );
    expect(ids((id) => kind(id).kind === 'alwaysOn')).toEqual(PLAN_CHECKS.integrity.slice().sort());
    // The audience conditions (FR-13, AT-05 step 4).
    expect(kind('design.a11y')).toEqual({ kind: 'conditional', when: { audience: ['small_group', 'public'] } });
    expect(kind('design.a11y.review')).toEqual({ kind: 'conditional', when: { audience: ['public'] } });
    expect(kind('sec.sast')).toEqual({ kind: 'conditional', when: { audience: ['public'] } });
  });

  it('maps every check of the index to one criterion of 11.6, and leaves complexity and integrity out', () => {
    expect(catalog.criteria).toHaveLength(26);
    for (const c of catalog.checks) {
      if (c.id === 'code.complexity' || c.section === 'integrity') {
        expect(c.inIndex, c.id).toBe(false);
        expect(c.criterion, c.id).toBeNull();
      } else {
        expect(catalog.criterion(c.criterion!)!.checks, c.id).toContain(c.id);
      }
    }
    expect(catalog.criterion('vulnerabilities')!.checks).toEqual(['sec.deps', 'sec.deps.audit']);
    expect(catalog.criterion('custom')!.checks).toEqual(['custom.*']);
  });

  it('carries the relations of 10.3', () => {
    expect(catalog.check('code.size')!.relations.dependsOn.map((d) => d.check)).toEqual(['code.build']);
    expect(catalog.check('beh.stability')!.relations.includes).toEqual(['beh.unit']);
    expect(catalog.check('beh.e2e')!.relations.sharesExecutionWith).toEqual(['perf.compat']);
    expect(catalog.check('sec.deps')!.relations.alternativeTo).toEqual(['sec.deps.audit']);
    expect(catalog.check('sec.ext.manifest')!.relations.dependsOn).toEqual([{ check: 'code.build', when: { signal: 'ext.manifestGenerated' } }]);
  });

  it('tags cost (12.10), next steps (12.7) and timeouts by resource class (7.4)', () => {
    expect(catalog.check('code.refs.external')!.cost).toBe('network');
    expect(catalog.check('sec.deps.audit')!.cost).toBe('network');
    expect(catalog.checks.filter((c) => c.cost === 'model')).toEqual([]);
    expect(catalog.aiTemplates.every((t) => t.cost === 'model')).toBe(true);
    expect(catalog.nextStep('beh.unit', 'missing_tests')).toBe('model');
    expect(catalog.nextStep('beh.unit', 'missing')).toBe('direct');
    expect(catalog.nextStep('design.visual', 'needs_review')).toBe('review');
    expect(catalog.nextStep('code.complexity', 'warning')).toBe('model');
    expect(catalog.timeoutMinutes(catalog.check('beh.mutation')!)).toBe(60);
    expect(catalog.timeoutMinutes(catalog.check('sec.ext.manifest')!)).toBe(2);
  });

  it('has a message for every text key, in both languages', () => {
    const keys = new Set<string>();
    for (const c of catalog.checks) Object.values(c.text).forEach((k) => keys.add(k));
    for (const c of catalog.criteria) keys.add(c.name);
    for (const s of catalog.sections) keys.add(s.name);
    for (const t of catalog.aiTemplates) Object.values(t.text).forEach((k) => keys.add(k));
    for (const e of catalog.redaction.sensitiveNames.exceptions) keys.add(e.reason);
    for (const r of catalog.commandPolicy.refused) keys.add(r.label);
    for (const d of catalog.commandPolicy.dangerous) keys.add(d.label);
    for (const c of catalog.checks) for (const r of catalog.rules.forCheck(c.id)!.rules) keys.add(`catalog.rule.${r}.title`);
    const ar = MESSAGES.ar as Record<string, string>;
    const en = MESSAGES.en as Record<string, string>;
    for (const k of keys) {
      expect(ar[k], `ar ${k}`).toBeTruthy();
      expect(en[k], `en ${k}`).toBeTruthy();
    }
  });
});

describe('loading an invalid catalog (C-08: an invalid catalog stops the engine)', () => {
  const broken = (mutate: (d: CatalogData) => void): CatalogData => {
    const d = data();
    mutate(d);
    return d;
  };
  const issuesOf = (raw: unknown): readonly string[] => {
    try {
      load(raw);
    } catch (e) {
      expect(e).toBeInstanceOf(CatalogError);
      return (e as CatalogError).issues;
    }
    throw new Error('expected the catalog to be rejected');
  };

  it('rejects a schema violation, naming where', () => {
    const issues = issuesOf(broken((d) => ((d.checkFiles[0]!.checks[0] as { resourceClass: string }).resourceClass = 'enormous')));
    expect(issues.join('\n')).toMatch(/checkFiles\.0\.checks\.0\.resourceClass/);
  });

  it('rejects a condition on an unknown signal', () => {
    expect(issuesOf(broken((d) => ((d.checkFiles[0]!.checks[0] as { applies: unknown }).applies = { signal: 'styles.anything' }))).length).toBeGreaterThan(0);
  });

  it('rejects broken cross-references', () => {
    const issues = issuesOf(
      broken((d) => {
        d.criteria = d.criteria.filter((c) => c.id !== 'build'); // code.build loses its criterion
        d.checkFiles[1]!.checks[0]!.relations.dependsOn.push({ check: 'beh.nothing' });
        d.checkFiles[1]!.checks[0]!.sources.push('S-999');
      }),
    );
    expect(issues).toEqual(expect.arrayContaining([expect.stringMatching(/code\.build: unknown criterion build/), expect.stringMatching(/unknown check beh\.nothing/), expect.stringMatching(/unknown source S-999/)]));
  });

  it('rejects a duplicate check, an integrity check in the index, and a dependsOn cycle', () => {
    const issues = issuesOf(
      broken((d) => {
        const code = d.checkFiles.find((f) => f.section === 'code')!;
        code.checks.push(structuredClone(code.checks.find((c) => c.id === 'code.lint')!));
        const build = code.checks.find((c) => c.id === 'code.build')!;
        build.relations.dependsOn.push({ check: 'code.size' }); // code.size already depends on code.build
        const guard = d.checkFiles.find((f) => f.section === 'integrity')!.checks[0]!;
        guard.default = { kind: 'required', blocking: false };
      }),
    );
    expect(issues).toEqual(expect.arrayContaining([expect.stringMatching(/duplicate check id/), expect.stringMatching(/dependsOn cycle/), expect.stringMatching(/integrity checks are always on/)]));
  });

  it('rejects a redaction or command pattern that does not compile', () => {
    expect(issuesOf(broken((d) => (d.redaction.highConfidence[0]!.regex.pattern = '([unclosed')))).toEqual([expect.stringMatching(/redaction aws-access-key-id: invalid regex/)]);
    expect(issuesOf(broken((d) => (d.commandPolicy.dangerous[0]!.regexes[0]!.pattern = '(?<'))).join()).toMatch(/command mass-delete\[0\]: invalid regex/);
  });

  it('rejects something that is not a catalog at all', () => {
    expect(issuesOf(null).length).toBeGreaterThan(0);
    expect(issuesOf({ manifest: {} }).length).toBeGreaterThan(0);
  });
});

describe('staleness (NFR-06: an entry verified more than 180 days ago warns)', () => {
  it('warns about an entry older than 180 days, and only about it', () => {
    const d = data();
    d.checkFiles[0]!.checks[0]!.verifiedAt = '2026-03-01'; // 223 days before NOW
    d.sources[0]!.verifiedAt = '2026-04-13'; // exactly 180 days: not stale yet
    const { stale } = load(d);
    expect(stale).toEqual([{ kind: 'check', id: 'design.tokens.static', verifiedAt: '2026-03-01', ageDays: 223 }]);
  });

  it('marks every entry stale once the whole catalog is old', () => {
    const { stale } = load(builtinCatalogData(), new Date('2027-06-01T00:00:00Z'));
    expect(stale.filter((s) => s.kind === 'check')).toHaveLength(41);
    expect(stale.map((s) => s.kind)).toEqual(expect.arrayContaining(['aiTemplate', 'source', 'redaction', 'commandPolicy']));
  });
});

describe('catalog hash', () => {
  it('does not depend on key order, and changes with the content', () => {
    const a = load().catalog.hash;
    const reordered: unknown = JSON.parse(JSON.stringify(builtinCatalogData(), (_k, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)));
    expect(load(reordered).catalog.hash).toBe(a);
    const d = data();
    d.checkFiles[0]!.checks[0]!.version = '1.0.1';
    expect(load(d).catalog.hash).not.toBe(a);
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });
});
