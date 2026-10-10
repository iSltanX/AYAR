// AT-32 at the development level (FR-06, FR-14, FR-15), on the owner's Mac only — run with AYAR_AT32=1. It uses
// the real login shell, the real version managers' folders, and, read-only, the owner's projects Rasd, Tars and
// Wasl under E-15's terms: discovery reads their files, nothing runs in them (no version probe there), nothing
// is written (no .ayar/), and their contents never leave the temp data folder. The materialized fixtures get the
// version probes. The Finder-versus-terminal comparison of a real run is DEV-13's (the packaged app).
import type { DiscoverySnapshot, Fact, ResolvedEnv, ToolResolution } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EngineConnection } from '../src/engine-client.ts';
import { confirmationGrant } from '../src/grants.ts';
import { addProject, connectEngine, materialize, ok, tempDir } from './support/fixtures.ts';

const RUN = process.env.AYAR_AT32 === '1';
const OWNER = { Rasd: '/Volumes/iSltanXx/Projects/Brave/Rasd', Tars: '/Volumes/iSltanXx/Projects/Tars', Wasl: '/Volumes/iSltanXx/Projects/Plugins/Wasl' };

let t: { dir: string; cleanup: () => void };
let engine: EngineConnection;

/** Size and modification time of every file and link, without following links (E-15's read-only proof). */
function inventory(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try {
          const st = lstatSync(p);
          out.set(p, `${st.size}:${st.mtimeMs}`);
        } catch {
          /* vanished */
        }
      }
    }
  };
  walk(root);
  return out;
}

const value = (s: DiscoverySnapshot, key: string, component = '.') => s.facts.filter((f: Fact) => f.key === key && f.component === component).map((f) => f.value as Record<string, unknown>);
const tool = (env: ResolvedEnv, name: string): ToolResolution | undefined => env.tools.find((x) => x.tool === name);

describe.skipIf(!RUN)('AT-32 (development level, owner’s Mac): toolchain and environment', () => {
  beforeAll(async () => {
    t = tempDir('ayar-DEV-4-at32-');
    // The engine as the app would run it: the user's HOME, no SHELL inherited (it reads the account's shell).
    engine = await connectEngine({ dataDir: join(t.dir, 'AYAR'), env: { HOME: homedir() } });
    await engine.waitForEvent('engine.health');
  });
  afterAll(async () => {
    await engine?.close();
    t?.cleanup();
  });

  it('a Node project with .nvmrc for an nvm version, packageManager and a pnpm lock: facts, login environment, nvm’s matching version', async () => {
    const root = materialize('FX-EXT', 'good', join(t.dir, 'node'));
    writeFileSync(join(root, '.nvmrc'), '24.16.0\n');
    const { projectId, snapshot } = await addProject(engine, root);
    expect(value(snapshot, 'runtime.node')).toContainEqual({ spec: '24.16.0', from: 'nvmrc' });
    expect(value(snapshot, 'node.packageManager')).toContainEqual({ name: 'pnpm', version: '12.8.1', spec: 'pnpm@12.8.1' });
    expect(value(snapshot, 'node.lockfile')).toContainEqual({ file: 'pnpm-lock.yaml', manager: 'pnpm' });
    const { env } = ok<{ env: ResolvedEnv }>(await engine.invoke('environment.resolve', { projectId, probe: true }));
    expect(env.source).toBe('login_shell');
    expect(env.shell).toMatch(/\/zsh$/);
    expect(env.path.length).toBeGreaterThan(3);
    const node = tool(env, 'node')!;
    expect(node.required).toEqual({ spec: '24.16.0', from: 'nvmrc' });
    // Either the login PATH already gives 24.16.0, or the matching nvm version is proposed explicitly (FR-15).
    const viaPath = node.status === 'ok' && node.version === '24.16.0';
    const proposed = node.proposedPath === join(homedir(), '.nvm/versions/node/v24.16.0/bin/node');
    expect(viaPath || proposed, JSON.stringify(node)).toBe(true);
    expect(node.installed.map((i) => i.version)).toContain('24.16.0');
    if (node.shellFunction) expect(node.terminalVersion).toMatch(/^\d+\.\d+\.\d+$/);
    process.stdout.write(`AT-32 node: ${JSON.stringify({ source: env.source, shell: env.shell, node: { path: node.path, version: node.version, status: node.status, proposedPath: node.proposedPath, shellFunction: node.shellFunction, terminalVersion: node.terminalVersion, probe: node.probe } })}\n`);
    const pnpm = tool(env, 'pnpm')!;
    process.stdout.write(`AT-32 pnpm: ${JSON.stringify({ path: pnpm.path, viaCorepack: pnpm.viaCorepack, status: pnpm.status, probe: pnpm.probe })}\n`);
  }, 120_000);

  it('a Python project with .venv: the version from pyvenv.cfg, satisfying .python-version', async () => {
    const root = materialize('FX-PY', 'good', join(t.dir, 'py'));
    const python = existsSync('/opt/homebrew/bin/python3.12') ? '/opt/homebrew/bin/python3.12' : '/opt/homebrew/bin/python3';
    execFileSync(python, ['-m', 'venv', '--without-pip', join(root, '.venv')]);
    const { projectId, snapshot } = await addProject(engine, root);
    expect(value(snapshot, 'python.venv')).toEqual([{ path: '.venv' }]);
    expect(value(snapshot, 'python.manager')).toEqual([{ name: 'uv' }]);
    const { env } = ok<{ env: ResolvedEnv }>(await engine.invoke('environment.resolve', { projectId, probe: true }));
    const py = tool(env, 'python3')!;
    expect(py).toMatchObject({ path: join(root, '.venv/bin/python3'), versionSource: 'probe', satisfies: true, status: 'ok' });
    expect(py.version).toMatch(/^3\.12\./);
    process.stdout.write(`AT-32 python: ${JSON.stringify({ path: py.path, version: py.version, status: py.status })}\n`);
  }, 120_000);

  for (const [name, root] of Object.entries(OWNER)) {
    it(`${name} (read-only, E-15): facts match its files, nothing changes, nothing runs in it`, async () => {
      if (!existsSync(root)) throw new Error(`${root} is missing`);
      const before = inventory(root);
      const { projectId, snapshot } = await addProject(engine, root);
      const { env } = ok<{ env: ResolvedEnv }>(await engine.invoke('environment.resolve', { projectId }));
      expect(env.tools.every((x) => x.probe === null)).toBe(true); // no version probe in the owner's folder
      const after = inventory(root);
      const changed = [...after].filter(([k, v]) => before.get(k) !== v).map(([k]) => k).concat([...before.keys()].filter((k) => !after.has(k)));
      expect(changed).toEqual([]);
      expect(existsSync(join(root, '.ayar'))).toBe(false);
      const pm = value(snapshot, 'node.packageManager')[0];
      const locks = value(snapshot, 'node.lockfile').map((l) => l.file);
      if (name === 'Rasd') {
        expect(pm).toMatchObject({ name: 'pnpm', version: '11.11.0' });
        expect(locks).toContain('pnpm-lock.yaml');
        expect(value(snapshot, 'type.browserExtension')[0]).toMatchObject({ generated: true, framework: 'crxjs' });
        expect(value(snapshot, 'node.pnpmSettings').length + value(snapshot, 'node.workspaces').length).toBeGreaterThan(0);
        const pnpm = tool(env, 'pnpm');
        expect(pnpm?.required).toEqual({ spec: '11.11.0', from: 'packageManager' });
        expect(pnpm?.status).not.toBe('ok');
      }
      if (name === 'Tars') {
        expect(pm).toMatchObject({ name: 'npm', version: null });
        expect(locks).toContain('package-lock.json');
        expect(value(snapshot, 'type.desktopApp')).toContainEqual({ kind: 'tauri' });
        expect(value(snapshot, 'build.tool').map((b) => b.name)).toEqual(expect.arrayContaining(['vite']));
      }
      if (name === 'Wasl') {
        expect(pm).toMatchObject({ name: 'npm', version: null });
        expect(locks).toContain('package-lock.json');
        expect(value(snapshot, 'type.obsidianPlugin')[0]).toMatchObject({ manifest: 'manifest.json' });
        expect(value(snapshot, 'type.browserExtension')).toEqual([]);
      }
      process.stdout.write(`AT-32 ${name}: ${JSON.stringify({ files: snapshot.inventory.files, partial: snapshot.partial, facts: snapshot.facts.length, components: snapshot.components.length, durationMs: snapshot.durationMs, inventoried: before.size, changed: changed.length, node: tool(env, 'node')?.status })}\n`);
      // Leave nothing of the owner's project in AYAR's data: remove it.
      const c = confirmationGrant('project.remove', projectId);
      ok(await engine.invoke('project.remove', { projectId, confirmationToken: c.token }, c.grants));
    }, 300_000);
  }
});
