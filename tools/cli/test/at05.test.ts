// AT-05 (the engine part: FR-10 to FR-13, FR-55, FR-56) through tools/cli on FX-EXT: an approval lasts while the
// specs do not change; editing a source file asks for nothing; changing the test script asks for beh.unit alone,
// with the difference; the audience moves design.a11y, design.a11y.review and sec.sast between required and
// optional, with a written reason; export writes only after a preview of the differences, and import asks for
// every approval again; sudo is refused; a mass deletion is flagged and approved on its own; the «مشروع غير
// موثوق» flag is recorded. (Running checks, and the untrusted mode at run time, are DEV-5.)
import type { CheckSpec, ExportPreview, ProfileView } from '@ayar/protocol';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pathGrant } from '../src/grants.ts';
import { addProject, connectEngine, materialize, ok, rescan, tempDir } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-4-at05-')));
afterEach(() => cleanup());

const approvable = (p: ProfileView) => p.pending.items.filter((i) => i.approvable);
const spec = (p: ProfileView, instance: string): CheckSpec => p.checks.find((c) => c.instance === instance)!;

describe('AT-05: approval, its persistence, effective changes, and dangerous commands', () => {
  it('runs the approval cycle of AT-05 on FX-EXT', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    try {
      await engine.waitForEvent('engine.health');
      const project = materialize('FX-EXT', 'good', join(root, 'FX-EXT'));
      const { projectId, profile: proposed } = await addProject(engine, project);
      const get = async () => ok<ProfileView>(await engine.invoke('profile.get', { projectId }));

      // 1. Approve everything once.
      const toApprove = approvable(proposed).map((i) => i.instance);
      expect(toApprove).toEqual(expect.arrayContaining(['beh.unit@.', 'code.build@.', 'sec.ext.manifest@.', 'design.a11y@.']));
      const approved = ok<{ approved: string[]; skipped: string[]; profile: ProfileView }>(await engine.invoke('profile.approve', { projectId, changeSetId: proposed.pending.id, note: 'first approval' }));
      expect(approved.approved.sort()).toEqual(toApprove.sort());
      expect(approved.skipped).toEqual([]);
      expect(approvable(approved.profile)).toEqual([]);
      const version = approved.profile.version;
      // A change set seen before the approval is stale now (FR-11: the user approves what was shown).
      expect(await engine.invoke('profile.approve', { projectId, changeSetId: proposed.pending.id })).toMatchObject({ ok: false, error: { code: 'stale_change_set' } });

      // «لا طلب اعتماد في الخطوتين 1 و2»: a new discovery of the same files, then an edited source file.
      await rescan(engine, projectId);
      expect(approvable(await get())).toEqual([]);
      appendFileSync(join(project, 'src/lib/count.ts'), '\n// an edit to the code, not to how it is checked\n');
      await rescan(engine, projectId);
      const afterEdit = await get();
      expect(approvable(afterEdit)).toEqual([]);
      expect(afterEdit.version).toBe(version);

      // 3. The test script changes: beh.unit alone needs approval, with the field before and after.
      const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
      pkg.scripts.test = 'vitest run --reporter=dot';
      writeFileSync(join(project, 'package.json'), JSON.stringify(pkg, null, 2));
      await rescan(engine, projectId);
      const changed = await get();
      expect(approvable(changed).map((i) => i.instance)).toEqual(['beh.unit@.']);
      expect(approvable(changed)[0]).toMatchObject({ change: 'changed', fields: [{ field: 'command.script.text', before: 'vitest run', after: 'vitest run --reporter=dot' }] });
      ok(await engine.invoke('profile.approve', { projectId, changeSetId: changed.pending.id, instances: ['beh.unit@.'] }));

      // 4. «أنا وحدي»: the three audience-conditional checks become optional, with the reason; «جمهور عام» brings them back.
      const solo = ok<ProfileView>(await engine.invoke('profile.update', { projectId, patch: { context: { audience: 'solo' } } }));
      for (const id of ['design.a11y@.', 'design.a11y.review@.', 'sec.sast@.']) {
        expect(spec(solo, id), id).toMatchObject({ applicable: true, required: false, included: false });
        expect(spec(solo, id).reasons.map((r) => r.key), id).toEqual(expect.arrayContaining(['profile.reason.conditionUnmet', 'profile.reason.audienceExcludes']));
      }
      expect(spec(solo, 'beh.unit@.').required).toBe(true);
      const pub = ok<ProfileView>(await engine.invoke('profile.update', { projectId, patch: { context: { audience: 'public' } } }));
      for (const id of ['design.a11y@.', 'design.a11y.review@.', 'sec.sast@.']) expect(spec(pub, id), id).toMatchObject({ required: true, included: true });
      expect(spec(pub, 'sec.sast@.').reasons.map((r) => r.key)).not.toContain('profile.reason.audienceUndeclared');
      expect(approvable(pub)).toEqual([]); // same specs as approved: nothing to approve again

      // 5. Export writes only after the preview; import asks for every approval again.
      const destination = join(project, '.ayar', 'profile.json');
      const dst = pathGrant('destination', destination);
      expect(await engine.invoke('profile.export', { projectId, destinationToken: dst.token }, dst.grants)).toMatchObject({ ok: false, error: { code: 'preview_required' } });
      expect(existsSync(destination)).toBe(false);
      const preview = ok<ExportPreview>(await engine.invoke('profile.exportPreview', { projectId }));
      expect(preview).toMatchObject({ existing: false });
      expect(preview.diff.every((d) => d.op === '+')).toBe(true);
      expect(() => void JSON.parse(preview.text)).not.toThrow();
      mkdirSync(join(project, '.ayar'), { recursive: true });
      const dst2 = pathGrant('destination', destination);
      expect(ok(await engine.invoke('profile.export', { projectId, destinationToken: dst2.token, previewDigest: preview.previewDigest }, dst2.grants))).toMatchObject({ written: true });
      expect(readFileSync(destination, 'utf8')).toBe(preview.text);
      expect(JSON.parse(preview.text)).toMatchObject({ schema: 'ayar-profile/1', context: { audience: 'public' } });
      expect(preview.text).not.toContain('untrusted');
      await rescan(engine, projectId); // discovery now sees .ayar/profile.json (9.2 point 4)
      const again = ok<ExportPreview>(await engine.invoke('profile.exportPreview', { projectId }));
      expect(again.existing).toBe(true);
      const src = pathGrant('source', destination);
      const imported = ok<ProfileView>(await engine.invoke('profile.import', { projectId, sourceToken: src.token }, src.grants));
      expect(imported.source).toBe('imported');
      expect(imported.approvals).toEqual([]);
      expect(approvable(imported).map((i) => i.instance).sort()).toEqual(imported.checks.filter((c) => c.applicable && c.enabled && c.included && !c.refused.length).map((c) => c.instance).sort());
      const fromRepo = ok<ProfileView>(await engine.invoke('profile.importFromRepo', { projectId }));
      expect(fromRepo.approvals).toEqual([]);

      // 6. sudo is refused and nothing changes; a mass deletion is flagged and approved on its own.
      const before = await get();
      const sudo = await engine.invoke('profile.update', { projectId, patch: { custom: { evil: { argv: ['sudo', 'rm', '-rf', '/'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } });
      expect(sudo).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'sudo' } } });
      expect((await get()).version).toBe(before.version);
      const withDelete = ok<ProfileView>(await engine.invoke('profile.update', { projectId, patch: { custom: { cleanup: { argv: ['rm', '-rf', 'dist'], cwd: '.', timeoutMin: 2, success: { exitCode: 0 } } } } }));
      expect(spec(withDelete, 'custom.cleanup@.')).toMatchObject({ danger: ['mass-delete'], included: true, refused: [] });
      expect(withDelete.pending.items.find((i) => i.instance === 'custom.cleanup@.')).toMatchObject({ approveAlone: true, approvable: true });
      const together = await engine.invoke('profile.approve', { projectId, changeSetId: withDelete.pending.id, instances: ['custom.cleanup@.', 'beh.unit@.'] });
      expect(together).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'approve_alone', instance: 'custom.cleanup@.' } } });
      const all = ok<{ approved: string[]; skipped: string[]; profile: ProfileView }>(await engine.invoke('profile.approve', { projectId, changeSetId: withDelete.pending.id }));
      expect(all.skipped).toEqual(['custom.cleanup@.']);
      expect(all.approved).not.toContain('custom.cleanup@.');
      const alone = ok<{ approved: string[] }>(await engine.invoke('profile.approve', { projectId, changeSetId: all.profile.pending.id, instances: ['custom.cleanup@.'] }));
      expect(alone.approved).toEqual(['custom.cleanup@.']);

      // 7. The «مشروع غير موثوق» flag (G-20): owned by the profile, mirrored in the registry. Enforced in DEV-5.
      const untrusted = ok<{ project: { untrusted: boolean } }>(await engine.invoke('project.setTrust', { projectId, trusted: false }));
      expect(untrusted.project.untrusted).toBe(true);
      expect((await get()).untrusted).toBe(true);
      expect(ok<{ project: { untrusted: boolean } }>(await engine.invoke('project.setTrust', { projectId, trusted: true })).project.untrusted).toBe(false);
    } finally {
      await engine.close();
    }
  }, 120_000);

  it('rejects a profile that breaks the consistency rule, or writes a sensitive value', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, materialize('FX-EXT', 'good', join(root, 'FX-EXT')));
      // 7.4: a required check cannot be left out of the full scan.
      expect(await engine.invoke('profile.update', { projectId, patch: { checks: { 'beh.unit@.': { included: false } } } })).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'consistency', instance: 'beh.unit@.' } } });
      expect(await engine.invoke('profile.update', { projectId, patch: { checks: { 'beh.unit@.': { explicitEnv: { NPM_TOKEN: 'x' } } } } })).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'explicit_sensitive', name: 'NPM_TOKEN' } } });
      expect(await engine.invoke('profile.update', { projectId, patch: { checks: { 'beh.nothing@.': { enabled: false } } } })).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'unknown_check' } } });
      // Allowed: not required, then left out; and a sensitive variable passed by name (D-47).
      const p = ok<ProfileView>(await engine.invoke('profile.update', { projectId, patch: { checks: { 'beh.unit@.': { required: false, included: false, allowSensitive: ['MY_API_TOKEN'] } } } }));
      expect(spec(p, 'beh.unit@.')).toMatchObject({ required: false, included: false, env: { allowSensitive: ['MY_API_TOKEN'] } });
      // An imported file that is not ayar-profile/1 is refused, and the profile stays as it was.
      const bad = join(root, 'bad.json');
      writeFileSync(bad, JSON.stringify({ schema: 'ayar-profile/1', checks: { 'beh.unit@.': { argv: ['sudo', 'x'] } } }));
      const src = pathGrant('source', bad);
      expect(await engine.invoke('profile.import', { projectId, sourceToken: src.token }, src.grants)).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'schema' } } });
      expect(ok<ProfileView>(await engine.invoke('profile.get', { projectId })).version).toBe(p.version);
    } finally {
      await engine.close();
    }
  }, 60_000);
});

describe('nothing is saved before C-18 (D-21)', () => {
  it('refuses a profile edit that would store a secret, and a repository profile that links out of the project', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    try {
      await engine.waitForEvent('engine.health');
      const project = materialize('FX-EXT', 'good', join(root, 'FX-EXT'));
      const { projectId } = await addProject(engine, project);
      const token = ['gh', 'p_', 'S'.repeat(36)].join('');
      const r = await engine.invoke('profile.update', { projectId, patch: { custom: { deploy: { argv: ['curl', '-H', `Authorization: Bearer ${token}`, 'https://example.com'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } });
      expect(r).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'secret_in_profile', rules: 'github-token' } } });
      const outside = tempDir('ayar-DEV-4-outside-');
      try {
        writeFileSync(join(outside.dir, 'profile.json'), '{"schema":"ayar-profile/1"}');
        symlinkSync(outside.dir, join(project, '.ayar'));
        expect(await engine.invoke('profile.importFromRepo', { projectId })).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'outside_project' } } });
        expect(await engine.invoke('profile.exportPreview', { projectId })).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'outside_project' } } });
      } finally {
        outside.cleanup();
      }
    } finally {
      await engine.close();
    }
  }, 60_000);
});

describe('hostile profiles are refused, not fatal (review M4, M5)', () => {
  it('refuses a deeply nested profile and a read-only destination with coded errors, and the engine keeps serving', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    try {
      await engine.waitForEvent('engine.health');
      const project = materialize('FX-EXT', 'good', join(root, 'FX-EXT'));
      const { projectId } = await addProject(engine, project);
      const deep = join(root, 'deep.json');
      writeFileSync(deep, `{"schema":"ayar-profile/1","checks":{"beh.unit@.":{"thresholds":{"x":${'['.repeat(200_000)}${']'.repeat(200_000)}}}}}`);
      const src = pathGrant('source', deep);
      expect(await engine.invoke('profile.import', { projectId, sourceToken: src.token }, src.grants)).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'too_deep' } } });
      const readonly = join(root, 'readonly');
      mkdirSync(readonly);
      chmodSync(readonly, 0o500);
      try {
        const preview = ok<ExportPreview>(await engine.invoke('profile.exportPreview', { projectId }));
        const dst = pathGrant('destination', join(readonly, 'profile.json'));
        expect(await engine.invoke('profile.export', { projectId, destinationToken: dst.token, previewDigest: preview.previewDigest }, dst.grants)).toMatchObject({ ok: false, error: { code: 'permission_denied' } });
      } finally {
        chmodSync(readonly, 0o700);
      }
      // A valid profile that carries sudo is refused by the sudo rule itself.
      const sudo = join(root, 'sudo.json');
      const exported = JSON.parse(ok<ExportPreview>(await engine.invoke('profile.exportPreview', { projectId })).text) as { checks: Record<string, { argv?: string[] }> };
      exported.checks['beh.unit@.']!.argv = ['sudo', 'pnpm', 'test'];
      writeFileSync(sudo, JSON.stringify(exported));
      const s2 = pathGrant('source', sudo);
      expect(await engine.invoke('profile.import', { projectId, sourceToken: s2.token }, s2.grants)).toMatchObject({ ok: false, error: { code: 'profile_invalid', details: { rule: 'sudo', instance: 'beh.unit@.' } } });
      expect(ok<{ projects: unknown[] }>(await engine.invoke('project.list', {})).projects).toHaveLength(1);
    } finally {
      await engine.close();
    }
  }, 60_000);
});
