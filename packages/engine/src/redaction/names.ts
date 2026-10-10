// C-18 layer 1, the names: the ONE list of sensitive environment variable names (C-18, D-47), used by C-07 to
// withhold variables from child processes and by C-18 to redact their values. The patterns are catalog data
// (G-32); this module is their only interpreter.
//
// G-35 (proven in E-07, G-DEV2-03): a plain substring match blocks SSH_AUTH_SOCK (AUTH) and TERM_SESSION_ID
// (SESSION), which are not secrets, and withholding SSH_AUTH_SOCK breaks ssh-agent inside checks. So the words
// match whole `_`-separated words of the name, never substrings (KEYBOARD, MONKEY, PASSPORT, OAUTH2_SCOPE stay
// plain), and the catalog lists explicit exceptions that are passed and shown in the approval screen.
import type { RedactionData } from '@ayar/catalog';

export type EnvNameClass =
  /** Matches the sensitive-name list: withheld from checks unless allowed in the profile; value redacted. */
  | 'sensitive'
  /** Matches a sensitive word but is a listed exception (SSH_AUTH_SOCK): passed, and shown as such. */
  | 'exception'
  /** Electron's and AYAR's own variables: always removed from a check's environment (C-07 point 5). */
  | 'internal'
  | 'plain';

/** A user-declared sensitive name: exact, or a prefix when it ends in `*` (setting redaction.sensitiveNames). */
export type UserNamePattern = string;

export interface NameRules {
  words: ReadonlySet<string>;
  prefixes: readonly string[];
  names: ReadonlySet<string>;
  exceptions: ReadonlyMap<string, string>;
  internalPrefixes: readonly string[];
  internalNames: ReadonlySet<string>;
  /** The user's extra names (settings): exact, or `PREFIX*`. */
  user: readonly UserNamePattern[];
}

export function nameRules(data: RedactionData, user: readonly UserNamePattern[] = []): NameRules {
  return {
    words: new Set(data.sensitiveNames.words),
    prefixes: data.sensitiveNames.prefixes,
    names: new Set(data.sensitiveNames.names.map((n) => n.toUpperCase())),
    exceptions: new Map(data.sensitiveNames.exceptions.map((e) => [e.name.toUpperCase(), e.reason])),
    internalPrefixes: data.internalNames.prefixes,
    internalNames: new Set(data.internalNames.names),
    user,
  };
}

/**
 * The words of a variable name: split on anything not a letter (`_`, `-`, `.`, digits: API_KEY2 → API, KEY) and
 * at camelCase boundaries (myApiToken → MY, API, TOKEN; OAuthToken → O, AUTH, TOKEN) (review m5).
 */
export function nameWords(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((w) => w.length > 0);
}

export function classifyEnvName(name: string, rules: NameRules): EnvNameClass {
  const upper = name.toUpperCase();
  if (rules.internalNames.has(name) || rules.internalPrefixes.some((p) => upper.startsWith(p))) return 'internal';
  if (rules.exceptions.has(upper)) return 'exception';
  if (rules.names.has(upper)) return 'sensitive';
  if (rules.prefixes.some((p) => upper.startsWith(p))) return 'sensitive';
  if (nameWords(name).some((w) => rules.words.has(w))) return 'sensitive';
  if (rules.user.some((u) => (u.endsWith('*') ? upper.startsWith(u.slice(0, -1).toUpperCase()) : upper === u.toUpperCase()))) return 'sensitive';
  return 'plain';
}

export function exceptionReason(name: string, rules: NameRules): string | null {
  return rules.exceptions.get(name.toUpperCase()) ?? null;
}
