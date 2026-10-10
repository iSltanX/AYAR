// AT-01, the discovery half (FR-04, FR-08, NFR-03, D-05), through tools/cli on FX-MALICIOUS generated in a temp
// folder: while the project is added and discovered, the engine starts no process at all (its children are
// sampled every few milliseconds), `git` is never run (a fake `git` first on the engine's PATH would leave a mark,
// and so would the repository's fsmonitor, diff and textconv traps), the link to outside the root is not followed
// and is reported, .env is recorded by name only, Git data still comes from the files, and none of the three fake
// secrets reaches the data folder. The full-scan half of AT-01 is DEV-5's.
import type { DiscoverySnapshot } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pathGrant } from '../src/grants.ts';
import { connectEngine, filesContaining, materialize, ok, tempDir } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-4-at01-')));
afterEach(() => cleanup());

/** The children of a process right now (ps sees every process of the user). */
function childrenOf(pid: number): number[] {
  return execFileSync('/bin/ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter(([, ppid]) => ppid === pid)
    .map(([p]) => p!);
}

describe('AT-01 (discovery): discovery runs nothing, and keeps no secret', () => {
  it('adds and discovers FX-MALICIOUS without a child process, without git, without reading .env', async () => {
    const repo = materialize('FX-MALICIOUS', 'default', join(root, 'fx'));
    const manifest = JSON.parse(readFileSync(join(root, 'fx', 'MANIFEST.json'), 'utf8')) as { markers_dir: string; head: string; fake_secrets: Record<string, string> };
    // A git that leaves a mark if anything runs it by name.
    const fakeBin = join(root, 'fake-bin');
    const gitMark = join(root, 'git-was-run');
    mkdirSync(fakeBin);
    writeFileSync(join(fakeBin, 'git'), `#!/bin/sh\necho "$@" >> '${gitMark}'\nexit 1\n`);
    chmodSync(join(fakeBin, 'git'), 0o755);

    const slowShell = join(fakeBin, 'slow-login-shell');
    writeFileSync(slowShell, '#!/bin/sh\n/bin/sleep 0.3\nexec /bin/sh -c "$2"\n');
    chmodSync(slowShell, 0o755);
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { PATH: `${fakeBin}:${process.env.PATH ?? '/usr/bin:/bin'}`, AYAR_TEST_LOGIN_SHELL: slowShell } });
    try {
      await engine.waitForEvent('engine.health');
      const enginePid = engine.welcome.engine.pid;
      const seen = new Set<number>();
      let sampling = true;
      const sampler = (async () => {
        while (sampling) {
          for (const c of childrenOf(enginePid)) seen.add(c);
          await new Promise((r) => setTimeout(r, 5));
        }
      })();
      const g = pathGrant('selection', repo);
      const added = ok<{ status: string; project: { id: string }; discoveryId: string }>(await engine.invoke('project.add', { selectionToken: g.token }, g.grants));
      await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === added.discoveryId, 60_000);
      ok(await engine.invoke('profile.get', { projectId: added.project.id }));
      const again = ok<{ discoveryId: string }>(await engine.invoke('project.rescan', { projectId: added.project.id }));
      await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === again.discoveryId, 60_000);
      sampling = false;
      await sampler;

      // No process: the engine had no child at any sample; no git; no trap fired.
      expect([...seen]).toEqual([]);
      expect(() => readFileSync(gitMark)).toThrow();
      expect(readdirSync(manifest.markers_dir)).toEqual([]);

      const snap = ok<{ snapshot: DiscoverySnapshot }>(await engine.invoke('project.get', { projectId: added.project.id })).snapshot;
      // The outside link is not followed, and says so; the huge file is inventoried by size, not read.
      expect(snap.inventory.symlinks).toContainEqual({ path: 'external', kind: 'directory', inside: false });
      expect(snap.warnings).toContainEqual({ code: 'symlinkOutside', path: 'external' });
      expect(snap.inventory.totalBytes).toBeGreaterThanOrEqual(300 * 1024 * 1024);
      // .env by name only (it is also ignored by the repository's .gitignore).
      expect(snap.inventory.sensitiveFiles).toEqual([{ path: '.env', kind: 'env', ignored: true }]);
      // Git from files: the commit the generator wrote, without running git (E-16).
      expect(snap.facts.find((f) => f.key === 'git.repository')?.value).toMatchObject({ branch: 'main', commit: manifest.head, confidence: 'confirmed' });
      // Facts carry their sources.
      for (const f of snap.facts.filter((x) => x.key.startsWith('type.') || x.key.startsWith('testing.framework') || x.key.startsWith('node.'))) expect(f.source, f.key).not.toBeNull();

      // Positive control: the same sampler does see a child when the engine runs one (C-07 reads the login shell,
      // here the slow stand-in this test chose through the host's hook).
      sampling = true;
      const control = (async () => {
        while (sampling) {
          for (const c of childrenOf(enginePid)) seen.add(c);
          await new Promise((r) => setTimeout(r, 5));
        }
      })();
      ok(await engine.invoke('environment.resolve', { projectId: added.project.id }));
      sampling = false;
      await control;
      expect(seen.size).toBeGreaterThan(0);

      // None of the three fake secrets is anywhere in the data folder (database, WAL, logs), while running…
      for (const [name, value] of Object.entries(manifest.fake_secrets)) expect(filesContaining(dataDir, value), name).toEqual([]);
    } finally {
      await engine.close();
    }
    // …nor after the engine closed and the WAL was folded into the database.
    for (const [name, value] of Object.entries(manifest.fake_secrets)) expect(filesContaining(dataDir, value), name).toEqual([]);
  }, 120_000);
});
