// AT-48, the environment part (D-47, C-07 point 5), through tools/cli: a login shell that exports MY_API_TOKEN and
// NPM_TOKEN. Both are listed under «متغيرات لم تُمرَّر إلى الفحص» and are absent from the child environment that
// C-07 computes for beh.unit; allowing one in the profile adds it to that environment (and asks for approval of
// the changed spec); and neither value reaches the data folder. Delivering the variables to a real child
// process, and the raw-report half, are DEV-5's.
import type { ChildEnvSummary, ProfileView, ReadinessReport, ResolvedEnv, RunDetail, SetupExecuteResult } from '@ayar/protocol';
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmationGrant } from '../src/grants.ts';
import { addProject, approveAll, check, connectEngine, filesContaining, filesUnder, materialize, ok, plan, startRun, tempDir, waitRun } from './support/fixtures.ts';

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

  it('a new user pattern redacts what is already stored, too (re-review R3)', async () => {
    const codename = ['internal', 'codename', 'Qv7Rk2Zp9'].join('-');
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir });
    try {
      await engine.waitForEvent('engine.health');
      const project = materialize('FX-EXT', 'good', join(root, 'FX-EXT'));
      const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
      pkg.scripts['deploy:x'] = `echo ${codename}`;
      writeFileSync(join(project, 'package.json'), JSON.stringify(pkg, null, 2));
      const { projectId } = await addProject(engine, project);
      ok(await engine.invoke('settings.set', { key: 'redaction.userPatterns', value: [{ id: 'codename', pattern: 'internal-codename-[A-Za-z0-9]+' }] }));
      const facts = ok<{ snapshot: { facts: { key: string; value: { name?: string; text?: string } }[] } }>(await engine.invoke('project.get', { projectId })).snapshot.facts;
      expect(facts.find((f) => f.key === 'node.script' && f.value.name === 'deploy:x')?.value.text).toBe('echo ⟦redacted:user:codename⟧');
    } finally {
      await engine.close();
    }
    expect(filesContaining(dataDir, codename)).toEqual([]);
  }, 60_000);
});

// ── DEV-5: the variables reaching a real child, the raw report, and the kill (AT-48 complete, engine part) ──────

const NVM_NODE = join(process.env.HOME ?? '', '.nvm/versions/node/v24.16.0/bin');

describe('AT-48 (engine, complete): what reaches the child, what is kept, and no raw report after a kill', () => {
  // FX-EXT runs on pnpm 12.8.1 (its packageManager), which the owner's machine has under nvm's Node 24.16.0.
  it.runIf(existsSync(join(NVM_NODE, 'pnpm')))('withholds the two variables from a real check, passes the allowed one redacted, keeps the raw report only redacted, and leaves none after a kill', async () => {
    const myToken = ['fake', 'my-api', 'token', '0123456789'].join('-');
    const npmToken = ['fake', 'npm', 'token', '9876543210'].join('-');
    const reportSecret = ['ayr', 'envleak', '5d2e9b1f7a3c4086b9e1d2c7a4f50e83'].join('_');
    const shell = join(root, 'login-shell');
    writeFileSync(shell, `#!/bin/sh\nexport MY_API_TOKEN='${myToken}'\nexport NPM_TOKEN='${npmToken}'\nexport PATH='${NVM_NODE}:/usr/bin:/bin'\nexec /bin/sh -c "$2"\n`);
    chmodSync(shell, 0o755);
    const dataDir = join(root, 'AYAR');
    const project = materialize('FX-EXT', 'env-leak', join(root, 'FX-EXT'));
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: shell } });
    let projectId = '';
    try {
      await engine.waitForEvent('engine.health');
      ({ projectId } = await addProject(engine, project));
      // A custom check that writes the tool's raw JSON report where AYAR tells it ({reports}, D-46).
      ok(await engine.invoke('profile.update', { projectId, patch: { custom: { leak: { argv: ['pnpm', 'exec', 'vitest', 'run', 'src/lib/env.test.ts', '--reporter=json', '--outputFile={reports}/vitest.json'], cwd: '.', timeoutMin: 2, success: { exitCode: 0, report: 'vitest.json' } } } } }));
      await approveAll(engine, projectId);
      // «ثبّت التبعيات» first (G-19): a setup action like any other, previewed and confirmed.
      const readiness = ok<ReadinessReport>(await engine.invoke('readiness.evaluate', { projectId }));
      const install = readiness.actions.find((a) => a.kind === 'install_dependencies')!;
      expect(install.preview).toMatchObject({ command: ['pnpm', 'install', '--frozen-lockfile'], writes: [{ location: 'project', path: 'node_modules' }], runsScripts: false });
      const preview = ok<{ digest: string }>(await engine.invoke('setup.preview', { actionId: install.id }));
      const g = confirmationGrant('setup.execute', install.id, preview.digest);
      const setup = ok<SetupExecuteResult>(await engine.invoke('setup.execute', { actionId: install.id, confirmationToken: g.token }, g.grants));
      expect(setup.readiness.find((r) => r.instance === 'beh.unit@.')?.readiness).toBe('ready');

      // 1. Withheld: the check prints its environment; neither value is there.
      const first = await waitRun(engine, (await startRun(engine, (await plan(engine, projectId, { kind: 'group', instances: ['beh.unit@.', 'custom.leak@.'] })).id)).runId);
      const unit = check(first, 'beh.unit@.');
      expect(unit.raw).toMatchObject({ ended: 'exited', exitCode: 1 });
      expect(unit.raw?.envKeys).not.toContain('MY_API_TOKEN');
      expect(unit.raw?.envKeys).not.toContain('NPM_TOKEN');
      const log = (c: typeof unit) => readFileSync(join(dataDir, 'evidence', c.evidence.find((x) => x.relPath.endsWith('stdout.log'))!.relPath), 'utf8');
      expect(log(unit)).toContain('MY_API_TOKEN=<unset>');
      expect(log(unit)).toContain('NPM_TOKEN=<unset>');
      // The raw report of the tool reached the evidence only redacted; its raw copy in tmp/ is gone.
      const leak = check(first, 'custom.leak@.');
      const report = leak.evidence.find((x) => x.relPath.endsWith('reports/vitest.json'))!;
      expect(report).toMatchObject({ kind: 'report', redacted: true });
      expect(readFileSync(join(dataDir, 'evidence', report.relPath), 'utf8')).toContain('⟦redacted:password-assignment⟧');
      expect(readdirSync(join(dataDir, 'tmp'))).toEqual([]);

      // 2. Allowed by name: it reaches the child, and its value is redacted from the log.
      ok(await engine.invoke('profile.update', { projectId, patch: { checks: { 'beh.unit@.': { allowSensitive: ['MY_API_TOKEN'] } } } }));
      await approveAll(engine, projectId);
      const second = await waitRun(engine, (await startRun(engine, (await plan(engine, projectId, { kind: 'check', instance: 'beh.unit@.' })).id)).runId);
      const allowed = check(second, 'beh.unit@.');
      expect(allowed.raw?.envKeys).toContain('MY_API_TOKEN');
      expect(allowed.raw?.envKeys).not.toContain('NPM_TOKEN');
      expect(log(allowed)).toContain('MY_API_TOKEN=⟦redacted:env:MY_API_TOKEN⟧');
      expect(log(allowed)).toContain('NPM_TOKEN=<unset>');
    } finally {
      await engine.close();
    }
    for (const v of [myToken, npmToken, reportSecret]) expect(filesContaining(dataDir, v), v).toEqual([]);

    // 3. Killed while a raw report waits in tmp/: at the next boot the ledger is settled, then tmp/ is deleted
    //    before anything else (C-04), and the check is «انقطع».
    // The secret is built at run time, as FX-EXT's test does: written literally, the profile would refuse it.
    const writer = "const s = ['ayr', 'envleak', '5d2e9b1f7a3c4086b9e1d2c7a4f50e83'].join('_'); require('fs').writeFileSync(process.argv[1], JSON.stringify({ message: 'token=' + s })); setTimeout(() => {}, 60000);";
    const again = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: shell } });
    let runId = '';
    try {
      await again.waitForEvent('engine.health');
      ok(await again.invoke('profile.update', { projectId, patch: { custom: { raw: { argv: ['node', '-e', writer, '{reports}/raw.json'], cwd: '.', timeoutMin: 2, success: { exitCode: 0 } } } } }));
      await approveAll(again, projectId);
      runId = (await startRun(again, (await plan(again, projectId, { kind: 'check', instance: 'custom.raw@.' })).id)).runId;
      // The raw report is in tmp/, unredacted, as a tool would leave it.
      const raw = () => filesUnder(join(dataDir, 'tmp')).filter((f) => f.endsWith('raw.json'));
      const end = Date.now() + 30_000;
      while (!raw().length && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
      expect(raw()).toHaveLength(1);
      expect(filesContaining(join(dataDir, 'tmp'), reportSecret)).toHaveLength(1);
    } finally {
      again.process.child.kill('SIGKILL');
      await again.process.exited;
    }
    const third = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: shell } });
    try {
      await third.waitForEvent('engine.health');
      expect(readdirSync(join(dataDir, 'tmp'))).toEqual([]);
      const d = ok<RunDetail>(await third.invoke('run.get', { runId }));
      expect(check(d, 'custom.raw@.')).toMatchObject({ outcome: 'interrupted' });
    } finally {
      await third.close();
    }
    for (const v of [myToken, npmToken, reportSecret]) expect(filesContaining(dataDir, v), v).toEqual([]);
  }, 180_000);
});
