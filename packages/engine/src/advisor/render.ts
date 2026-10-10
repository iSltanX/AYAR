// Text of the advice (C-24): an Explanation is a message key with the actual values; this adds the label of each
// value («{impactLabel}») from the same messages, so the sentence can only say what the input was (C-20 rule 4).
// And the advice exported as Markdown (28.12 case 11): labelled «توصية لم تُنفَّذ», never claiming a test ran.
import type { AdvisorResult, Explanation } from '@ayar/protocol';
import type { Kb } from '@ayar/catalog';
import { createTranslator, MESSAGES, type Lang, type MessageKey, type Translate } from '@ayar/i18n';

const translators = new Map<Lang, Translate>();
/** One translator per language: it compiles each message once. */
function translator(lang: Lang): Translate {
  let t = translators.get(lang);
  if (!t) translators.set(lang, (t = createTranslator(lang)));
  return t;
}

/** Value names whose labels come from another list (`area` is one of `areas`). */
const LABEL_LIST: Record<string, string> = { area: 'areas', min: 'level', max: 'level', priority: 'priority' };

export function explanationText(x: Explanation, lang: Lang): string {
  const t = translator(lang);
  const table = MESSAGES[lang] as Record<string, string>;
  const values: Record<string, string | number> = { ...x.values };
  for (const [k, v] of Object.entries(x.values)) {
    const key = `advisor.value.${LABEL_LIST[k] ?? k}.${v}`;
    if (key in table) values[`${k}Label`] = t(key as MessageKey);
  }
  if ('source' in x.values) values.sourceNote = x.values.source === 'assumed' ? t('advisor.source.assumed') : '';
  return t(x.code as MessageKey, values);
}

/**
 * Markdown rendering of a code span holding user text: the fence is longer than any backtick run inside, so the
 * text stays literal (28.14 `malicious-text`): `<img onerror=…>` is shown, never inserted as an element.
 */
export function literal(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text.startsWith(' ') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** The advice as Markdown, in the UI language for the advisor's own sentences; the knowledge base text is Arabic. */
export function adviceMarkdown(r: AdvisorResult, kb: Kb, lang: Lang): string {
  const t = translator(lang);
  const ex = (x: Explanation) => explanationText(x, lang);
  const out: string[] = [];
  out.push(`# ${t('advisor.md.title')}`, '', t('advisor.md.notRun'), '');
  if (r.input.given.stack) out.push(`- ${t('advisor.input.stack.question')}: ${literal(r.input.given.stack)}`, '');
  out.push(`## ${ex({ code: 'advisor.md.risk', values: { level: r.risk.level } })}`, '');
  for (const l of [...r.risk.lines.impact, ...r.risk.lines.likelihood, ...r.risk.lines.detection]) out.push(`- ${ex(l)}`);
  if (r.risk.range.min !== r.risk.range.max) out.push('', ex({ code: 'advisor.md.range', values: { min: r.risk.range.min, max: r.risk.range.max } }));
  out.push('', `## ${ex({ code: 'advisor.md.depth', values: { depth: r.depth.id } })}`, '');
  for (const n of r.depth.notes) out.push(`- ${ex(n)}`);
  out.push('', t('advisor.md.completion', { text: r.depth.completion }), '');
  if (r.noNewTests) out.push(t('advisor.md.noNewTests'), '');
  out.push(`## ${t('advisor.md.items')}`, '');
  for (const i of r.items) {
    const item = kb.item(i.id)!;
    out.push(`### ${ex({ code: 'advisor.md.item', values: { priority: i.priority, title: item.title } })}`, '');
    const reasons = i.contributions.map((c) => {
      const rule = kb.rule(c.rule === 'C-20.5' ? 'R16' : c.rule);
      return `${c.rule} (+${c.weight})${rule ? `: ${rule.reason}` : ''}`;
    });
    out.push(t('advisor.md.because', { reasons: reasons.join(' · ') }));
    if (i.priorityNote) out.push('', ex(i.priorityNote));
    out.push('', `- ${item.proves}`, `- ${item.timing} ${item.repeat}`, `- ${item.evaluate}`, `- ${item.limits}`, '');
  }
  if (r.suggestedChecks.length) {
    out.push(`## ${t('advisor.md.checks')}`, '');
    for (const c of r.suggestedChecks) out.push(`- ${literal(c.check)}`);
    out.push('');
  }
  if (r.budget?.warning) out.push(`> ${ex(r.budget.warning)}`, '');
  if (r.omitted.length) {
    out.push(`## ${t('advisor.md.omitted')}`, '');
    for (const o of r.omitted) out.push(`- ${kb.item(o.id)!.title}: ${o.facts.map(ex).join(' ')} ${o.hint}`);
    out.push('');
  }
  if (r.input.assumed.length) {
    out.push(`## ${t('advisor.md.assumptions')}`, '');
    for (const a of r.input.assumed) out.push(`- ${ex(a.why)}`);
    out.push('');
  }
  if (r.questions.length) {
    out.push(`## ${t('advisor.md.questions')}`, '');
    for (const q of r.questions) out.push(`- ${t(`advisor.input.${q}.question` as MessageKey)}`);
    out.push('');
  }
  return out.join('\n');
}
