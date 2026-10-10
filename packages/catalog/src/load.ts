// Loading the catalog (C-08): schema validation, then the cross-references a schema cannot express, then the
// staleness check. An invalid catalog throws CatalogError, which keeps the engine from serving (it comes up
// "degraded" at boot); the build runs the same function (scripts/validate.ts) so an invalid catalog never ships.
// An entry verified more than staleAfterDays ago (180) loads, with a staleness warning (NFR-06).
import { createHash } from 'node:crypto';
import { builtinCatalogData } from './data.ts';
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
  kind: 'check' | 'aiTemplate' | 'source' | 'redaction' | 'commandPolicy';
  id: string;
  verifiedAt: string;
  ageDays: number;
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
    check: (id) => byId.get(id),
    criterion: (id) => criteria.get(id),
    nextStep: (checkId, outcome) => byId.get(checkId)?.nextStep[outcome] ?? data.manifest.nextSteps[outcome],
    timeoutMinutes: (c) => data.manifest.timeouts[c.resourceClass],
  };
  return { catalog, stale };
}
