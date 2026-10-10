// C-07 point 5 (D-47): the one contract for a check's environment, applied by C-12 from the spec of C-09. The
// base is the login environment minus every variable whose name is on C-18's sensitive list (the one list);
// a sensitive variable the profile allows by name is passed (its value is then redacted from logs, C-18 layer
// 1); Electron's and AYAR's own variables are removed; the spec's explicit, non-secret variables are added;
// then NO_COLOR=1, FORCE_COLOR=0, AYAR=1, a TMPDIR per check, and the adapter's variables. CI is not set.
// LANG stays the user's, and is recorded.
import { classifyEnvName, type NameRules } from '../redaction/names.ts';

export interface ChildEnvInput {
  login: Readonly<Record<string, string>>;
  rules: NameRules;
  allowSensitive: readonly string[];
  explicit: Readonly<Record<string, string>>;
  tmpDir?: string;
  adapter?: Readonly<Record<string, string>>;
}

export interface ChildEnv {
  env: Record<string, string>;
  passed: string[];
  withheld: string[];
  allowedSensitive: string[];
  added: string[];
  removedInternal: string[];
}

export function computeChildEnv(i: ChildEnvInput): ChildEnv {
  const env: Record<string, string> = {};
  const withheld: string[] = [];
  const allowedSensitive: string[] = [];
  const removedInternal: string[] = [];
  const allow = new Set(i.allowSensitive);
  for (const [name, value] of Object.entries(i.login)) {
    const cls = classifyEnvName(name, i.rules);
    if (cls === 'internal') removedInternal.push(name);
    else if (cls === 'sensitive' && !allow.has(name)) withheld.push(name);
    else {
      env[name] = value;
      if (cls === 'sensitive') allowedSensitive.push(name);
    }
  }
  const added = { ...i.explicit, NO_COLOR: '1', FORCE_COLOR: '0', AYAR: '1', ...(i.tmpDir ? { TMPDIR: i.tmpDir } : {}), ...(i.adapter ?? {}) };
  Object.assign(env, added);
  const sort = (a: string[]) => a.sort();
  return { env, passed: sort(Object.keys(env)), withheld: sort(withheld), allowedSensitive: sort(allowedSensitive), added: sort(Object.keys(added)), removedInternal: sort(removedInternal) };
}
