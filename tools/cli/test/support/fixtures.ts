// Shared helpers of the acceptance tests run through tools/cli (plan 19 «تكامل المحرك»): fixture projects are
// materialized in a fresh temp folder (G-09, never run in fixtures/), the engine runs over the protocol with a
// temp data folder, and snapshots and proposals are reduced to the comparable views of the AT-02 files.
import type { CheckSpec, DiscoverySnapshot, Fact, InvokeResult, ProfileView, RunDetail, RunPlan, RunSelection, RunView } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectEngine, type EngineConnection } from '../../src/engine-client.ts';
import { pathGrant } from '../../src/grants.ts';

export const REPO = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
export const FIXTURES = join(REPO, 'fixtures');

export function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Materializes a fixture variant (fixtures/tools/materialize.mjs) and returns the project root. */
export function materialize(project: string, variant: string, into: string): string {
  return execFileSync(process.execPath, [join(FIXTURES, 'tools/materialize.mjs'), project, variant, into], { encoding: 'utf8' }).trim().split('\n').pop()!;
}

export function ok<T>(r: InvokeResult<unknown>): T {
  if (!r.ok) throw new Error(`command failed: ${JSON.stringify(r.error)}`);
  return r.result as T;
}

/** Adds a project through the protocol, as the main process would after the folder dialog, and waits for its discovery. */
export async function addProject(engine: EngineConnection, path: string): Promise<{ projectId: string; snapshot: DiscoverySnapshot; profile: ProfileView }> {
  const g = pathGrant('selection', path);
  const added = ok<{ status: string; project: { id: string }; discoveryId: string }>(await engine.invoke('project.add', { selectionToken: g.token }, g.grants));
  if (added.status !== 'added') throw new Error(`project.add: ${added.status}`);
  await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === added.discoveryId, 60_000);
  const got = ok<{ snapshot: DiscoverySnapshot }>(await engine.invoke('project.get', { projectId: added.project.id }));
  const profile = ok<ProfileView>(await engine.invoke('profile.get', { projectId: added.project.id }));
  return { projectId: added.project.id, snapshot: got.snapshot, profile };
}

export async function rescan(engine: EngineConnection, projectId: string): Promise<DiscoverySnapshot> {
  const { discoveryId } = ok<{ discoveryId: string }>(await engine.invoke('project.rescan', { projectId }));
  await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === discoveryId, 60_000);
  return ok<{ snapshot: DiscoverySnapshot }>(await engine.invoke('project.get', { projectId })).snapshot;
}

export { connectEngine };

// ── AT-02 views ─────────────────────────────────────────────────────────────────────────────────────────

/** The fact categories AT-02 compares: types, ecosystems, toolchain, test frameworks, references (FR-05 to FR-07). */
export const FACT_CATEGORIES = ['type.', 'node.package', 'node.packageManager', 'node.lockfile', 'node.workspaces', 'python.project', 'python.manager', 'python.lockfile', 'python.buildSystem', 'runtime.', 'build.tool', 'testing.framework', 'quality.tool', 'references.', 'ui.', 'ecosystem.'];

export interface FactView {
  key: string;
  component: string;
  value: unknown;
  source: Fact['source'];
  proof: Fact['proof'];
}

export function factsView(s: DiscoverySnapshot): FactView[] {
  return s.facts
    .filter((f) => FACT_CATEGORIES.some((c) => (c.endsWith('.') ? f.key.startsWith(c) : f.key === c)))
    .map((f) => ({ key: f.key, component: f.component, value: f.value, source: f.source, proof: f.proof }))
    .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
}

export interface InstanceView {
  instance: string;
  applicable: boolean;
  required: boolean;
  blocking: boolean;
  included: boolean;
  missing: CheckSpec['missing'];
  command: string[] | null;
  script: string | null;
  tool: string | null;
  reasons: string[];
}

export function proposalView(p: ProfileView): InstanceView[] {
  return p.checks.map((c) => ({
    instance: c.instance,
    applicable: c.applicable,
    required: c.required,
    blocking: c.blocking,
    included: c.included,
    missing: c.missing,
    command: c.command?.argv ?? null,
    script: c.command?.script?.name ?? null,
    tool: c.tool ? `${c.tool.key}:${c.tool.source}` : null,
    reasons: c.reasons.map((r) => (r.refs?.length ? `${r.key}(${r.refs.join(',')})` : r.key)),
  }));
}

/** Every file under a folder, for a byte search (AT-01, AT-48: a secret must be absent from the data folder). */
export function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** The files of a folder that contain these bytes (searched in the raw bytes: database pages, WAL, logs). */
export function filesContaining(dir: string, needle: string): string[] {
  const n = Buffer.from(needle);
  return filesUnder(dir).filter((f) => statSync(f).size > 0 && readFileSync(f).includes(n));
}

// ── DEV-5: runs ──────────────────────────────────────────────────────────────────────────────────────────

/** Approves every pending change one by one (a dangerous one is approved alone, FR-56). */
export async function approveAll(engine: EngineConnection, projectId: string): Promise<ProfileView> {
  for (;;) {
    const p = ok<ProfileView>(await engine.invoke('profile.get', { projectId }));
    const items = p.pending.items.filter((i) => i.approvable);
    if (!items.length) return p;
    const alone = items.find((i) => i.approveAlone);
    ok(await engine.invoke('profile.approve', { projectId, changeSetId: p.pending.id, ...(alone ? { instances: [alone.instance] } : {}) }));
  }
}

export async function plan(engine: EngineConnection, projectId: string, selection: RunSelection): Promise<RunPlan> {
  return ok<RunPlan>(await engine.invoke('run.plan', { projectId, selection }));
}

/** Waits for a run to reach a terminal state, then returns its detail. */
export async function waitRun(engine: EngineConnection, runId: string, timeoutMs = 120_000): Promise<RunDetail> {
  await engine.waitForEvent('run.state', (e) => e.payload.runId === runId && (e.payload.state === 'finished' || e.payload.state === 'interrupted'), timeoutMs);
  return ok<RunDetail>(await engine.invoke('run.get', { runId }));
}

export async function startRun(engine: EngineConnection, planId: string): Promise<RunView> {
  return ok<RunView>(await engine.invoke('run.start', { planId }));
}

export const check = (d: RunDetail, instance: string): RunDetail['checks'][number] => {
  const c = d.checks.find((x) => x.instance === instance);
  if (!c) throw new Error(`no execution of ${instance}`);
  return c;
};

/** A login shell for the engine to read (tools/cli's AYAR_TEST_LOGIN_SHELL hook): a chosen PATH and exports. */
export function loginShell(dir: string, o: { path: string; exports?: Record<string, string> }): string {
  const file = join(dir, `login-shell-${Math.random().toString(36).slice(2)}`);
  const lines = ['#!/bin/sh', ...Object.entries(o.exports ?? {}).map(([k, v]) => `export ${k}='${v}'`), `export PATH='${o.path}'`, 'exec /bin/sh -c "$2"', ''];
  writeFileSync(file, lines.join('\n'));
  chmodSync(file, 0o755);
  return file;
}

/** The check tokens the ledger of a data folder recorded (read after the engine closed). */
export function ledgerTokens(dataDir: string): string[] {
  const db = new DatabaseSync(join(dataDir, 'ayar.db'), { readOnly: true });
  try {
    return (db.prepare('SELECT check_token FROM process_ledger').all() as { check_token: string }[]).map((r) => r.check_token);
  } finally {
    db.close();
  }
}

/** Processes of this user whose environment carries one of these tokens (E-22's sweep, seen from outside). */
export function processesWithTokens(tokens: readonly string[]): { pid: number; line: string }[] {
  const out = execFileSync('/bin/ps', ['-E', '-ww', '-o', 'pid=,command=', '-U', String(process.getuid!())], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out
    .split('\n')
    .map((l) => /^\s*(\d+) (.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .filter((m) => tokens.some((t) => m[2]!.includes(`AYAR_CHECK_TOKEN=${t}`)))
    .map((m) => ({ pid: Number(m[1]), line: m[2]!.slice(0, 200) }));
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function until(cond: () => boolean, timeoutMs: number, stepMs = 50): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return cond();
}
