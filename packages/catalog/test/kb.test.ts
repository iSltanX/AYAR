// kb/1 (C-08 point 4, plan 28, DEV-8 gate «مطابقة الأعداد لكل قسم من 28.4 إلى 28.11»): every section of plan 28
// is in the data with the plan's count, the data equals what the parser reads from the plan today (no knowledge
// lost or retyped, plan 4.2), every merge or correction is the one recorded, and the loader refuses a broken
// reference so an invalid knowledge base stops the engine like an invalid catalog.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractKb, KB_DIR, readPlan } from '../scripts/kb-extract.ts';
import { builtinCatalogData, CatalogError, loadCatalog, type CatalogData } from '../src/index.ts';

const NOW = new Date('2026-10-10T12:00:00Z');
const data = () => builtinCatalogData() as CatalogData;
const { catalog } = loadCatalog(builtinCatalogData(), { now: NOW });
const kb = catalog.kb.data;

describe('kb/1 counts, section by section (28.1 to 28.14)', () => {
  it('28.1: sixteen inputs in five groups, situation alone required', () => {
    expect(kb.inputs.inputs).toHaveLength(16);
    expect(new Set(kb.inputs.inputs.map((i) => i.group))).toEqual(new Set(['situation', 'consequence', 'likelihood', 'evidence', 'project']));
    expect(kb.inputs.inputs.filter((i) => i.required).map((i) => i.id)).toEqual(['situation']);
    expect(kb.inputs.inputs.find((i) => i.id === 'impact')!.values.map((v) => v.id)).toEqual([1, 2, 3, 4]);
  });

  it('28.2 and 28.3: 55 rules (R01–R51 and D01–D04) and the nine «غير الموصى به» entries', () => {
    expect(kb.rules.rules).toHaveLength(55);
    expect(kb.rules.rules.filter((r) => r.kind === 'input')).toHaveLength(51);
    expect(kb.rules.rules.filter((r) => r.kind === 'depth').map((r) => r.id).sort()).toEqual(['D01', 'D02', 'D03', 'D04']);
    expect(kb.rules.omit).toHaveLength(9);
  });

  it('28.4: 28 items, each answering the eight questions', () => {
    expect(kb.items.items).toHaveLength(28);
    for (const i of kb.items.items) {
      for (const k of ['proves', 'why', 'whyMethod', 'timing', 'repeat', 'evaluate', 'expand', 'limits'] as const) expect(i[k].length, `${i.id}.${k}`).toBeGreaterThan(0);
      expect(i.steps.length).toBeGreaterThan(0);
    }
  });

  it('28.5: 21 methods in the four families, and the eleven Codex style cards merged into them (28.13)', () => {
    expect(kb.methods.methods).toHaveLength(21);
    expect(kb.methods.families.map((f) => f.id)).toEqual(['scope', 'purpose', 'quality', 'technique']);
    expect(kb.methods.styleCards).toHaveLength(11);
    expect(kb.methods.methods.filter((m) => m.addedBecause !== null)).toHaveLength(11);
  });

  it('28.6: eight lifecycle stages, the comprehensive definition, six effect signals, five coverage limits', () => {
    expect(kb.lifecycle.phases).toHaveLength(8);
    expect(kb.lifecycle.phases.map((p) => p.id)).toContain('after_release');
    expect(kb.lifecycle.effect.signals).toHaveLength(6);
    expect(kb.lifecycle.effect.coverage).toHaveLength(5);
    expect(kb.lifecycle.maintenance).toHaveLength(5);
  });

  it('28.7: five depths, three priorities, four levels', () => {
    expect(kb.depths.depths.map((d) => [d.id, d.rank])).toEqual([['none', 0], ['focused', 1], ['focused_reg', 2], ['expanded', 3], ['comprehensive', 4]]);
    expect(kb.depths.priorities.map((p) => p.value)).toEqual([1, 2, 3]);
    expect(kb.depths.levels.map((l) => l.id)).toEqual(['low', 'medium', 'high', 'critical']);
  });

  it('28.8: nine ready situations, valid advisor inputs', () => {
    expect(kb.presets.presets.map((p) => p.id)).toEqual(['p_typo', 'p_hamza', 'p_sync', 'p_upgrade', 'p_theme', 'p_release', 'p_refactor', 'p_legacy', 'p_sparse']);
  });

  it('28.9: twelve ecosystems, 81 tool entries, six alerts, and the categories with `compat` (G-37.8)', () => {
    expect(kb.ecosystems.ecosystems).toHaveLength(12);
    expect(kb.tools.tools).toHaveLength(81);
    expect(kb.tools.alerts).toHaveLength(6);
    expect(kb.ecosystems.categories).toHaveLength(21);
    expect(kb.ecosystems.categories.filter((c) => c.origin === 'G-37.8').map((c) => c.id)).toEqual(['compat']);
    expect(new Set(kb.tools.tools.map((t) => t.category))).toContain('compat');
  });

  it('28.10 and 28.13: 60 sources plus eleven from Codex, two of them merged (G-37.9), so 69', () => {
    const s = kb.sources.sources;
    expect(s.filter((x) => x.origin === 'kb')).toHaveLength(60);
    expect(s.filter((x) => x.origin === 'codex')).toHaveLength(9);
    expect(s).toHaveLength(69);
    expect(s.find((x) => x.id === 'istqb')!.merged.map((m) => m.id)).toEqual(['istqb_codex']);
    expect(s.find((x) => x.id === 'wstg')!.merged.map((m) => m.id)).toEqual(['wstg_codex']);
    expect(kb.sources.basisKinds.map((b) => b.id)).toEqual(['est', 'res', 'ctx', 'opn', 'doc', 'syn']);
    // G-37.9: the basis «تركيب الأداة» names no source; the schema takes null there and only there.
    const nulls = [...kb.items.items, ...kb.methods.methods].flatMap((x) => x.basis).filter((b) => b.source === null);
    expect(nulls.length).toBeGreaterThan(0);
    expect(nulls.every((b) => b.kind === 'syn')).toBe(true);
  });

  it('28.11: forty terms', () => {
    expect(kb.terms.terms).toHaveLength(40);
  });

  it('28.12 to 28.14: 15 archive cases, 19 Codex cases, 12 scenarios and the example input', () => {
    expect(kb.verification.archive).toHaveLength(15);
    expect(kb.verification.codexCases.map((c) => c.number)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    expect(kb.verification.scenarios).toHaveLength(12);
    expect(kb.verification.example.inputs.situation).toBe('change_behavior');
  });
});

describe('kb/1 matches plan 28 (no knowledge lost, plan 4.2)', () => {
  const fromPlan = extractKb(readPlan());

  it('every extracted file equals what the parser reads from the plan now', () => {
    for (const [file, value] of Object.entries(fromPlan)) {
      const committed: unknown = JSON.parse(readFileSync(`${KB_DIR}${file}`, 'utf8'));
      expect(committed, file).toEqual(JSON.parse(JSON.stringify(value)));
    }
  });

  it('applies the recorded corrections and nothing else', () => {
    // Correction «قاعدة R16» (G-37.1): replaced by C-20 rule 5, the archive text kept for the record.
    expect(kb.rules.rules.filter((r) => r.replacedBy !== null).map((r) => [r.id, r.replacedBy!.rule])).toEqual([['R16', 'C-20.5']]);
    // Correction of 28.9: commands that update references or print secrets are gone; commands are explanation only.
    const commands = kb.tools.tools.map((t) => t.exampleCommand ?? '').join('\n');
    expect(commands).not.toMatch(/--update-snapshots|--update-goldens|gitleaks git -v/);
    expect(kb.tools.tools.find((t) => t.name === 'gitleaks')!.exampleCommand).toBe('gitleaks dir . --redact');
    // The Node alerts of the correction table.
    expect(kb.tools.alerts.join('\n')).toMatch(/Vitest 5 يتطلب Node 22\.12/);
    expect(kb.tools.alerts.join('\n')).toMatch(/Playwright 1\.64 يتطلب Node 20/);
  });

  it('keeps every OMIT reason of the archive for the record, with a hint that does not depend on the inputs (G-37.2)', () => {
    expect(kb.rules.omit.map((o) => o.item)).toEqual(['e2e_critical', 'regression_full', 'perf_budget', 'load_test', 'security_authz', 'a11y_check', 'migration_rehearsal', 'exploratory_session', 'characterization']);
    for (const o of kb.rules.omit) {
      expect(o.archiveReason.length).toBeGreaterThan(0);
      // The hint never states an input value: impact, reversibility, audience and scope are composed by the advisor.
      for (const h of o.hints) expect(h).not.toMatch(/دون «تعطّل جوهري»|التراجع سهل|المستخدم الوحيد|لا يمس مكوّنًا مشتركًا/);
    }
    // e2e_critical had two archive texts (UI or not): two hints.
    expect(kb.rules.omit[0]!.hints).toHaveLength(2);
  });
});

describe('kb/1 loading (an invalid knowledge base stops the engine, C-08)', () => {
  const issuesOf = (mutate: (d: CatalogData) => void): string[] => {
    const d = data();
    mutate(d);
    try {
      loadCatalog(d, { now: NOW });
    } catch (e) {
      expect(e).toBeInstanceOf(CatalogError);
      return [...(e as CatalogError).issues];
    }
    throw new Error('expected the knowledge base to be rejected');
  };

  it('rejects unknown methods, sources, categories, items and checks', () => {
    const issues = issuesOf((d) => {
      d.kb.items.items[0]!.method = 'nothing';
      d.kb.items.items[1]!.basis[0]!.source = 'no_such_source';
      d.kb.items.items[2]!.toolCategories.push('telepathy');
      d.kb.rules.rules[0]!.adds.items.push('ghost_item');
      d.kb.itemChecks.mappings[0]!.checks.push('code.nothing');
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/item static_gate: unknown method nothing/),
        expect.stringMatching(/unknown source no_such_source/),
        expect.stringMatching(/unknown tool category telepathy/),
        expect.stringMatching(/rule R01: unknown item ghost_item/),
        expect.stringMatching(/unknown check code\.nothing/),
      ]),
    );
  });

  it('takes a null source only for «تركيب الأداة» (G-37.9)', () => {
    const issues = issuesOf((d) => {
      d.kb.items.items[0]!.basis[0]!.source = null; // an «مبدأ راسخ» without a source
    });
    expect(issues.join('\n')).toMatch(/only a «تركيب الأداة» basis may have no source/);
  });

  it('rejects an item without a C-20 mapping, a duplicate id, and an invalid preset', () => {
    expect(issuesOf((d) => d.kb.itemChecks.mappings.pop()).join('\n')).toMatch(/item risk_inventory: no C-20 mapping/);
    expect(issuesOf((d) => d.kb.terms.terms.push(structuredClone(d.kb.terms.terms[0]!))).join('\n')).toMatch(/kb terms: duplicate id risk/);
    expect(issuesOf((d) => ((d.kb.presets.presets[0]!.inputs as Record<string, unknown>).impact = 99)).join('\n')).toMatch(/kb\.presets\.presets\.0\.inputs\.impact/);
  });

  it('exposes lookups: C-20 checks and card per item, and 28.9 tools per item and ecosystem', () => {
    expect(catalog.kb.checksFor('static_gate')).toEqual({ checks: ['code.types', 'code.lint', 'sec.secrets.files'], card: null });
    expect(catalog.kb.checksFor('risk_inventory')).toEqual({ checks: [], card: 'generic' });
    const js = catalog.kb.toolsFor('unit_logic', ['js']);
    expect(js.map((t) => t.name)).toEqual(expect.arrayContaining(['Vitest', 'StrykerJS']));
    expect(catalog.kb.toolsFor('unit_logic', []).every((t) => t.ecosystem === 'any')).toBe(true);
  });

  it('warns when the knowledge base is old (NFR-06)', () => {
    const { stale } = loadCatalog(builtinCatalogData(), { now: new Date('2027-06-01T00:00:00Z') });
    expect(stale.filter((s) => s.kind === 'kbSource')).toHaveLength(69);
    expect(stale.filter((s) => s.kind === 'kbTool')).toHaveLength(81);
    expect(stale.map((s) => s.kind)).toEqual(expect.arrayContaining(['kb', 'cards']));
  });
});
