// FR-56 (T11): commands that run with sudo (or doas) are refused; mass deletion, publishing, pushing and
// download-and-execute are flagged dangerous and approved on their own. The patterns are catalog data
// (command-policy.json); this is their only interpreter. A command is judged on its argument vector joined
// with spaces and, for a project script, on its literal text and its pre/post scripts.
import type { CommandPolicy } from '@ayar/catalog';

export interface CommandVerdict {
  refused: string[];
  danger: string[];
}

export interface CompiledPolicy {
  refused: { id: string; re: RegExp }[];
  dangerous: { id: string; res: RegExp[] }[];
}

export function compilePolicy(p: CommandPolicy): CompiledPolicy {
  return {
    refused: p.refused.map((r) => ({ id: r.id, re: new RegExp(r.regex.pattern, r.regex.flags) })),
    dangerous: p.dangerous.map((d) => ({ id: d.id, res: d.regexes.map((r) => new RegExp(r.pattern, r.flags)) })),
  };
}

export function judgeCommand(policy: CompiledPolicy, texts: readonly (string | null | undefined)[]): CommandVerdict {
  const all = texts.filter((t): t is string => typeof t === 'string' && t.length > 0);
  const refused = policy.refused.filter((r) => all.some((t) => r.re.test(t))).map((r) => r.id);
  const danger = policy.dangerous.filter((d) => all.some((t) => d.res.some((re) => re.test(t)))).map((d) => d.id);
  return { refused, danger };
}

/** An argument vector as one line, for matching: arguments with spaces are quoted. */
export function argvText(argv: readonly string[]): string {
  return argv.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(' ');
}
