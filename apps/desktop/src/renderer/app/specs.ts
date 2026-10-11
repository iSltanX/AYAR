// How a check's spec reads on the approval screen and in the inspector (9.3, 13.3): its literal command (the approved
// invocation, the managed tool named), what running it does, why it was proposed, and its diff since approval.
import type { ChangeItem, CheckSpec, JsonValue, Reason } from '@ayar/protocol';
import type { Lang, Translate } from '@ayar/i18n';
import type { CommandChange, DiffLine } from '../lib/sheets.ts';
import { checkTitle, hasMessage, reasonText } from './format.ts';

/** One argument as a shell would need it written, for reading only (it never runs from this text). */
function shellWord(a: string): string {
  return /^[\w@%+=:,./{}-]+$/.test(a) ? a : `'${a.replaceAll("'", "'\\''")}'`;
}

export function argvText(argv: readonly string[]): string {
  return argv.map(shellWord).join(' ');
}

/** The literal command of a spec: the project's, or the adapter's invocation with the managed tool named. */
export function commandOf(spec: CheckSpec): string | null {
  if (spec.invocation) {
    const tool = spec.tool?.key ?? spec.runner.ids[0] ?? 'tool';
    return argvText(spec.invocation.argv.map((a) => (a === '{tool}' ? tool : a)));
  }
  if (spec.command) return argvText(spec.command.argv);
  return null;
}

/** The reasons a spec gives, as sentences, and the references and signals they name. */
export function reasonsOf(t: Translate, lang: Lang, reasons: readonly Reason[]): { text: string; refs: string[] } {
  const texts = reasons.map((r) => reasonText(t, lang, r)).filter(Boolean);
  const refs = reasons.flatMap((r) => r.refs ?? []).map((k) => (hasMessage(lang, k) ? t(k) : k));
  return { text: texts.join(' · '), refs };
}

const show = (v: JsonValue | null): string => (v === null ? '' : Array.isArray(v) && v.every((x) => typeof x === 'string') ? argvText(v) : typeof v === 'string' ? v : JSON.stringify(v));

/** A pending change as the approval diff draws it (Sheet/Approval diff 114:8898): the command first, then the rest. */
export function changeOf(t: Translate, lang: Lang, item: ChangeItem, display: string): CommandChange {
  const lines: DiffLine[] = [];
  const empty = (v: JsonValue | null) => v === null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);
  // A new check shows its command (or that it is new); a changed one shows each field that changed.
  const fields = [...item.fields]
    .filter((f) => (item.change === 'added' ? f.field === 'command.argv' || f.field === 'command.script.text' : !(empty(f.before) && empty(f.after))))
    .sort((a, b) => (a.field === 'command.argv' ? -1 : b.field === 'command.argv' ? 1 : 0));
  for (const f of fields) {
    const label = f.field === 'command.argv' ? '' : `${f.field}: `;
    if (f.before !== null) lines.push({ kind: 'removed', text: `${label}${show(f.before)}` });
    if (f.after !== null) lines.push({ kind: 'added', text: `${label}${show(f.after)}` });
  }
  if (!lines.length) lines.push({ kind: 'added', text: t(item.change === 'removed' ? 'profile.change.removed' : item.change === 'added' ? 'profile.change.added' : 'profile.change.changed') });
  const checkId = item.instance.split('@')[0]!;
  return { id: display, name: checkTitle(t, lang, checkId), lines };
}
