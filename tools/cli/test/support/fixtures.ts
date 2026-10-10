// Shared helpers of the acceptance tests run through tools/cli (plan 19 «تكامل المحرك»): fixture projects are
// materialized in a fresh temp folder (G-09, never run in fixtures/), the engine runs over the protocol with a
// temp data folder, and snapshots and proposals are reduced to the comparable views of the AT-02 files.
import type { CheckSpec, DiscoverySnapshot, Fact, InvokeResult, ProfileView } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
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
