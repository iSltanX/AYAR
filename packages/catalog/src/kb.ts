// kb/1 (C-08 point 4, plan 28): the knowledge base as data with a schema and a version. Its text is transcribed
// from plan 28 by scripts/kb-extract.ts and compared with the plan by test/kb.test.ts. The advisor's
// logic (conditions and weights) lives in versioned, tested code in packages/engine/src/advisor (G-37.5,
// D-DEV8-02); the data here holds what the logic refers to, and the loader checks that every reference resolves.
//
// G-37.10: ids are unique inside their collection, and every cross-reference is a typed field (`method`,
// `source`, `items`, `category`…) checked against its own collection, so a rule D01 is never a decision D-01,
// and the method `characterization` never stands for the item of the same name. Outside the knowledge base
// (advisor output, cards) a reference carries its collection: `rule:R04`, `item:unit_logic` (kbRef).
import { AdvisorContext, z } from '@ayar/protocol';

const IsoDate = z.iso.date();
const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/);
const Slug = z.string().regex(/^[a-z][a-z0-9_]*$/);
/** Source ids: 28.10's, and 28.13's Codex ids, some hyphenated (`google-behavior`). */
const SourceId = z.string().regex(/^[a-z][a-z0-9_-]*$/);
const Text = z.string().min(1);

export const BASIS_KINDS = ['est', 'res', 'ctx', 'opn', 'doc', 'syn'] as const;
export const BasisKind = z.enum(BASIS_KINDS);

/** G-37.9: a basis «تركيب الأداة» (syn) may name no source; any other basis names one. */
export const Basis = z
  .strictObject({ kind: BasisKind, text: Text, source: Slug.nullable() })
  .refine((b) => b.source !== null || b.kind === 'syn', 'only a «تركيب الأداة» basis may have no source');
export const BasisRef = z.strictObject({ kind: BasisKind, source: SourceId });

export const ITEM_STAGES = ['before', 'merge', 'release'] as const;
export const ITEM_MODES = ['auto', 'manual', 'mixed', 'dyn'] as const;

export const KbManifest = z.strictObject({
  schema: z.literal('ayar-kb/1'),
  version: SemVer,
  /** The knowledge base is Arabic (plan 28); there is no English text to transcribe (D-DEV8-10). */
  lang: z.literal('ar'),
  source: Text,
  verifiedAt: IsoDate,
  /** 28.2-د and هـ: the algorithm's constants, as data; the steps that use them are code. */
  algorithm: z.strictObject({
    effortUnits: z.strictObject({ '1': z.int().positive(), '2': z.int().positive(), '3': z.int().positive() }),
    capacity: z.strictObject({ minutes: z.int().positive(), hours: z.int().positive(), days: z.int().positive() }),
    levelBonus: z.strictObject({ low: z.int().nonnegative(), medium: z.int().nonnegative(), high: z.int().nonnegative(), critical: z.int().nonnegative() }),
    priorityThresholds: z.strictObject({ top: z.int().positive(), medium: z.int().positive() }),
    riskBands: z.strictObject({ low: z.int().positive(), medium: z.int().positive(), high: z.int().positive() }),
    baseDepth: z.strictObject({ low: Slug, medium: Slug, high: Slug, critical: Slug }),
  }),
});
export type KbManifest = z.infer<typeof KbManifest>;

const dated = <T extends z.ZodRawShape>(shape: T) => z.strictObject({ verifiedAt: IsoDate, ...shape });

export const KbInput = z.strictObject({
  id: Slug,
  group: z.enum(['situation', 'consequence', 'likelihood', 'evidence', 'project']),
  type: z.enum(['single', 'multi', 'bool', 'text']),
  required: z.boolean(),
  basic: z.boolean(),
  question: Text,
  values: z.array(z.strictObject({ id: z.union([Slug, z.int().positive()]), label: Text })),
});
export type KbInput = z.infer<typeof KbInput>;

export const KbRule = z.strictObject({
  id: z.string().regex(/^(R|D)\d{2}$/),
  kind: z.enum(['input', 'depth']),
  description: Text,
  /** The archive's condition, kept verbatim for the record; the advisor implements it in code. */
  archiveCondition: Text,
  adds: z.strictObject({ items: z.array(Slug).min(1), weights: z.record(Slug, z.int().positive()).nullable(), expression: Text.nullable() }),
  reason: Text,
  /** Correction «قاعدة R16»: replaced by a rule of C-20. */
  replacedBy: z.strictObject({ rule: z.string().regex(/^C-20\.\d$/), description: Text }).nullable(),
});
export type KbRule = z.infer<typeof KbRule>;

export const KbOmit = z.strictObject({ item: Slug, archiveCondition: Text, archiveReason: Text, hints: z.array(Text).min(1) });

export const KbItem = z.strictObject({
  id: Slug,
  title: Text,
  method: Slug,
  methodLabel: Text,
  stage: z.enum(ITEM_STAGES),
  effort: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  mode: z.enum(ITEM_MODES),
  toolCategories: z.array(Slug),
  proves: Text,
  why: Text,
  whyMethod: Text,
  timing: Text,
  repeat: Text,
  requirement: Text,
  steps: z.array(Text).min(1),
  evaluate: Text,
  expand: Text,
  limits: Text,
  basis: z.array(Basis).min(1),
});
export type KbItem = z.infer<typeof KbItem>;

export const KbMethod = z.strictObject({
  id: Slug,
  name: Text,
  nameEn: Text,
  family: Slug,
  effort: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  automation: Text,
  addedBecause: Text.nullable(),
  purpose: Text,
  fits: Text,
  notFits: Text,
  needs: Text,
  reading: Text,
  mistakes: Text,
  example: Text,
  basis: z.array(Basis).min(1),
});
export type KbMethod = z.infer<typeof KbMethod>;

export const KbStyleCard = z.strictObject({ name: Text, nameEn: Text, fits: Text, limits: Text, needs: Text, mistakes: Text, methods: z.array(Slug).min(1) });

export const KbSource = z.strictObject({
  id: SourceId,
  title: Text,
  url: z.url({ protocol: /^https$/ }),
  /** Null for the Codex sources of 28.13, whose table gives no basis. */
  basis: BasisKind.nullable(),
  claim: Text,
  origin: z.enum(['kb', 'codex']),
  /** G-37.9: duplicates merged into this source, their claim kept. */
  merged: z.array(z.strictObject({ id: SourceId, title: Text, url: z.url({ protocol: /^https$/ }), claim: Text })),
  verifiedAt: IsoDate,
});
export type KbSource = z.infer<typeof KbSource>;

export const KbTool = z.strictObject({
  ecosystem: Slug,
  category: Slug,
  name: Text,
  description: Text,
  /** For explanation only: AYAR never runs a knowledge-base command (4.1, 28.9). */
  exampleCommand: Text.nullable(),
  version: Text.nullable(),
  url: z.url({ protocol: /^https$/ }),
  verifiedAt: IsoDate,
});
export type KbTool = z.infer<typeof KbTool>;

export const KbItemChecks = z.strictObject({
  item: Slug,
  /** C-20 «ربط بنود المعرفة بفحوص عِيَار». */
  checks: z.array(z.string().min(1)),
  /** The card type when no check covers the item, or null when the checks are enough. */
  card: Slug.nullable(),
});

export const CardTypeDef = z.strictObject({ id: Slug, name: Text, nextStep: z.enum(['direct', 'model', 'review']), isTest: z.boolean() });
const Lines = z.array(Text).min(1);
/** 12.8 «قالب البطاقة», verbatim where the plan gives it; the lines it leaves to the implementation are marked in D-DEV8-09. */
export const CardTemplate = z.strictObject({
  heading: Text,
  meta: Text,
  sections: z.strictObject({ name: Text, why: Text, behavior: Text, context: Text, steps: Text, acceptance: Text, constraints: Text, verify: Text }),
  behaviorLine: Text,
  expectedLine: Text,
  contextLine: Text,
  acceptanceTest: Lines,
  acceptanceSetup: Lines,
  acceptanceReview: Lines,
  constraints: Lines,
  verifyLine: Text,
  noCheckLine: Text,
  priorities: z.strictObject({ '1': Text, '2': Text, '3': Text }),
  nextSteps: z.strictObject({ model: Text, direct: Text, review: Text }),
  sources: z.strictObject({ advisorItem: Text, check: Text }),
  ownerDecidesExpected: Text,
  ownerDecides: Text,
  noneKnown: Text,
  draftId: Text,
  setupSteps: z.strictObject({ missing_configuration: Lines, missing: Lines, missing_tests: Lines }),
  checkBehavior: z.strictObject({ missing_configuration: Text, missing: Text, missing_tests: Text }),
  profileLocation: Text,
});
export type CardTemplate = z.infer<typeof CardTemplate>;

export const CardsData = z.strictObject({
  version: SemVer,
  verifiedAt: IsoDate,
  nameFormat: z.literal('{type}: {behavior} — {location}'),
  types: z.array(CardTypeDef).length(16),
  generic: CardTypeDef,
  template: CardTemplate,
});
export type CardsData = z.infer<typeof CardsData>;

export const KbData = z.strictObject({
  manifest: KbManifest,
  inputs: dated({ inputs: z.array(KbInput) }),
  rules: dated({ rules: z.array(KbRule), omit: z.array(KbOmit) }),
  items: dated({ items: z.array(KbItem) }),
  methods: dated({
    families: z.array(z.strictObject({ id: Slug, name: Text, question: Text, note: Text })),
    methods: z.array(KbMethod),
    styleCards: z.array(KbStyleCard),
  }),
  lifecycle: dated({
    phases: z.array(z.strictObject({ id: Slug, name: Text, tests: Text, notNow: Text, depth: Slug, expandWhen: Text })),
    comprehensive: z.strictObject({ definition: Text, scope: Text, triggers: Text, completion: Text, remains: Text }),
    effect: z.strictObject({
      signals: z.array(z.strictObject({ name: Text, meaning: Text, basis: BasisRef })),
      coverage: z.array(z.strictObject({ text: Text, basis: BasisRef })),
    }),
    maintenance: z.array(z.strictObject({ text: Text, basis: BasisRef })),
    manualAuto: z.strictObject({ auto: z.array(Text).min(1), manual: z.array(Text).min(1), loop: Text, quadrants: Text }),
    shapes: Text,
  }),
  depths: dated({
    depths: z.array(z.strictObject({ id: Slug, name: Text, rank: z.int().min(0), description: Text, completion: Text })),
    priorities: z.array(z.strictObject({ value: z.int().min(1).max(3), name: Text, meaning: Text })),
    levels: z.array(z.strictObject({ id: Slug, name: Text, index: z.int().min(0) })),
  }),
  presets: dated({ presets: z.array(z.strictObject({ id: Slug, name: Text, inputs: AdvisorContext })) }),
  ecosystems: dated({
    ecosystems: z.array(z.strictObject({ id: Slug, name: Text, pattern: Text, flags: z.string().regex(/^[imsu]*$/) })),
    categories: z.array(z.strictObject({ id: Slug, label: Text, origin: z.enum(['plan', 'G-37.8']) })),
  }),
  tools: dated({ tools: z.array(KbTool), alerts: z.array(Text) }),
  sources: dated({ basisKinds: z.array(z.strictObject({ id: BasisKind, name: Text, meaning: Text })), sources: z.array(KbSource) }),
  terms: dated({ terms: z.array(z.strictObject({ id: Slug, ar: Text, en: Text, meaning: Text })) }),
  verification: dated({
    archive: z.array(z.strictObject({ name: Text, inputs: AdvisorContext, archiveExpectation: Text })),
    codexCases: z.array(z.strictObject({ number: z.int().positive(), name: Text })),
    scenarios: z.array(z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), situation: Text, expected: Text, amended: z.boolean() })),
    example: z.strictObject({ inputs: AdvisorContext, description: Text, expectedStructure: Text }),
  }),
  itemChecks: dated({ mappings: z.array(KbItemChecks) }),
});
export type KbData = z.infer<typeof KbData>;

/** A reference that leaves the knowledge base carries its collection (G-37.10). */
export type KbCollection = 'rule' | 'item' | 'method' | 'source' | 'term' | 'depth' | 'phase' | 'preset';
export function kbRef(collection: KbCollection, id: string): string {
  return `${collection}:${id}`;
}

/** The knowledge base after validation, with lookups. */
export interface Kb {
  readonly version: string;
  readonly data: KbData;
  readonly cards: CardsData;
  item(id: string): KbItem | undefined;
  rule(id: string): KbRule | undefined;
  method(id: string): KbMethod | undefined;
  source(id: string): KbSource | undefined;
  /** C-20's checks and card for an item. */
  checksFor(itemId: string): { checks: readonly string[]; card: string | null };
  /** 28.9: tools of the item's categories in these ecosystems and in `any`. */
  toolsFor(itemId: string, ecosystems: readonly string[]): readonly KbTool[];
}

/**
 * The references a schema cannot express. `checkIds` are the catalog's check ids (C-20 maps items to them).
 * Returns the issues; an empty list means the knowledge base is consistent.
 */
export function kbIssues(kb: KbData, cards: CardsData, checkIds: ReadonlySet<string>): string[] {
  const issues: string[] = [];
  const unique = (what: string, ids: readonly (string | number)[]) => {
    const seen = new Set<string | number>();
    for (const id of ids) {
      if (seen.has(id)) issues.push(`kb ${what}: duplicate id ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const items = unique('items', kb.items.items.map((i) => i.id));
  const methods = unique('methods', kb.methods.methods.map((m) => m.id));
  const families = unique('families', kb.methods.families.map((f) => f.id));
  const sources = unique('sources', kb.sources.sources.map((s) => s.id));
  unique('sources (merged)', [...kb.sources.sources.map((s) => s.id), ...kb.sources.sources.flatMap((s) => s.merged.map((m) => m.id))]);
  const categories = unique('tool categories', kb.ecosystems.categories.map((c) => c.id));
  const ecosystems = unique('ecosystems', kb.ecosystems.ecosystems.map((e) => e.id));
  const depths = unique('depths', kb.depths.depths.map((d) => d.id));
  const levels = unique('levels', kb.depths.levels.map((l) => l.id));
  unique('rules', kb.rules.rules.map((r) => r.id));
  unique('inputs', kb.inputs.inputs.map((i) => i.id));
  unique('terms', kb.terms.terms.map((t) => t.id));
  unique('presets', kb.presets.presets.map((p) => p.id));
  unique('phases', kb.lifecycle.phases.map((p) => p.id));
  const cardTypes = unique('card types', [...cards.types.map((t) => t.id), cards.generic.id]);

  const src = (where: string, id: string | null) => {
    if (id !== null && !sources.has(id)) issues.push(`kb ${where}: unknown source ${id}`);
  };
  for (const i of kb.items.items) {
    if (!methods.has(i.method)) issues.push(`kb item ${i.id}: unknown method ${i.method}`);
    for (const c of i.toolCategories) if (!categories.has(c)) issues.push(`kb item ${i.id}: unknown tool category ${c}`);
    for (const b of i.basis) src(`item ${i.id}`, b.source);
  }
  for (const m of kb.methods.methods) {
    if (!families.has(m.family)) issues.push(`kb method ${m.id}: unknown family ${m.family}`);
    for (const b of m.basis) src(`method ${m.id}`, b.source);
  }
  for (const c of kb.methods.styleCards) for (const m of c.methods) if (!methods.has(m)) issues.push(`kb style card ${c.nameEn}: unknown method ${m}`);
  for (const r of kb.rules.rules) {
    for (const it of r.adds.items) if (!items.has(it)) issues.push(`kb rule ${r.id}: unknown item ${it}`);
    if ((r.adds.weights === null) === (r.adds.expression === null)) issues.push(`kb rule ${r.id}: weights or expression, exactly one`);
    if (r.kind !== (r.id.startsWith('D') ? 'depth' : 'input')) issues.push(`kb rule ${r.id}: kind ${r.kind}`);
  }
  for (const o of kb.rules.omit) if (!items.has(o.item)) issues.push(`kb omit: unknown item ${o.item}`);
  for (const p of kb.lifecycle.phases) if (!depths.has(p.depth)) issues.push(`kb phase ${p.id}: unknown depth ${p.depth}`);
  for (const x of [...kb.lifecycle.effect.signals, ...kb.lifecycle.effect.coverage, ...kb.lifecycle.maintenance]) src('lifecycle', x.basis.source);
  for (const [k, d] of Object.entries(kb.manifest.algorithm.baseDepth)) {
    if (!depths.has(d)) issues.push(`kb manifest: base depth of ${k} is unknown (${d})`);
    if (!levels.has(k)) issues.push(`kb manifest: unknown level ${k}`);
  }
  for (const t of kb.tools.tools) {
    if (t.ecosystem !== 'any' && !ecosystems.has(t.ecosystem)) issues.push(`kb tool ${t.name}: unknown ecosystem ${t.ecosystem}`);
    if (!categories.has(t.category)) issues.push(`kb tool ${t.name}: unknown category ${t.category}`);
  }
  for (const e of kb.ecosystems.ecosystems) {
    try {
      new RegExp(e.pattern, e.flags);
    } catch (err) {
      issues.push(`kb ecosystem ${e.id}: invalid pattern (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  const mapped = unique('item checks', kb.itemChecks.mappings.map((m) => m.item));
  for (const m of kb.itemChecks.mappings) {
    if (!items.has(m.item)) issues.push(`kb item checks: unknown item ${m.item}`);
    for (const c of m.checks) if (!checkIds.has(c)) issues.push(`kb item checks ${m.item}: unknown check ${c}`);
    if (m.card !== null && !cardTypes.has(m.card)) issues.push(`kb item checks ${m.item}: unknown card type ${m.card}`);
    if (!m.checks.length && m.card === null) issues.push(`kb item checks ${m.item}: neither a check nor a card`);
  }
  for (const i of items) if (!mapped.has(i)) issues.push(`kb item ${String(i)}: no C-20 mapping`);
  return issues;
}

export function buildKb(data: KbData, cards: CardsData): Kb {
  const items = new Map(data.items.items.map((i) => [i.id, i]));
  const rules = new Map(data.rules.rules.map((r) => [r.id, r]));
  const methods = new Map(data.methods.methods.map((m) => [m.id, m]));
  const sources = new Map(data.sources.sources.map((s) => [s.id, s]));
  const mappings = new Map(data.itemChecks.mappings.map((m) => [m.item, m]));
  return {
    version: data.manifest.version,
    data,
    cards,
    item: (id) => items.get(id),
    rule: (id) => rules.get(id),
    method: (id) => methods.get(id),
    source: (id) => sources.get(id),
    checksFor: (id) => {
      const m = mappings.get(id);
      return { checks: m?.checks ?? [], card: m?.card ?? null };
    },
    toolsFor: (itemId, ecosystems) => {
      const cats = new Set(items.get(itemId)?.toolCategories ?? []);
      return data.tools.tools.filter((t) => cats.has(t.category) && (t.ecosystem === 'any' || ecosystems.includes(t.ecosystem)));
    },
  };
}
