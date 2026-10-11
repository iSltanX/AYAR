// The advisor's sentences on screen 17 (C-20 rule 4): an Explanation is an `advisor.*` message key with the actual
// input values; each value also gets its label («{impactLabel}») from the same messages, as the engine's Markdown
// does, so a sentence can only say what the input was.
import { MESSAGES, type Lang, type MessageKey, type Translate } from '@ayar/i18n';
import type { Explanation } from '@ayar/protocol';

/** Value names whose labels come from another list (`area` is one of `areas`). */
const LABEL_LIST: Record<string, string> = { area: 'areas', min: 'level', max: 'level', priority: 'priority' };

export function explanationText(t: Translate, lang: Lang, x: Explanation): string {
  const table = MESSAGES[lang] as Record<string, string>;
  const values: Record<string, string | number> = { ...x.values };
  for (const [k, v] of Object.entries(x.values)) {
    const key = `advisor.value.${LABEL_LIST[k] ?? k}.${v}`;
    if (key in table) values[`${k}Label`] = t(key as MessageKey);
  }
  if ('source' in x.values) values.sourceNote = x.values.source === 'assumed' ? t('advisor.source.assumed') : '';
  return x.code in table ? t(x.code as MessageKey, values) : x.code;
}

/** A value's label in the advisor's lists (`advisor.value.<key>.<value>`), or the value itself. */
export function valueLabel(t: Translate, lang: Lang, key: string, value: string | number): string {
  const k = `advisor.value.${key}.${value}`;
  return k in (MESSAGES[lang] as Record<string, string>) ? t(k as MessageKey) : String(value);
}
