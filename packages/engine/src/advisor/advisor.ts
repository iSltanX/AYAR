// C-20 «المستشار» (FR-46, FR-18, D-28): a pure function from a change context, the knowledge base kb/1 and the
// project's facts to recommendations with reasons and priorities. It runs nothing, reads no file, needs no network
// and imports nothing from Node (28.13 case 17), and it never says «اجتاز» or «أخفق» (C-20 rule 9). Steps (28.2):
// normalize → assessRisk → decideDepth → rules and weights → priorities → «يشمل» for regression (rule 6) → depth
// `none` keeps every item visible as optional (rule 7, G-37.3: after the weights) → time budget → «غير الموصى به»
// with reasons from the inputs (rule 4) → the unknown as a range with its questions (rule 3).
import {
  ADVISOR_AUDIENCES,
  ADVISOR_EVIDENCE,
  ADVISOR_EXPECTED,
  ADVISOR_IMPACTS,
  ADVISOR_REVERSIBILITY,
  ADVISOR_SCOPES,
  AdvisorContext,
  RISK_LEVELS,
  SENSITIVE_KEYS,
  type AdvisorItem,
  type AdvisorResult,
  type Depth,
  type Explanation,
  type RiskLevel,
  type SensitiveKey,
} from '@ayar/protocol';
import type { Kb } from '@ayar/catalog';
import { APPLIES_EXPECTED, effectiveJson, normalize, type AdvisorFacts, type Normalized } from './context.ts';
import { OMIT_RULES } from './omit.ts';
import { assessRisk, decideDepth, type DepthDecision, type Risk } from './risk.ts';
import { RULES } from './rules.ts';

export type { AdvisorFacts } from './context.ts';

/** C-20 «التحقق من المدخلات»: a visible error naming each offending path; the value itself is not echoed. */
export class AdvisorInputError extends Error {
  readonly issues: readonly { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[]) {
    super(`invalid advisor context: ${issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ')}`);
    this.name = 'AdvisorInputError';
    this.issues = issues;
  }
}

export function parseAdvisorContext(raw: unknown): AdvisorContext {
  const parsed = AdvisorContext.safeParse(raw);
  if (!parsed.success) throw new AdvisorInputError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return parsed.data;
}

interface Scored {
  id: string;
  total: number;
  levelBonus: number;
  priority: 1 | 2 | 3;
  contributions: { rule: string; weight: number }[];
  includes: string[];
  includedContributions: { rule: string; weight: number }[];
  priorityNote: Explanation | null;
}

interface Core {
  n: Normalized;
  risk: Risk;
  depth: DepthDecision;
  items: Scored[];
}

const REGRESSION_FULL = 'regression_full';
const REGRESSION_NEIGHBORS = 'regression_neighbors';

function core(given: AdvisorContext, kb: Kb, facts: AdvisorFacts): Core {
  const algo = kb.data.manifest.algorithm;
  const n = normalize(given, facts);
  const risk = assessRisk(n.e, algo);
  const depth = decideDepth(n.e, risk, algo);
  const x = { depth: depth.id, levelIdx: risk.levelIdx };

  // 28.2-د: each rule adds weights; each item sums them.
  const sums = new Map<string, { total: number; contributions: { rule: string; weight: number }[] }>();
  for (const rule of RULES) {
    const w = rule.apply(n.e, x);
    if (!w) continue;
    for (const [item, weight] of Object.entries(w)) {
      if (!kb.item(item)) throw new Error(`advisor rule ${rule.id} adds an unknown item ${item}`);
      const s = sums.get(item) ?? { total: 0, contributions: [] };
      s.total += weight;
      s.contributions.push({ rule: rule.id, weight });
      sums.set(item, s);
    }
  }
  const bonus = algo.levelBonus[risk.level];
  const th = algo.priorityThresholds;
  const prio = (total: number): 1 | 2 | 3 => (total >= th.top ? 1 : total >= th.medium ? 2 : 3);
  let items: Scored[] = [...sums].map(([id, s]) => ({ id, total: s.total + bonus, levelBonus: bonus, priority: prio(s.total + bonus), contributions: s.contributions, includes: [], includedContributions: [], priorityNote: null }));

  // C-20 rule 6: one regression item. The full suite includes the targeted one: it stays, with its own weights and
  // total, as urgent as the more urgent of the two; the targeted item's reasons are kept apart (D-DEV8-06).
  const full = items.find((i) => i.id === REGRESSION_FULL);
  const near = items.find((i) => i.id === REGRESSION_NEIGHBORS);
  if (full && near) {
    if (near.priority < full.priority) {
      full.priority = near.priority;
      full.priorityNote = { code: 'advisor.priority.includes', values: { priority: near.priority } };
    }
    full.includedContributions = near.contributions;
    full.includes = [REGRESSION_NEIGHBORS];
    items = items.filter((i) => i !== near);
  }

  // C-20 rule 7 and G-37.3: depth `none` hides nothing; after the weights, every item is «اختياري» with the reason.
  if (depth.id === 'none') {
    for (const i of items) {
      i.priority = 3;
      i.priorityNote = { code: 'advisor.priority.depthNone', values: { depth: depth.id } };
    }
  }

  // 28.2-د: priority, then the sum, then the lower effort; the id last, so the order is stable.
  const effort = (id: string) => kb.item(id)!.effort;
  items.sort((a, b) => a.priority - b.priority || b.total - a.total || effort(a.id) - effort(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { n, risk, depth, items };
}

const SENSITIVE_VALUES: Record<SensitiveKey, readonly (string | number)[]> = {
  impact: ADVISOR_IMPACTS,
  scope: ADVISOR_SCOPES,
  evidence: ADVISOR_EVIDENCE,
  reversibility: ADVISOR_REVERSIBILITY,
  audience: ADVISOR_AUDIENCES,
  expected: ADVISOR_EXPECTED,
};

/** 28.2-ز: the sensitive inputs the user left unknown (`expected` only where it applies). */
function unknownKeys(given: AdvisorContext): SensitiveKey[] {
  return SENSITIVE_KEYS.filter((k) => given[k] === undefined && (k !== 'expected' || APPLIES_EXPECTED.includes(given.situation)));
}

const withValue = (given: AdvisorContext, k: SensitiveKey, v: string | number): AdvisorContext => ({ ...given, [k]: v });

function ecosystemsOf(given: AdvisorContext, kb: Kb, facts: AdvisorFacts): AdvisorResult['ecosystems'] {
  const known = new Set(kb.data.ecosystems.ecosystems.map((e) => e.id));
  const fromFacts = (facts.ecosystems ?? []).filter((id) => known.has(id));
  const stack = given.stack ?? '';
  const fromStack = stack ? kb.data.ecosystems.ecosystems.filter((e) => new RegExp(e.pattern, e.flags).test(stack)).map((e) => e.id) : [];
  // 28.9: C-06 «الأولى عند التعارض», not the only source: ecosystems it cannot detect (Flutter, WordPress…) still
  // come from the text; both are listed (review m5).
  const ids = [...new Set([...fromFacts, ...fromStack])].sort();
  const from = fromFacts.length && fromStack.some((id) => !fromFacts.includes(id)) ? 'both' : fromFacts.length ? 'discovery' : fromStack.length ? 'stack' : 'none';
  return { ids, from };
}

/**
 * advisor.suggest (C-20): validate the context, then recommend. Throws AdvisorInputError on an invalid context
 * (`stack: 42`, `impact: 99`): never a silent conversion.
 */
export function suggest(raw: unknown, kb: Kb, facts: AdvisorFacts = {}): AdvisorResult {
  const given = parseAdvisorContext(raw);
  const c = core(given, kb, facts);
  const { e } = c.n;
  const algo = kb.data.manifest.algorithm;
  const ecosystems = ecosystemsOf(given, kb, facts);
  const present = new Set(c.items.flatMap((i) => [i.id, ...i.includes]));

  const items: AdvisorItem[] = c.items.map((s) => {
    const k = kb.item(s.id)!;
    const map = kb.checksFor(s.id);
    return {
      id: s.id,
      priority: s.priority,
      total: s.total,
      levelBonus: s.levelBonus,
      contributions: s.contributions,
      // 28.2-د: `dyn` becomes automatic when the change is frequent, manual otherwise.
      mode: k.mode === 'dyn' ? (e.frequency === 'frequent' ? 'auto' : 'manual') : k.mode,
      effort: k.effort,
      stage: k.stage,
      checks: [...map.checks],
      card: map.card,
      includes: s.includes,
      includedContributions: s.includedContributions,
      priorityNote: s.priorityNote,
      tools: kb.toolsFor(s.id, ecosystems.ids).map((t) => ({ name: t.name, ecosystem: t.ecosystem, category: t.category, exampleCommand: t.exampleCommand, version: t.version, url: t.url })),
    };
  });

  // 28.2-و with C-20 rule 4: what was left out, and why, from the actual inputs.
  const omitted: AdvisorResult['omitted'] = [];
  for (const o of OMIT_RULES) {
    if (present.has(o.item) || !o.when(e)) continue;
    const entry = kb.data.rules.omit.find((x) => x.item === o.item);
    if (!entry) throw new Error(`kb has no omit entry for ${o.item}`);
    const f = o.facts(e, present);
    omitted.push({ id: o.item, facts: f.facts, hint: entry.hints[f.hint] ?? entry.hints[0]! });
  }

  // 28.2-هـ: the time budget, over the items of top priority, in order.
  let budget: AdvisorResult['budget'] = null;
  if (e.time) {
    const capacity = algo.capacity[e.time];
    let used = 0;
    const overflow: string[] = [];
    for (const i of items.filter((x) => x.priority === 1)) {
      used += algo.effortUnits[String(i.effort) as '1' | '2' | '3'];
      if (used > capacity) overflow.push(i.id);
    }
    const warning: Explanation | null = overflow.length
      ? { code: 'advisor.budget.warning', values: { time: e.time, items: overflow.map((id) => kb.item(id)!.title).join('، '), count: overflow.length } }
      : null;
    budget = { time: e.time, capacity, used, overflow, warning };
  }

  // C-20 rule 3 and 28.2-ز: per unknown key, the values that give the same outcome; jointly, the range and the base.
  const unknown = unknownKeys(given);
  const sensitivity: AdvisorResult['sensitivity'] = [];
  for (const k of unknown) {
    const groups: { values: (string | number)[]; level: RiskLevel; depth: Depth }[] = [];
    for (const v of SENSITIVE_VALUES[k]) {
      const r = core(withValue(given, k, v), kb, facts);
      const g = groups.find((x) => x.level === r.risk.level && x.depth === r.depth.id);
      if (g) g.values.push(v);
      else groups.push({ values: [v], level: r.risk.level, depth: r.depth.id });
    }
    if (groups.length >= 2) sensitivity.push({ key: k, groups });
  }
  let min = c.risk.levelIdx;
  let max = c.risk.levelIdx;
  let common = null as Set<string> | null;
  if (unknown.length) {
    const combos = unknown.reduce<AdvisorContext[]>((acc, k) => acc.flatMap((g) => SENSITIVE_VALUES[k].map((v) => withValue(g, k, v))), [given]);
    for (const g of combos) {
      const r = core(g, kb, facts);
      min = Math.min(min, r.risk.levelIdx);
      max = Math.max(max, r.risk.levelIdx);
      const ids = new Set(r.items.flatMap((i) => [i.id, ...i.includes]));
      common = common === null ? ids : new Set([...common].filter((id) => ids.has(id)));
    }
  }
  const shared = common;
  const commonItems = shared ? items.map((i) => i.id).filter((id) => shared.has(id)) : [];
  const commonBase = shared ? { items: commonItems, checks: [...new Set(commonItems.flatMap((id) => kb.checksFor(id).checks))] } : null;

  // FR-18 «اقترح لتغيير»: the checks of the recommended items, as urgent as their most urgent item.
  const byCheck = new Map<string, { items: string[]; priority: 1 | 2 | 3 }>();
  for (const i of items) {
    for (const check of i.checks) {
      const s = byCheck.get(check) ?? { items: [], priority: 3 };
      s.items.push(i.id);
      s.priority = Math.min(s.priority, i.priority) as 1 | 2 | 3;
      byCheck.set(check, s);
    }
  }
  const suggestedChecks = [...byCheck].map(([check, s]) => ({ check, ...s })).sort((a, b) => a.priority - b.priority || (a.check < b.check ? -1 : 1));

  const pr = facts.priorRun;
  const depthKb = kb.data.depths.depths.find((d) => d.id === c.depth.id)!;
  return {
    kind: 'recommendation',
    executed: false,
    kb: { schema: 'ayar-kb/1', version: kb.version },
    input: {
      given,
      effective: effectiveJson(e),
      assumed: c.n.assumed,
      missing: c.n.missing,
      migrations: { declared: given.migrations ?? null, detected: [...(facts.migrationsDetected ?? [])] },
    },
    risk: {
      level: c.risk.level,
      levelIdx: c.risk.levelIdx,
      impact: c.risk.impact,
      likelihood: c.risk.likelihood,
      score: c.risk.score,
      weakPoints: c.risk.weakPoints,
      floorApplied: c.risk.floorApplied,
      lines: c.risk.lines,
      range: { min: RISK_LEVELS[min]!, max: RISK_LEVELS[max]! },
    },
    depth: { id: c.depth.id, rank: c.depth.rank, notes: c.depth.notes, completion: depthKb.completion },
    items,
    omitted,
    budget,
    sensitivity,
    questions: kb.data.inputs.inputs.map((i) => i.id).filter((id) => c.n.missing.includes(id)),
    commonBase,
    suggestedChecks,
    // 28.2-ز: a suggestion when the level is low, the evidence good and run automatically; never a skip.
    // D-DEV8-21: and no top-priority item, so the suggestion never sits beside «لا تُدمج قبلها».
    noNewTests: c.risk.level === 'low' && e.evidence === 'good' && !e.assumedKeys.has('evidence') && e.automation === 'auto' && !items.some((i) => i.priority === 1),
    evidenceReuse: pr && pr.sameState && pr.sameTools && pr.sameScope && pr.passed ? { runId: pr.runId } : null,
    ecosystems,
  };
}
