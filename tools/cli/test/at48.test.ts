// AT-48, the environment part (D-47, C-07 point 5), through tools/cli: a login shell that exports MY_API_TOKEN and
// NPM_TOKEN. Both are listed under «متغيرات لم تُمرَّر إلى الفحص» and are absent from the child environment that
// C-07 computes for beh.unit; allowing one in the profile adds it to that environment (and asks for approval of
// the changed spec); and neither value reaches the data folder. Delivering the variables to a real child
// process, and the raw-report half, are DEV-5's.
import type { ChildEnvSummary, ProfileView, ResolvedEnv } from '@ayar/protocol';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProject, connectEngine, filesContaining, materialize, ok, tempDir } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-4-at48-')));
afterEach(() => cleanup());

describe('AT-48 (environment): sensitive variables are withheld, and allowed one by one', () => {
  it('lists MY_API_TOKEN and NPM_TOKEN as not passed, and allowing one adds it to the computed child environment', async () => {
    const myToken = ['fake', 'my-api', 'token', '0123456789'].join('-');
    const npmToken = ['fake', 'npm', 'token', '9876543210'].join('-');
    const shell = join(root, 'login-shell');
    writeFileSync(shell, `#!/bin/sh\nexport MY_API_TOKEN='${myToken}'\nexport NPM_TOKEN='${npmToken}'\nexport PATH='/usr/bin:/bin'\nexec /bin/sh -c "$2"\n`);
    chmodSync(shell, 0o755);
    const dataDir = join(root, 'AYAR');
    // The host chooses the login shell (tools/cli's hook); the renderer's setting accepts only system shells (M10).
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: shell } });
    try {
      await engine.waitForEvent('engine.health');
      // The project's own files carry one of the values in a form no pattern recognizes (review M3): discovery,
      // which reads no environment (AT-01), saves it; reading the environment redacts it again everywhere.
      const project = materialize('FX-EXT', 'good', join(root, 'FX-EXT'));
      const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
      pkg.scripts['env:echo'] = `echo ${myToken}`;
      writeFileSync(join(project, 'package.json'), JSON.stringify(pkg, null, 2));
      const { projectId } = await addProject(engine, project);

      const first = ok<{ env: ResolvedEnv; child: ChildEnvSummary }>(await engine.invoke('environment.resolve', { projectId, instance: 'beh.unit@.' }));
      expect(first.env).toMatchObject({ source: 'login_shell', shell });
      const script = ok<{ snapshot: { facts: { key: string; value: { name?: string; text?: string } }[] } }>(await engine.invoke('project.get', { projectId })).snapshot.facts.find((f) => f.key === 'node.script' && f.value.name === 'env:echo');
      expect(script?.value.text).toBe('echo ⟦redacted:env:MY_API_TOKEN⟧');
      const proposed = ok<ProfileView>(await engine.invoke('profile.get', { projectId }));
      ok(await engine.invoke('profile.approve', { projectId, changeSetId: proposed.pending.id }));
      expect(first.env.withheld).toEqual(['MY_API_TOKEN', 'NPM_TOKEN']);
      expect(first.child.withheld).toEqual(['MY_API_TOKEN', 'NPM_TOKEN']);
      expect(first.child.passed).not.toContain('MY_API_TOKEN');
      expect(first.child.passed).not.toContain('NPM_TOKEN');
      expect(first.child.passed).toEqual(expect.arrayContaining(['PATH', 'NO_COLOR', 'FORCE_COLOR', 'AYAR']));

      // Allow one, by name, for this check (C-07 point 5): the spec changes, so it needs approval again.
      const allowed = ok<ProfileView>(await engine.invoke('profile.update', { projectId, patch: { checks: { 'beh.unit@.': { allowSensitive: ['MY_API_TOKEN'] } } } }));
      expect(allowed.pending.items.filter((i) => i.approvable)).toEqual([expect.objectContaining({ instance: 'beh.unit@.', change: 'changed', fields: [{ field: 'env.allowSensitive', before: [], after: ['MY_API_TOKEN'] }] })]);
      const second = ok<{ child: ChildEnvSummary }>(await engine.invoke('environment.resolve', { projectId, instance: 'beh.unit@.' }));
      expect(second.child).toMatchObject({ withheld: ['NPM_TOKEN'], allowedSensitive: ['MY_API_TOKEN'] });
      expect(second.child.passed).toContain('MY_API_TOKEN');
      // Another check is unaffected.
      const lint = ok<{ child: ChildEnvSummary }>(await engine.invoke('environment.resolve', { projectId, instance: 'code.lint@.' }));
      expect(lint.child.withheld).toEqual(['MY_API_TOKEN', 'NPM_TOKEN']);

      expect(JSON.stringify([first, second, allowed])).not.toContain(myToken);
      for (const v of [myToken, npmToken]) expect(filesContaining(dataDir, v)).toEqual([]);
    } finally {
      await engine.close();
    }
    for (const v of [myToken, npmToken]) expect(filesContaining(dataDir, v)).toEqual([]);
  }, 60_000);
});
