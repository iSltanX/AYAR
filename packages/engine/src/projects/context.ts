// What a run keeps of the project as it found it when it started (12.1 «رأس التقرير», 12.3 «سياق المشروع», 11.9):
// the project's types, and the Node and Python versions and the package manager it declares. A report of the run reads
// them from the run (runs.env_json), never from a later discovery (the audit of 2026-10-12, AUD-07 and its follow-up).
import type { DiscoverySnapshot } from '@ayar/protocol';
import { advisorFactsFromSnapshot } from '../advisor/facts.ts';

export interface ProjectContext {
  ecosystems: string[];
  /** The declared runtime versions (`.nvmrc`, engines, `requires-python`…), when the tools ran report none of their own. */
  node: string | null;
  python: string | null;
  /** `name version`, as package.json or the lock file say. */
  packageManager: string | null;
}

/** The environment a run recorded when it started (runs.env_json): the system, AYAR, the environment's source, and the project's context. */
export interface RunEnvironment extends ProjectContext {
  os: string;
  ayar: string;
  source: string | null;
}

const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function projectContextOf(snapshot: DiscoverySnapshot): ProjectContext {
  const fact = (key: string) => obj(snapshot.facts.find((f) => f.key === key)?.value);
  const spec = (key: string) => (typeof fact(key).spec === 'string' ? (fact(key).spec as string) : null);
  const pm = obj(snapshot.facts.find((f) => f.key === 'node.packageManager' || f.key === 'python.manager')?.value);
  return {
    ecosystems: [...(advisorFactsFromSnapshot(snapshot).ecosystems ?? [])],
    node: spec('runtime.node'),
    python: spec('runtime.python'),
    packageManager: typeof pm.name === 'string' ? `${pm.name}${typeof pm.version === 'string' ? ` ${pm.version}` : ''}` : null,
  };
}

/** runs.env_json read back, or null when the run recorded none (an older run): its report says so, and borrows nothing. */
export function parseRunEnvironment(json: string | null): RunEnvironment | null {
  if (!json) return null;
  try {
    const e = JSON.parse(json) as Record<string, unknown>;
    const s = (k: string): string | null => { const v = e[k]; return typeof v === 'string' ? v : null; };
    if (s('os') === null || s('ayar') === null) return null;
    return { os: s('os')!, ayar: s('ayar')!, source: s('source'), ecosystems: Array.isArray(e.ecosystems) ? e.ecosystems.filter((x): x is string => typeof x === 'string') : [], node: s('node'), python: s('python'), packageManager: s('packageManager') };
  } catch {
    return null;
  }
}
