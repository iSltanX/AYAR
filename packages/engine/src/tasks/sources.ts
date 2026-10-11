// C-20 «مصادر البطاقات» 2 to 5 and 12.6's verification card (DEV-9, G-DEV8-03): cards generated from what the runs
// found — a unit of logic with no test file (the test inventory), a surviving mutant (beh.mutation), a UI state
// with no expectation (design.states), a maintenance indicator over the threshold (code.complexity: a suggestion
// only, never a change), the fix of one finding to verify by its disappearance alone (12.8), and a model claim the
// owner turned into a card (12.7). Pure: the rows are read by the service and handed over here.
import type { Catalog } from '@ayar/catalog';
import { createTranslator, type MessageKey, type Translate } from '@ayar/i18n';
import type { CardType, FindingLocation, TaskCard, TaskSource } from '@ayar/protocol';
import { literal } from '../advisor/render.ts';
import { renderCard, type CardProjectContext } from './cards.ts';

let ar: Translate | null = null;
const arabic = (): Translate => (ar ??= createTranslator('ar'));

type CardFields = Omit<TaskCard, 'text'>;

/** What a card from a finding needs of its row. */
export interface FindingForCard {
  id: string;
  displayId: string;
  checkId: string;
  ruleId: string;
  titleKey: string;
  message: string;
  location: FindingLocation | null;
  severity: string;
}

export interface ClaimForCard {
  id: string;
  displayId: string;
  template: string;
  kind: 'suspicion' | 'suggestion' | 'question';
  summary: string;
  location: FindingLocation | null;
  matchedCheckId: string | null;
}

const where = (l: FindingLocation | null): string | null => (l?.path ? (l.line ? `${l.path}:${l.line}` : l.path) : l?.key ?? (l?.page ? `${l.page}${l.state ? ` · ${l.state}` : ''}` : null));

function safeTitle(key: string): string {
  try {
    return arabic()(key as MessageKey);
  } catch {
    return key;
  }
}

function finish(catalog: Catalog, card: CardFields): TaskCard {
  return { ...card, text: renderCard(card, catalog.kb, null) };
}

function base(catalog: Catalog, type: CardType, source: TaskCard['source'], o: { subject: string; location: string | null; why: string; steps: string[]; verify: string[]; priority: 1 | 2 | 3; must?: string | null; userSubject?: boolean; userLocation?: boolean; project: CardProjectContext }): TaskCard {
  const def = type === 'generic' ? catalog.kb.cards.generic : catalog.kb.cards.types.find((t) => t.id === type)!;
  const tpl = catalog.kb.cards.template;
  const card: CardFields = {
    template: 'card/1',
    type,
    priority: o.priority,
    nextStep: def.nextStep,
    source,
    name: `${def.name}: ${o.userSubject ? literal(o.subject) : o.subject} — ${o.location === null ? tpl.ownerDecides : o.userLocation ? literal(o.location) : o.location}`,
    subject: o.subject,
    why: o.why,
    behavior: { given: null, when: null, must: o.must ?? null },
    expected: null,
    location: o.location,
    steps: o.steps,
    verify: o.verify,
    noAutomatedCheck: o.verify.length === 0,
    context: { framework: o.project.framework ?? null, examples: [...(o.project.examples ?? [])].slice(0, 5) },
    userSupplied: { subject: o.userSubject ?? false, location: o.userLocation ?? false },
  };
  return finish(catalog, card);
}

/** Source 2: a unit of logic with no test file of the same name (the inventory's gap), as a unit-test card. */
export function cardFromTestGap(source: Extract<TaskSource, { kind: 'testGap' }>, catalog: Catalog, project: CardProjectContext): TaskCard {
  const item = catalog.kb.item('unit_logic');
  const t = arabic();
  const title = safeTitle(`catalog.check.${source.checkId}.title`);
  return base(catalog, 'unit_test', { kind: 'testGap', ref: `${catalog.kb.cards.template.sources.check} ${source.checkId} (${source.file})` }, {
    subject: source.symbol ? t('tasks.card.testGap.symbol', { symbol: source.symbol }) : t('tasks.card.testGap.file'),
    location: source.file,
    why: item?.why ?? t('tasks.card.testGap.why', { check: title }),
    steps: item?.steps ? [...item.steps] : [t('tasks.card.testGap.step')],
    verify: [source.checkId],
    priority: 2,
    userLocation: true,
    userSubject: source.symbol !== undefined,
    project,
  });
}

/** Source 3: a surviving mutant → «تقوية تأكيدات». */
export function cardFromMutant(f: FindingForCard, catalog: Catalog, project: CardProjectContext): TaskCard {
  const t = arabic();
  return base(catalog, 'strengthen_assertions', { kind: 'survivingMutant', ref: `${t('tasks.card.source.finding')} ${f.displayId}` }, {
    subject: t('tasks.card.mutant.subject', { mutant: f.message.slice(0, 200) }),
    location: where(f.location),
    why: t('tasks.card.mutant.why'),
    steps: [t('tasks.card.mutant.step1'), t('tasks.card.mutant.step2')],
    verify: ['beh.mutation', 'beh.unit'],
    priority: 2,
    must: t('tasks.card.mutant.must'),
    userLocation: true,
    project,
  });
}

/** Source 4: a UI state without an expectation or a story → «مراجعة حالة واجهة» (or its definition). */
export function cardFromUiState(f: FindingForCard, catalog: Catalog, project: CardProjectContext): TaskCard {
  const t = arabic();
  const definition = /missing|undefined|no-expectation/.test(f.ruleId);
  return base(catalog, definition ? 'ui_states_definition' : 'ui_state_review', { kind: 'uiState', ref: `${t('tasks.card.source.finding')} ${f.displayId}` }, {
    subject: `${safeTitle(f.titleKey)}${f.location?.state ? ` — ${f.location.state}` : ''}`,
    location: where(f.location),
    why: t('tasks.card.uiState.why'),
    steps: [t('tasks.card.uiState.step1'), t('tasks.card.uiState.step2')],
    verify: ['design.states'],
    priority: 3,
    userLocation: true,
    project,
  });
}

/** Source 5: a maintenance indicator over the threshold → «مراجعة إعادة هيكلة», a suggestion only. */
export function cardFromMaintenance(f: FindingForCard, catalog: Catalog, project: CardProjectContext): TaskCard {
  const t = arabic();
  return base(catalog, 'refactor_review', { kind: 'maintenance', ref: `${t('tasks.card.source.finding')} ${f.displayId}` }, {
    subject: f.message.slice(0, 200) || safeTitle(f.titleKey),
    location: where(f.location),
    why: t('tasks.card.maintenance.why'),
    steps: [t('tasks.card.maintenance.step1'), t('tasks.card.maintenance.step2')],
    verify: ['code.complexity'],
    priority: 3,
    userSubject: true,
    userLocation: true,
    project,
  });
}

/** 12.6 «وأنشئ بطاقة تحقق»: the fix of one finding, proven by its disappearance in a recheck alone (12.8). */
export function cardFromFix(f: FindingForCard, catalog: Catalog, project: CardProjectContext): TaskCard {
  const t = arabic();
  return base(catalog, 'fix_verification', { kind: 'fixVerification', ref: `${t('tasks.card.source.finding')} ${f.displayId}` }, {
    subject: t('tasks.card.fix.subject', { id: f.displayId, title: safeTitle(f.titleKey) }),
    location: where(f.location),
    why: t('tasks.card.fix.why'),
    steps: [t('tasks.card.fix.step1'), t('tasks.card.fix.step2')],
    verify: [f.checkId],
    priority: f.severity === 'critical' || f.severity === 'high' ? 1 : 2,
    must: t('tasks.card.fix.must', { id: f.displayId }),
    userLocation: true,
    project,
  });
}

/** 12.7 «حوّل إلى بطاقة»: a model claim as a task; a suspicion asks for a reproducing test, the rest a general task. */
export function cardFromClaim(c: ClaimForCard, catalog: Catalog, project: CardProjectContext): TaskCard {
  const t = arabic();
  const type: CardType = c.kind === 'suspicion' ? 'bug_repro_test' : 'generic';
  return base(catalog, type, { kind: 'modelClaim', ref: `${t('tasks.card.source.claim')} ${c.displayId}` }, {
    subject: c.summary.slice(0, 300),
    location: where(c.location),
    why: t('tasks.card.claim.why', { id: c.displayId }),
    steps: [t('tasks.card.claim.step1'), t('tasks.card.claim.step2')],
    verify: c.matchedCheckId ? [c.matchedCheckId] : [],
    priority: 3,
    must: null,
    userSubject: true,
    userLocation: true,
    project,
  });
}
