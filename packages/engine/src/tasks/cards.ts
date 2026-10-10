// C-20 «مولّد المهام» (tasks.generate) and 12.8: a card from its source, in the template of 12.8, named
// `{النوع}: {السلوك} — {الموضع}`. AYAR never invents the oracle: an unknown expected value is the owner's to
// fill («يحدده المالك قبل كتابة الاختبار»). User text (behavior, location) stays literal: in the copied text it
// sits in a code span, so `<img onerror=…>` is shown and never becomes an element (28.14 `malicious-text`).
// Pure: no I/O. The card's lifecycle and its verification are DEV-9's.
import type { Catalog, CardTemplate, Kb } from '@ayar/catalog';
import { kbRef } from '@ayar/catalog';
import { createTranslator, type MessageKey } from '@ayar/i18n';
import type { CardType, TaskCard, TaskSource } from '@ayar/protocol';
import { suggest, type AdvisorFacts } from '../advisor/advisor.ts';
import { literal } from '../advisor/render.ts';

export class CardSourceError extends Error {
  readonly reason: 'unknown_item' | 'covered_by_checks' | 'unknown_check';
  constructor(reason: CardSourceError['reason'], detail: string) {
    super(`cannot build a card: ${reason} (${detail})`);
    this.name = 'CardSourceError';
    this.reason = reason;
  }
}

/** What the project knows that helps the card's «السياق» (C-06): its test framework and a few existing tests. */
export interface CardProjectContext {
  framework?: string | null;
  examples?: readonly string[];
}

/** A card before its text: every field but `text`, plus which strings came from the user. */
type CardFields = Omit<TaskCard, 'text'>;

const fill = (s: string, values: Record<string, string>) => s.replace(/\{([a-zA-Z]+)\}/g, (m, k: string) => values[k] ?? m);

/** 10.3 checks whose missing tests are written as this kind of test (12.7: «ناقص» for want of tests → a card). */
const TEST_CARD_FOR_CHECK: Record<string, CardType> = {
  'beh.unit': 'unit_test',
  'beh.integration': 'integration_test',
  'beh.contract': 'integration_test',
  'beh.e2e': 'journey_test',
  'beh.ext.host': 'journey_test',
};

function typeDef(kb: Kb, type: CardType) {
  return type === 'generic' ? kb.cards.generic : kb.cards.types.find((t) => t.id === type)!;
}

/** The card as text, in the 12.8 template. `displayId` is null before the card is kept. */
export function renderCard(card: CardFields, kb: Kb, displayId: string | null): string {
  const tpl: CardTemplate = kb.cards.template;
  const def = typeDef(kb, card.type);
  const user = card.userSupplied;
  const behavior = user.subject ? literal(card.subject) : card.subject;
  const location = card.location === null ? tpl.ownerDecides : user.location ? literal(card.location) : card.location;
  const out: string[] = [];
  out.push(fill(tpl.heading, { id: displayId ?? tpl.draftId }));
  out.push(fill(tpl.meta, { type: def.name, priority: tpl.priorities[String(card.priority) as '1' | '2' | '3'], source: card.source.ref, nextStep: tpl.nextSteps[card.nextStep] }));
  out.push('', tpl.sections.name, `${def.name}: ${behavior} — ${location}`);
  out.push('', tpl.sections.why, card.why);
  out.push(
    '',
    tpl.sections.behavior,
    fill(tpl.behaviorLine, {
      given: card.behavior.given ?? tpl.ownerDecides,
      when: card.behavior.when ?? tpl.ownerDecides,
      must: card.behavior.must === null ? tpl.ownerDecides : user.subject ? literal(card.behavior.must) : card.behavior.must,
    }),
    fill(tpl.expectedLine, { expected: card.expected ?? tpl.ownerDecidesExpected }),
  );
  out.push('', tpl.sections.context, fill(tpl.contextLine, { files: location, framework: card.context.framework ?? tpl.noneKnown, examples: card.context.examples.length ? card.context.examples.map(literal).join('، ') : tpl.noneKnown }));
  out.push('', tpl.sections.steps, ...card.steps.map((s, i) => `${i + 1}. ${s}`));
  const checks = card.verify.map(literal).join('، ');
  const acceptance = def.isTest ? tpl.acceptanceTest : card.type === 'check_setup' ? tpl.acceptanceSetup : tpl.acceptanceReview;
  out.push('', tpl.sections.acceptance, ...acceptance.map((l) => fill(l, { checks: checks || tpl.noneKnown })));
  out.push('', tpl.sections.constraints, ...(def.isTest ? tpl.constraints : tpl.constraints.slice(1)));
  out.push('', tpl.sections.verify, card.verify.length ? fill(tpl.verifyLine, { checks }) : tpl.noCheckLine);
  return out.join('\n');
}

function finish(card: CardFields, kb: Kb): TaskCard {
  return { ...card, text: renderCard(card, kb, null) };
}

/** C-20 source 6: an advisor item for a change context. */
export function cardFromAdvisorItem(source: Extract<TaskSource, { kind: 'advisorItem' }>, kb: Kb, facts: AdvisorFacts = {}, project: CardProjectContext = {}): TaskCard {
  const item = kb.item(source.itemId);
  if (!item) throw new CardSourceError('unknown_item', source.itemId);
  const map = kb.checksFor(item.id);
  // An item that AYAR checks cover is run, not carded («شغّل هذه», FR-18); a card is for what no check covers.
  if (map.card === null) throw new CardSourceError('covered_by_checks', item.id);
  const advice = suggest(source.context, kb, facts);
  const recommended = advice.items.find((i) => i.id === item.id || i.includes.includes(item.id));
  const type = map.card as CardType;
  const def = typeDef(kb, type);
  const rules = recommended?.contributions.map((c) => c.rule) ?? [];
  const tpl = kb.cards.template;
  const behavior = source.behavior ?? item.title;
  const card: CardFields = {
    template: 'card/1',
    type,
    priority: recommended?.priority ?? 3,
    nextStep: def.nextStep,
    source: { kind: 'advisorItem', ref: `${tpl.sources.advisorItem}${rules.length ? ` ${[...new Set(rules)].join('، ')}` : ''} (${kbRef('item', item.id)})` },
    name: `${def.name}: ${behavior} — ${source.location ?? tpl.ownerDecides}`,
    subject: behavior,
    why: item.why,
    behavior: { given: null, when: null, must: source.behavior ?? null },
    expected: null,
    location: source.location ?? null,
    steps: [...item.steps],
    verify: [...map.checks],
    noAutomatedCheck: map.checks.length === 0,
    context: { framework: project.framework ?? null, examples: [...(project.examples ?? [])].slice(0, 5) },
    userSupplied: { subject: source.behavior !== undefined, location: source.location !== undefined },
  };
  return finish(card, kb);
}

/** C-20 source 1: a check that cannot run for want of configuration, a tool or tests (12.7). */
export function cardFromCheck(source: Extract<TaskSource, { kind: 'check' }>, catalog: Catalog, project: CardProjectContext = {}): TaskCard {
  const check = catalog.check(source.checkId);
  if (!check) throw new CardSourceError('unknown_check', source.checkId);
  const kb = catalog.kb;
  const tpl = kb.cards.template;
  const t = createTranslator('ar');
  const key = check.id.replace('*', 'any');
  const title = t(`catalog.check.${key}.title` as MessageKey);
  const type: CardType = source.outcome === 'missing_tests' ? (TEST_CARD_FOR_CHECK[check.id] ?? 'unit_test') : 'check_setup';
  const def = typeDef(kb, type);
  const needs = check.requirements.map((r) => (r.kind === 'reference' ? r.ref : r.kind === 'tool' ? r.tools.join('/') : r.kind === 'dataAsset' ? r.asset : r.kind));
  const policy = check.default;
  const priority = policy.kind === 'required' ? (policy.blocking ? 1 : 2) : 3;
  const location = source.location ?? (source.outcome === 'missing_configuration' ? tpl.profileLocation : null);
  const behavior = fill(tpl.checkBehavior[source.outcome], { title });
  const card: CardFields = {
    template: 'card/1',
    type,
    priority,
    nextStep: def.nextStep,
    source: { kind: 'check', ref: `${tpl.sources.check} ${check.id}` },
    name: `${def.name}: ${behavior} — ${location ?? tpl.ownerDecides}`,
    subject: behavior,
    why: t(`catalog.check.${key}.why` as MessageKey),
    behavior: { given: null, when: null, must: null },
    expected: null,
    location,
    steps: tpl.setupSteps[source.outcome].map((s) => fill(s, { check: check.id, needs: needs.length ? needs.join('، ') : tpl.noneKnown })),
    verify: [check.id],
    noAutomatedCheck: false,
    context: { framework: project.framework ?? null, examples: [...(project.examples ?? [])].slice(0, 5) },
    userSupplied: { subject: false, location: source.location !== undefined },
  };
  return finish(card, kb);
}

/** tasks.generate: the card for a source. */
export function generateCard(source: TaskSource, catalog: Catalog, facts: AdvisorFacts = {}, project: CardProjectContext = {}): TaskCard {
  return source.kind === 'advisorItem' ? cardFromAdvisorItem(source, catalog.kb, facts, project) : cardFromCheck(source, catalog, project);
}
