// C-15 buildInvocation at the launch: the adapter's template (approved literally, with its placeholders) becomes the
// steps C-12 runs in turn as one execution. The placeholders are AYAR's own folders and values, never the project's:
//   {root}     the project root          {tmp}     the instance's own temporary folder (a neutral cwd: D-DEV2-01)
//   {reports}  this step's reports folder inside the instance's folder, `<reports>/<n>` (D-46)
//   {tool}     the managed or system tool's path (C-11)     {osvdb}   AYAR's offline OSV database (E-09)
//   {path}     the PATH of the computed environment         {nogit}   the folder of the stand-in `git` (E-10)
//   {shadow}   the shadow repository of E-24                {targets} the inventory's files, absolute, in batches
// A template that repeats (beh.stability) runs its steps one after the other; one with `{targets}` runs one step per
// batch of at most `batchBytes` of arguments (E-10: half of ARG_MAX). An unknown `{…}` is left as it is written.
import type { InvocationTemplate, Reason } from '@ayar/protocol';
import { posix } from 'node:path';

export interface ExpandContext {
  root: string;
  reportsDir: string;
  tmpDir: string;
  tool: string | null;
  path: string;
  osvDb: string;
  /** The inventory's files under the component, relative to the root (`{targets}` filters them by extension). */
  inventory: readonly string[];
  component: string;
}

export interface Step {
  n: number;
  argv: string[];
  cwd: string;
  env: Record<string, string>;
  reportsDir: string;
}

export type Expansion = { ok: true; steps: Step[] } | { ok: false; outcome: 'missing' | 'unavailable'; reason: Reason };

export const nogitDir = (tmpDir: string): string => posix.join(tmpDir, 'nogit');
export const shadowDir = (tmpDir: string): string => posix.join(tmpDir, 'shadow.git');

/** The batches of `{targets}`: each at most `batchBytes` of arguments (a single longer path is a batch of its own). */
export function batches(paths: readonly string[], batchBytes: number): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let size = 0;
  for (const p of paths) {
    const n = Buffer.byteLength(p) + 1;
    if (cur.length && size + n > batchBytes) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(p);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

export function expandTemplate(t: InvocationTemplate, c: ExpandContext): Expansion {
  const uses = (name: string) => [...t.argv, t.cwd, ...Object.values(t.env)].some((a) => a.includes(`{${name}}`));
  if (uses('tool') && !c.tool) return { ok: false, outcome: 'missing', reason: { key: 'run.reason.toolMissing', params: { tool: t.adapter } } };
  let targetBatches: string[][] = [[]];
  if (t.targets) {
    const exts = t.targets.extensions;
    const comp = c.component === '.' ? '' : `${c.component}/`;
    const files = c.inventory.filter((f) => (!comp || f.startsWith(comp)) && exts.some((e) => f.toLowerCase().endsWith(e))).sort();
    if (!files.length) return { ok: false, outcome: 'missing', reason: { key: 'adapter.reason.noTargets', params: { tool: t.adapter, extensions: exts.join(' ') } } };
    targetBatches = batches(files.map((f) => posix.join(c.root, f)), t.targets.batchBytes);
  }
  const steps: Step[] = [];
  let n = 0;
  for (let r = 0; r < t.repeat; r++) {
    for (const targets of targetBatches) {
      n++;
      const reportsDir = posix.join(c.reportsDir, String(n));
      const values: Record<string, string> = { root: c.root, reports: reportsDir, tmp: c.tmpDir, tool: c.tool ?? '', path: c.path, osvdb: c.osvDb, nogit: nogitDir(c.tmpDir), shadow: shadowDir(c.tmpDir) };
      const subst = (a: string) => a.replace(/\{(root|reports|tmp|tool|path|osvdb|nogit|shadow)\}/g, (_, k: string) => values[k]!);
      const argv: string[] = [];
      for (const a of t.argv) {
        if (a === '{targets}') argv.push(...targets);
        else argv.push(subst(a));
      }
      const cwd = subst(t.cwd);
      // A program inside the project (.venv/bin/python) is run by its path, from the command's folder.
      if (argv[0]!.includes('/') && !argv[0]!.startsWith('/')) argv[0] = posix.join(cwd, argv[0]!);
      steps.push({ n, argv, cwd, env: Object.fromEntries(Object.entries(t.env).map(([k, v]) => [k, subst(v)])), reportsDir });
    }
  }
  return { ok: true, steps };
}
