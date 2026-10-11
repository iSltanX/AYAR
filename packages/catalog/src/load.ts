// Loading the catalog (C-08): schema validation, then the cross-references a schema cannot express, then the
// staleness check. An invalid catalog throws CatalogError, which keeps the engine from serving (it comes up
// "degraded" at boot); the build runs the same function (scripts/validate.ts) so an invalid catalog never ships.
// An entry verified more than staleAfterDays ago (180) loads, with a staleness warning (NFR-06).
import { createHash } from 'node:crypto';
import { builtinCatalogData } from './data.ts';
import { buildKb, kbIssues, type Kb } from './kb.ts';
import {
  CatalogData,
  SECTION_IDS,
  type CatalogManifest,
  type CheckDefinition,
  type Criterion,
  type NextStepClass,
  type OutcomeKey,
  type RedactionData,
  type CommandPolicy,
  type CheckRules,
  type RuleDef,
  type SectionId,
  type SemgrepData,
} from './schema.ts';

export class CatalogError extends Error {
  readonly issues: readonly string[];
  constructor(issues: string[]) {
    super(`invalid catalog: ${issues.slice(0, 5).join('; ')}${issues.length > 5 ? ` (+${issues.length - 5} more)` : ''}`);
    this.name = 'CatalogError';
    this.issues = issues;
  }
}

export interface StaleEntry {
  kind: 'check' | 'aiTemplate' | 'source' | 'redaction' | 'commandPolicy' | 'kb' | 'kbSource' | 'kbTool' | 'cards' | 'rules' | 'semgrep';
  id: string;
  verifiedAt: string;
  ageDays: number;
}

/** C-16 (DEV-6, G-38): AYAR's rules, by id, and per check (custom.<name> uses custom.*). */
export interface RuleBook {
  readonly version: string;
  rule(id: string): RuleDef | undefined;
  forCheck(checkId: string): CheckRules | undefined;
  /** 14.2: DSN, SEC, COD, BEH, PRF, CUS, INT. */
  sectionCode(section: string): string;
  /** Tool rules whose matches are generic: «اشتباه» (10.3). */
  suspectedToolRules(checkId: string): readonly string[];
}

/** D-13: AYAR's own Semgrep rules, as the rules file the adapter writes. */
export interface SemgrepRules {
  readonly version: string;
  readonly ids: readonly string[];
  /** The rules file: JSON, which is YAML (`--config <file>`). */
  configText(): string;
  category(ruleId: string): 'forbidden' | 'suspect' | undefined;
}

export interface Catalog {
  readonly version: string;
  /** SHA-256 of the canonical JSON of all catalog data: saved with every run (C-08). */
  readonly hash: string;
  readonly manifest: CatalogManifest;
  readonly sections: CatalogData['sections'];
  readonly criteria: readonly Criterion[];
  readonly checks: readonly CheckDefinition[];
  readonly aiTemplates: CatalogData['aiTemplates'];
  readonly sources: CatalogData['sources'];
  readonly redaction: RedactionData;
  readonly commandPolicy: CommandPolicy;
  /** kb/1: the knowledge base of the advisor and the cards (C-20), with the card types of 12.8. */
  readonly kb: Kb;
  /** DEV-6 (G-38): AYAR's rules and its Semgrep rules package. */
  readonly rules: RuleBook;
  readonly semgrep: SemgrepRules;
  check(id: string): CheckDefinition | undefined;
  criterion(id: string): Criterion | undefined;
  /** 12.7: the check's own next step for this outcome, else the catalog default. */
  nextStep(checkId: string, outcome: OutcomeKey): NextStepClass;
  timeoutMinutes(check: CheckDefinition): number;
}

export interface LoadResult {
  catalog: Catalog;
  stale: StaleEntry[];
}

/** Canonical JSON: object keys sorted, so the hash does not depend on key order in the files. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const DAY_MS = 86_400_000;

function compiles(pattern: string, flags: string): string | null {
  try {
    new RegExp(pattern, flags);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function loadCatalog(raw: unknown = builtinCatalogData(), opts: { now: Date }): LoadResult {
  const parsed = CatalogData.safeParse(raw);
  if (!parsed.success) {
    throw new CatalogError(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  const data = parsed.data;
  const issues: string[] = [];

  // Sections: exactly the sections of 10.1, once each.
  const sectionIds = data.sections.map((s) => s.id);
  for (const id of SECTION_IDS) if (sectionIds.filter((s) => s === id).length !== 1) issues.push(`sections: ${id} must appear exactly once`);

  // Checks: unique ids, filed under their own section, text keys derived from the id.
  const checks: CheckDefinition[] = [];
  const byId = new Map<string, CheckDefinition>();
  for (const file of data.checkFiles) {
    for (const c of file.checks) {
      if (c.section !== file.section) issues.push(`${c.id}: section ${c.section} filed under ${file.section}`);
      if (byId.has(c.id)) issues.push(`${c.id}: duplicate check id`);
      byId.set(c.id, c);
      checks.push(c);
      const key = c.id.replace('*', 'any');
      for (const field of ['title', 'why', 'limits'] as const) {
        if (c.text[field] !== `catalog.check.${key}.${field}`) issues.push(`${c.id}: text.${field} must be catalog.check.${key}.${field}`);
      }
    }
  }

  // Criteria (11.6): each check of the index belongs to exactly one criterion of its own section, and back.
  const criteria = new Map<string, Criterion>();
  for (const cr of data.criteria) {
    if (criteria.has(cr.id)) issues.push(`criterion ${cr.id}: duplicate`);
    criteria.set(cr.id, cr);
    for (const id of cr.checks) {
      const c = byId.get(id);
      if (!c) issues.push(`criterion ${cr.id}: unknown check ${id}`);
      else if (c.criterion !== cr.id) issues.push(`criterion ${cr.id}: lists ${id}, whose criterion is ${c.criterion ?? 'null'}`);
    }
  }
  for (const c of checks) {
    if (c.inIndex !== (c.criterion !== null)) issues.push(`${c.id}: inIndex must be true exactly when it has a criterion`);
    if (c.criterion === null) continue;
    const cr = criteria.get(c.criterion);
    if (!cr) issues.push(`${c.id}: unknown criterion ${c.criterion}`);
    else {
      if (cr.section !== c.section) issues.push(`${c.id}: criterion ${cr.id} belongs to section ${cr.section}`);
      if (!cr.checks.includes(c.id)) issues.push(`${c.id}: criterion ${cr.id} does not list it`);
    }
    if (c.section === 'integrity') issues.push(`${c.id}: integrity checks stay outside the index (D-42)`);
  }
  for (const c of checks) {
    if (c.default.kind === 'alwaysOn' && c.section !== 'integrity') issues.push(`${c.id}: only integrity checks are always on`);
    if (c.section === 'integrity' && c.default.kind !== 'alwaysOn') issues.push(`${c.id}: integrity checks are always on`);
  }

  // Relations and sources point at things that exist; dependsOn has no cycle.
  const sourceIds = new Set(data.sources.map((s) => s.id));
  if (sourceIds.size !== data.sources.length) issues.push('sources: duplicate id');
  for (const c of checks) {
    const rel = c.relations;
    for (const id of [...rel.includes, ...rel.sharesExecutionWith, ...rel.alternativeTo, ...rel.dependsOn.map((d) => d.check)]) {
      if (!byId.has(id)) issues.push(`${c.id}: relation to unknown check ${id}`);
      if (id === c.id) issues.push(`${c.id}: relation to itself`);
    }
    for (const alt of rel.alternativeTo) if (!byId.get(alt)?.relations.alternativeTo.includes(c.id)) issues.push(`${c.id}: alternative ${alt} is not mutual`);
    for (const s of c.sources) if (!sourceIds.has(s)) issues.push(`${c.id}: unknown source ${s}`);
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string, trail: string[]): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      issues.push(`dependsOn cycle: ${[...trail, id].join(' → ')}`);
      return;
    }
    visiting.add(id);
    for (const d of byId.get(id)?.relations.dependsOn ?? []) visit(d.check, [...trail, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const c of checks) visit(c.id, []);

  // AI templates: unique ids, known sources.
  const aiIds = new Set<string>();
  for (const t of data.aiTemplates) {
    if (aiIds.has(t.id)) issues.push(`${t.id}: duplicate template id`);
    aiIds.add(t.id);
    for (const s of t.sources) if (!sourceIds.has(s)) issues.push(`${t.id}: unknown source ${s}`);
  }

  // C-18 and FR-56 patterns compile; ids are unique.
  const ids = new Set<string>();
  const regexOk = (where: string, pattern: string, flags: string) => {
    const err = compiles(pattern, `${flags}g`);
    if (err) issues.push(`${where}: invalid regex (${err})`);
  };
  for (const p of data.redaction.highConfidence) {
    if (ids.has(p.id)) issues.push(`redaction ${p.id}: duplicate id`);
    ids.add(p.id);
    regexOk(`redaction ${p.id}`, p.regex.pattern, p.regex.flags);
    if ((p.group === undefined) !== (p.minEntropy === undefined)) issues.push(`redaction ${p.id}: group and minEntropy go together`);
  }
  for (const m of data.redaction.multiline) {
    regexOk(`redaction ${m.id} begin`, m.begin.pattern, m.begin.flags);
    regexOk(`redaction ${m.id} end`, m.end.pattern, m.end.flags);
  }
  for (const r of data.commandPolicy.refused) regexOk(`command ${r.id}`, r.regex.pattern, r.regex.flags);
  for (const d of data.commandPolicy.dangerous) d.regexes.forEach((r, i) => regexOk(`command ${d.id}[${i}]`, r.pattern, r.flags));

  // DEV-6 (G-38): AYAR's rules — every check has its code and rules, every rule exists and is used; the codes are
  // unique; every section has its code; and the Semgrep package's rules are rules of the book, at their version.
  issues.push(...rulesIssues(data.rules, data.semgrep, checks.map((c) => c.id), sectionIds));

  // kb/1: every reference resolves, and C-20's map points at checks of this catalog.
  issues.push(...kbIssues(data.kb, data.cards, new Set(byId.keys())));

  if (issues.length) throw new CatalogError(issues);

  // Staleness (NFR-06): entries verified more than staleAfterDays ago.
  const stale: StaleEntry[] = [];
  const now = opts.now.getTime();
  const age = (date: string) => Math.floor((now - new Date(`${date}T00:00:00Z`).getTime()) / DAY_MS);
  const consider = (kind: StaleEntry['kind'], id: string, verifiedAt: string) => {
    const days = age(verifiedAt);
    if (days > data.manifest.staleAfterDays) stale.push({ kind, id, verifiedAt, ageDays: days });
  };
  for (const c of checks) consider('check', c.id, c.verifiedAt);
  for (const t of data.aiTemplates) consider('aiTemplate', t.id, t.verifiedAt);
  for (const s of data.sources) consider('source', s.id, s.verifiedAt);
  consider('redaction', `redaction@${data.redaction.version}`, data.redaction.verifiedAt);
  consider('commandPolicy', `command-policy@${data.commandPolicy.version}`, data.commandPolicy.verifiedAt);
  consider('kb', `kb@${data.kb.manifest.version}`, data.kb.manifest.verifiedAt);
  for (const [name, part] of Object.entries(data.kb)) if ('verifiedAt' in part && name !== 'manifest') consider('kb', `kb/${name}`, part.verifiedAt);
  for (const s of data.kb.sources.sources) consider('kbSource', s.id, s.verifiedAt);
  data.kb.tools.tools.forEach((t, i) => consider('kbTool', `${t.ecosystem}/${t.category}/${t.name}#${i}`, t.verifiedAt));
  consider('cards', `cards@${data.cards.version}`, data.cards.verifiedAt);
  consider('rules', `rules@${data.rules.version}`, data.rules.verifiedAt);
  consider('semgrep', `semgrep@${data.semgrep.version}`, data.semgrep.verifiedAt);

  const hash = createHash('sha256').update(canonicalJson(data)).digest('hex');
  const catalog: Catalog = {
    version: data.manifest.version,
    hash,
    manifest: data.manifest,
    sections: data.sections,
    criteria: data.criteria,
    checks,
    aiTemplates: data.aiTemplates,
    sources: data.sources,
    redaction: data.redaction,
    commandPolicy: data.commandPolicy,
    kb: buildKb(data.kb, data.cards),
    rules: ruleBook(data.rules),
    semgrep: semgrepRules(data.semgrep),
    check: (id) => byId.get(id),
    criterion: (id) => criteria.get(id),
    nextStep: (checkId, outcome) => byId.get(checkId)?.nextStep[outcome] ?? data.manifest.nextSteps[outcome],
    timeoutMinutes: (c) => data.manifest.timeouts[c.resourceClass],
  };
  return { catalog, stale };
}

function rulesIssues(rules: CatalogData['rules'], semgrep: SemgrepData, checkIds: readonly string[], sectionIds: readonly string[]): string[] {
  const issues: string[] = [];
  const byId = new Map<string, RuleDef>();
  for (const r of rules.rules) {
    if (byId.has(r.id)) issues.push(`rule ${r.id}: duplicate id`);
    byId.set(r.id, r);
    // D-34: only a proven finding breaks the criterion or is a warning; a suspicion or a suggestion has no level (a
    // proven signal with no level, test.flaky, is rule 7 of 7.3).
    if (r.proof !== 'proven' && r.level !== null) issues.push(`rule ${r.id}: only a proven rule has a level`);
    // And a proven rule has one: without it, a proven finding would weigh nothing. test.flaky alone is rule 7's,
    // carried by the report's flaky signal.
    if (r.proof === 'proven' && r.level === null && r.id !== 'test.flaky') issues.push(`rule ${r.id}: a proven rule needs a level`);
  }
  for (const s of sectionIds) if (!rules.sectionCodes[s as SectionId]) issues.push(`rules: section ${s} has no code`);
  const codes = new Set<string>();
  const used = new Set<string>();
  for (const id of checkIds) {
    const c = rules.checks[id];
    if (!c) {
      issues.push(`rules: check ${id} has no entry`);
      continue;
    }
    if (codes.has(c.code)) issues.push(`rules: code ${c.code} of ${id} is used twice`);
    codes.add(c.code);
    for (const r of c.rules) {
      if (!byId.has(r)) issues.push(`rules: ${id} names unknown rule ${r}`);
      used.add(r);
    }
  }
  for (const id of Object.keys(rules.checks)) if (!checkIds.includes(id)) issues.push(`rules: unknown check ${id}`);
  for (const r of byId.keys()) if (!used.has(r)) issues.push(`rule ${r}: no check reports it`);
  for (const id of Object.keys(rules.suspectedToolRules)) if (!checkIds.includes(id)) issues.push(`rules: suspectedToolRules names unknown check ${id}`);
  const sast = new Set(rules.checks['sec.sast']?.rules ?? []);
  const semgrepIds = new Set<string>();
  for (const s of semgrep.rules) {
    if (semgrepIds.has(s.id)) issues.push(`semgrep ${s.id}: duplicate id`);
    semgrepIds.add(s.id);
    const r = byId.get(s.id);
    if (!r) issues.push(`semgrep ${s.id}: not a rule of the book`);
    else {
      if (!sast.has(s.id)) issues.push(`semgrep ${s.id}: sec.sast does not report it`);
      if (r.version !== s.metadata.ayar.version) issues.push(`semgrep ${s.id}: version ${s.metadata.ayar.version}, the book says ${r.version}`);
      const forbidden = s.metadata.ayar.category === 'forbidden';
      if (forbidden !== (r.proof === 'proven')) issues.push(`semgrep ${s.id}: category ${s.metadata.ayar.category} disagrees with proof ${r.proof}`);
    }
  }
  for (const r of sast) if (r.startsWith('ayar.') && !semgrepIds.has(r)) issues.push(`rules: sec.sast names ${r}, which the Semgrep package lacks`);
  return issues;
}

function ruleBook(rules: CatalogData['rules']): RuleBook {
  const byId = new Map(rules.rules.map((r) => [r.id, r]));
  const forCheck = (checkId: string): CheckRules | undefined => rules.checks[checkId] ?? (checkId.startsWith('custom.') ? rules.checks['custom.*'] : undefined);
  return {
    version: rules.version,
    rule: (id) => byId.get(id),
    forCheck,
    sectionCode: (section) => rules.sectionCodes[section as SectionId] ?? 'UNK',
    suspectedToolRules: (checkId) => rules.suspectedToolRules[checkId] ?? [],
  };
}

function semgrepRules(data: SemgrepData): SemgrepRules {
  const text = `${JSON.stringify({ rules: data.rules }, null, 1)}\n`;
  const categories = new Map(data.rules.map((r) => [r.id, r.metadata.ayar.category]));
  return { version: data.version, ids: data.rules.map((r) => r.id), configText: () => text, category: (id) => categories.get(id) };
}
