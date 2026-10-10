// C-05 through tools/cli (FR-01 to FR-03, FR-59): the selection grant, a readable folder, duplicates by real path,
// Unicode spelling or inode, the home folder and disk root confirmations, the permission guidance, relocation with
// the identity check, rename, trust, and removal of AYAR's data alone.
import type { Project } from '@ayar/protocol';
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmationGrant, pathGrant } from '../src/grants.ts';
import { connectEngine, ok, tempDir } from './support/fixtures.ts';
import type { EngineConnection } from '../src/engine-client.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-4-projects-')));
afterEach(() => cleanup());

const add = async (engine: EngineConnection, path: string) => {
  const g = pathGrant('selection', path);
  return engine.invoke('project.add', { selectionToken: g.token }, g.grants);
};

function project(dir: string, name: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }));
  return dir;
}

describe('project registry (C-05)', () => {
  it('adds a folder once: the same real path, Unicode spelling or folder opens the existing project', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    try {
      await engine.waitForEvent('engine.health');
      const nfc = 'مكتبة إصدار'.normalize('NFC');
      const dir = project(join(root, nfc), 'lib');
      const first = ok<{ status: string; project: Project; discoveryId: string }>(await add(engine, dir));
      expect(first.status).toBe('added');
      expect(first.project).toMatchObject({ displayName: nfc, pathStatus: 'ok', untrusted: false, protectedLocation: null });
      await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === first.discoveryId);
      for (const spelling of [dir, join(root, nfc.normalize('NFD')), `${dir}/`]) {
        expect(ok<{ status: string; project: Project }>(await add(engine, spelling))).toMatchObject({ status: 'existing', project: { id: first.project.id } });
      }
      symlinkSync(dir, join(root, 'link-to-lib'));
      expect(ok<{ status: string }>(await add(engine, join(root, 'link-to-lib'))).status).toBe('existing');
      expect(ok<{ projects: Project[] }>(await engine.invoke('project.list', {})).projects).toHaveLength(1);
    } finally {
      await engine.close();
    }
  }, 60_000);

  it('refuses what is not a readable folder, with guidance for a permission refusal (FR-59)', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    const locked = join(root, 'locked');
    try {
      await engine.waitForEvent('engine.health');
      writeFileSync(join(root, 'file.txt'), 'x');
      expect(await add(engine, join(root, 'file.txt'))).toMatchObject({ ok: false, error: { code: 'not_a_directory' } });
      expect(await add(engine, join(root, 'gone'))).toMatchObject({ ok: false, error: { code: 'path_missing' } });
      mkdirSync(locked);
      chmodSync(locked, 0o000);
      expect(await add(engine, locked)).toMatchObject({ ok: false, error: { code: 'permission_denied', messageKey: 'errors.permission_denied', details: { location: null } } });
    } finally {
      chmodSync(locked, 0o700);
      await engine.close();
    }
  }, 60_000);

  it('asks before adding the whole home folder, and the confirmation is single-use', async () => {
    const home = project(join(root, 'home'), 'home');
    const engine = await connectEngine({ dataDir: join(root, 'AYAR'), env: { HOME: home } });
    try {
      await engine.waitForEvent('engine.health');
      const r = ok<{ status: string; confirmation: { pendingId: string; reason: string } }>(await add(engine, home));
      expect(r).toMatchObject({ status: 'needs_confirmation', confirmation: { reason: 'home_folder' } });
      expect(ok<{ projects: Project[] }>(await engine.invoke('project.list', {})).projects).toEqual([]);
      const confirmed = ok<{ status: string; discoveryId: string }>(await engine.invoke('project.confirm', { pendingId: r.confirmation.pendingId }));
      expect(confirmed.status).toBe('added');
      await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === confirmed.discoveryId);
      expect(await engine.invoke('project.confirm', { pendingId: r.confirmation.pendingId })).toMatchObject({ ok: false, error: { code: 'token_invalid' } });
    } finally {
      await engine.close();
    }
  }, 60_000);

  it('relocates a moved project after its identity matches, or after a confirmation', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    try {
      await engine.waitForEvent('engine.health');
      const dir = project(join(root, 'app'), 'app');
      const added = ok<{ project: Project; discoveryId: string }>(await add(engine, dir));
      const id = added.project.id;
      await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === added.discoveryId);
      renameSync(dir, join(root, 'app-moved'));
      expect(ok<{ project: Project }>(await engine.invoke('project.get', { projectId: id })).project.pathStatus).toBe('missing');
      const g = pathGrant('selection', join(root, 'app-moved'));
      const moved = ok<{ status: string; project: Project; discoveryId: string }>(await engine.invoke('project.relocate', { projectId: id, selectionToken: g.token }, g.grants));
      expect(moved).toMatchObject({ status: 'relocated', project: { pathStatus: 'ok' } });
      await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === moved.discoveryId);
      const other = project(join(root, 'other'), 'something-else');
      const g2 = pathGrant('selection', other);
      const mismatch = ok<{ status: string; confirmation: { pendingId: string; reason: string; expected: string; found: string } }>(await engine.invoke('project.relocate', { projectId: id, selectionToken: g2.token }, g2.grants));
      expect(mismatch).toMatchObject({ status: 'needs_confirmation', confirmation: { reason: 'identity_mismatch', expected: 'app', found: 'something-else' } });
      expect(ok<{ status: string }>(await engine.invoke('project.confirm', { pendingId: mismatch.confirmation.pendingId })).status).toBe('relocated');
      const renamed = ok<{ project: Project }>(await engine.invoke('project.rename', { projectId: id, displayName: '  تطبيقي  ' }));
      expect(renamed.project.displayName).toBe('تطبيقي');
    } finally {
      await engine.close();
    }
  }, 60_000);

  it('removes AYAR’s data about a project, with a confirmation, and never touches the repository', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    try {
      await engine.waitForEvent('engine.health');
      const dir = project(join(root, 'keep-me'), 'keep');
      const before = readdirSync(dir).sort();
      const added = ok<{ project: Project; discoveryId: string }>(await add(engine, dir));
      await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === added.discoveryId);
      expect(await engine.invoke('project.remove', { projectId: added.project.id, confirmationToken: confirmationGrant('project.remove', added.project.id).token })).toMatchObject({ ok: false, error: { code: 'grant_missing' } });
      const wrong = confirmationGrant('project.remove', 'prj_other');
      expect(await engine.invoke('project.remove', { projectId: added.project.id, confirmationToken: wrong.token }, wrong.grants)).toMatchObject({ ok: false, error: { code: 'confirmation_mismatch' } });
      const c = confirmationGrant('project.remove', added.project.id);
      expect(ok(await engine.invoke('project.remove', { projectId: added.project.id, confirmationToken: c.token }, c.grants))).toEqual({ removed: true });
      expect(ok<{ projects: Project[] }>(await engine.invoke('project.list', {})).projects).toEqual([]);
      expect(await engine.invoke('profile.get', { projectId: added.project.id })).toMatchObject({ ok: false, error: { code: 'not_found' } });
      expect(readdirSync(dir).sort()).toEqual(before);
      expect(existsSync(join(dir, '.ayar'))).toBe(false);
    } finally {
      await engine.close();
    }
  }, 60_000);
});

describe('component paths with @ and spaces (review M7)', () => {
  it('proposes, shows and approves instances of components like packages/@scope/x and "apps/my app"', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    try {
      await engine.waitForEvent('engine.health');
      const dir = join(root, 'mono');
      project(dir, 'mono');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'mono', workspaces: ['packages/@scope/*', 'apps/*'] }));
      for (const p of ['packages/@scope/foo', 'apps/my app']) {
        mkdirSync(join(dir, p), { recursive: true });
        writeFileSync(join(dir, p, 'package.json'), JSON.stringify({ name: p, scripts: { test: 'vitest run' } }));
        writeFileSync(join(dir, p, 'a.test.ts'), 'x');
      }
      const added = ok<{ project: Project; discoveryId: string }>(await add(engine, dir));
      await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === added.discoveryId);
      const profile = ok<{ checks: { instance: string; applicable: boolean }[]; pending: { id: string } }>(await engine.invoke('profile.get', { projectId: added.project.id }));
      expect(profile.checks.filter((c) => c.applicable).map((c) => c.instance)).toEqual(expect.arrayContaining(['beh.unit@packages/@scope/foo', 'beh.unit@apps/my app']));
      const approved = ok<{ approved: string[] }>(await engine.invoke('profile.approve', { projectId: added.project.id, changeSetId: profile.pending.id }));
      expect(approved.approved).toEqual(expect.arrayContaining(['beh.unit@packages/@scope/foo', 'beh.unit@apps/my app']));
      const after = ok<{ approvals: { instance: string }[] }>(await engine.invoke('profile.get', { projectId: added.project.id }));
      expect(after.approvals.map((a) => a.instance)).toContain('beh.unit@packages/@scope/foo');
    } finally {
      await engine.close();
    }
  }, 60_000);
});
