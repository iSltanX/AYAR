// G-38 and C-16 (DEV-6): AYAR's rules — every check has its display code and its rules, the codes are unique, the
// tables of C-16 hold (test, build and type failures high; a high-confidence secret critical; a permission
// outside the policy high; Knip low; complexity info), D-34's levels (only a proven rule breaks the criterion or
// warns), and the Semgrep package (D-13): versioned, its rules in the book, and each rule with its test project.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { builtinCatalogData, CatalogError, loadCatalog, type CatalogData } from '../src/index.ts';

const NOW = new Date('2026-10-11T12:00:00Z');
const { catalog } = loadCatalog(undefined, { now: NOW });
const TESTS = new URL('./semgrep/', import.meta.url).pathname;

describe('AYAR rules (G-38)', () => {
  it('gives every check its code and rules, the codes unique, every section a code', () => {
    const codes = catalog.checks.map((c) => catalog.rules.forCheck(c.id)!.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of catalog.checks) {
      const entry = catalog.rules.forCheck(c.id)!;
      expect(entry.code, c.id).toMatch(/^[A-Z0-9]{2,8}$/);
      for (const r of entry.rules) expect(catalog.rules.rule(r), `${c.id} ${r}`).toBeDefined();
    }
    expect(catalog.rules.forCheck('custom.lint-docs')).toEqual(catalog.rules.forCheck('custom.*'));
    expect(['design', 'security', 'code', 'behavior', 'performance', 'custom', 'integrity'].map((s) => catalog.rules.sectionCode(s))).toEqual(['DSN', 'SEC', 'COD', 'BEH', 'PRF', 'CUS', 'INT']);
    expect(catalog.rules.forCheck('sec.ext.permissions')!.code).toBe('PERM');
    expect(catalog.rules.forCheck('beh.unit')!.code).toBe('UNIT');
  });

  it('follows the severity tables of C-16', () => {
    const sev = (id: string) => catalog.rules.rule(id)!.severity;
    expect([sev('test.failed'), sev('build.failed'), sev('types.error')]).toEqual(['high', 'high', 'high']);
    expect(sev('secret.detected')).toBe('critical');
    expect(sev('permission.outside-policy')).toBe('high');
    expect(sev('ref.missing-file')).toBe('high');
    expect(sev('size.over-budget')).toBe('medium');
    expect([sev('unused.unlisted'), sev('unused.unresolved'), sev('unused.item')]).toEqual(['low', 'low', 'low']);
    expect([sev('complexity.cyclomatic'), sev('complexity.length')]).toEqual(['info', 'info']);
  });

  it('keeps D-34: a suggestion never has a level, a suspicion never breaks the criterion by itself', () => {
    const { rules } = builtinCatalogData() as CatalogData;
    for (const r of rules.rules) if (r.proof !== 'proven') expect(r.level, r.id).toBeNull();
    expect(catalog.rules.rule('complexity.cyclomatic')).toMatchObject({ proof: 'suggestion', level: null });
    expect(catalog.rules.rule('permission.broad-unjustified')).toMatchObject({ proof: 'proven', level: 'warning' });
  });

  it('rejects a check without rules, an unknown rule, a duplicate code, a Semgrep rule outside the book', () => {
    const broken = (mutate: (d: CatalogData) => void): string => {
      const d = builtinCatalogData() as CatalogData;
      mutate(d);
      try {
        loadCatalog(d, { now: NOW });
      } catch (e) {
        expect(e).toBeInstanceOf(CatalogError);
        return (e as CatalogError).issues.join('\n');
      }
      throw new Error('expected a rejection');
    };
    expect(broken((d) => delete d.rules.checks['code.lint'])).toMatch(/check code\.lint has no entry/);
    expect(broken((d) => d.rules.checks['code.lint']!.rules.push('lint.nothing'))).toMatch(/unknown rule lint\.nothing/);
    expect(broken((d) => (d.rules.checks['code.lint']!.code = 'UNIT'))).toMatch(/code UNIT .* used twice/);
    expect(broken((d) => (d.semgrep.rules[0]!.id = 'ayar.js.nothing'))).toMatch(/semgrep ayar\.js\.nothing: not a rule of the book/);
    expect(broken((d) => ((d.semgrep.rules[0]!.metadata as { ayar: { version: string } }).ayar.version = '9.9.9'))).toMatch(/version 9\.9\.9/);
  });
});

describe('the Semgrep rules package (D-13)', () => {
  it('is versioned, and every rule has its test project with positive and negative cases', () => {
    expect(catalog.semgrep.version).toBe('1.0.0');
    expect(JSON.parse(catalog.semgrep.configText()).rules).toHaveLength(catalog.semgrep.ids.length);
    const files = readdirSync(TESTS);
    for (const id of catalog.semgrep.ids) {
      const file = files.find((f) => f.slice(0, f.lastIndexOf('.')) === id);
      expect(file, id).toBeDefined();
      const text = readFileSync(TESTS + file!, 'utf8');
      expect(text, id).toMatch(new RegExp(`(//|#) ruleid: ${id.replaceAll('.', '\\.')}\\n`));
      expect(text, id).toMatch(new RegExp(`(//|#) ok: ${id.replaceAll('.', '\\.')}\\n`));
    }
    expect(files).toHaveLength(catalog.semgrep.ids.length);
  });
});
