// AT-02 in full (FR-05 to FR-10), through tools/cli over the protocol: FX-EXT (a browser extension) and FX-PY (a
// Python library in an Arabic path) are discovered and their profiles proposed; the facts (types, ecosystems,
// toolchain, test frameworks, references, each with its file, position and proof) and the proposal (the
// «الافتراضي» values of 10.3, with reasons for what does not apply) are compared with the expected files.
// Then a discovery is cancelled midway: nothing of it is saved, and the next one produces the full snapshot.
import type { DiscoverySnapshot } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pathGrant } from '../src/grants.ts';
import { addProject, connectEngine, factsView, FIXTURES, materialize, ok, proposalView, rescan, tempDir, type FactView, type InstanceView } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-4-at02-')));
afterEach(() => cleanup());

const expected = <T>(project: string, file: string): T => JSON.parse(readFileSync(join(FIXTURES, project, file), 'utf8')) as T;

describe('AT-02: two different projects (FR-05 to FR-10)', () => {
  for (const project of ['FX-EXT', 'FX-PY']) {
    it(`${project}: the facts and the proposed profile match the expected files`, async () => {
      const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
      try {
        await engine.waitForEvent('engine.health');
        const path = materialize(project, 'good', join(root, project));
        const { snapshot, profile } = await addProject(engine, path);
        const facts = expected<{ components: string[]; partial: boolean; facts: FactView[] }>(project, 'expected-facts.json');
        expect(snapshot.components.map((c) => c.id)).toEqual(facts.components);
        expect(snapshot.partial).toBe(facts.partial);
        expect(factsView(snapshot)).toEqual(facts.facts);
        // Every compared fact names its file, a position (a pointer or a line) when it comes from a file, and its proof.
        for (const f of factsView(snapshot)) {
          expect(f.source, f.key).not.toBeNull();
          expect(['declared', 'inferred']).toContain(f.proof);
        }
        const proposal = expected<{ instances: InstanceView[] }>(project, 'expected-proposal.json');
        expect(proposalView(profile)).toEqual(proposal.instances);
        // Not applicable means a written reason (AT-02: sec.ext.*, beh.ext.host and the design checks in FX-PY).
        for (const c of profile.checks.filter((x) => !x.applicable)) expect(c.reasons[0], c.instance).toMatchObject({ key: 'profile.reason.notApplicable', refs: expect.arrayContaining([expect.stringMatching(/^profile\.(signal|ref)\./)]) as string[] });
        if (project === 'FX-PY') {
          for (const id of ['sec.ext.manifest', 'sec.ext.permissions', 'beh.ext.host', 'design.a11y', 'design.rtl.static', 'design.tokens.static']) expect(profile.checks.find((c) => c.checkId === id)?.applicable, id).toBe(false);
          // FR-03: the snapshot's paths are relative; the project's real path keeps its Arabic spelling.
          const p = ok<{ project: { rootPath: string } }>(await engine.invoke('project.get', { projectId: profile.projectId })).project;
          expect(p.rootPath.endsWith('مشاريع تجريبية/مكتبة «النصوص»')).toBe(true);
        }
        // The spec hashes exist at the end of discovery, for every applicable instance (D-08).
        expect(Object.keys(snapshot.specFingerprints).sort()).toEqual(profile.checks.filter((c) => c.applicable).map((c) => c.instance).sort());
      } finally {
        await engine.close();
      }
    });
  }

  it('cancels a discovery midway without saving anything, and the next discovery produces the full snapshot (FR-09)', async () => {
    const repo = join(root, 'synth');
    execFileSync(process.execPath, [join(FIXTURES, 'tools/synth-repo/generate.mjs'), '--preset', 'large', '--out', repo], { stdio: 'ignore' });
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    try {
      await engine.waitForEvent('engine.health');
      const g = pathGrant('selection', repo);
      const added = ok<{ project: { id: string }; discoveryId: string }>(await engine.invoke('project.add', { selectionToken: g.token }, g.grants));
      const projectId = added.project.id;
      // Midway: after the first progress report (every 200 ms), with files already counted.
      const progress = await engine.waitForEvent('discovery.progress', (e) => e.payload.discoveryId === added.discoveryId && e.payload.filesSeen > 0, 30_000);
      expect(progress.payload).toMatchObject({ projectId, currentDir: expect.any(String) as string, kinds: expect.any(Array) as string[] });
      expect(ok<{ cancelled: boolean }>(await engine.invoke('project.cancelDiscovery', { projectId }))).toEqual({ cancelled: true });
      await engine.waitForEvent('discovery.cancelled', (e) => e.payload.discoveryId === added.discoveryId, 30_000);
      expect(engine.events.some((e) => e.topic === 'discovery.done')).toBe(false);
      expect(ok<{ snapshot: DiscoverySnapshot | null }>(await engine.invoke('project.get', { projectId })).snapshot).toBeNull();
      expect(await engine.invoke('profile.get', { projectId })).toMatchObject({ ok: false, error: { code: 'not_found', details: { reason: 'no_snapshot' } } });
      // Again, to the end: the whole tree, not partial.
      const full = await rescan(engine, projectId);
      expect(full.partial).toBe(false);
      expect(full.inventory.files).toBe(50_000);
    } finally {
      await engine.close();
    }
  }, 120_000);
});
