// AT-06 (FR-16, FR-17, FR-50, D-07), the engine part, through tools/cli: a required check whose tool is not
// installed (the secrets scanner) is «يحتاج تجهيزًا: أداة غير مثبتة» in the readiness and the plan, and «ناقص» in
// the run — nothing is set up implicitly. The setup action's preview shows the host, the size and where it
// writes; it runs only with a confirmation bound to that preview's digest; the pinned hash is checked; and the
// check is «جاهز» only once the tool itself answered with the pinned version, not because the install command
// succeeded. Then «أعد غير المكتمل» runs it.
//
// Two ways: always, with a local server standing in for the release (a test entry of the host replaces the
// shipped Betterleaks: same code path, no network); and, with AYAR_AT06_NETWORK=1, the real Betterleaks 1.9.0
// from GitHub (the network allowed for this test only, AT-06).
import type { ReadinessReport, RunDetail, RunPlan, SetupExecuteResult, ToolView } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmationGrant } from '../src/grants.ts';
import { addProject, approveAll, check, connectEngine, loginShell, materialize, ok, plan, startRun, tempDir, waitRun, type EngineConnection } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
let server: Server | null = null;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-at06-')));
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
  cleanup();
});

/** A stand-in Betterleaks: answers its version, and writes an empty JSON report where it is told. */
function fakeScanner(version: string): Buffer {
  const dir = join(root, `pkg-${version}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'betterleaks'),
    `#!/bin/sh\nif [ "$1" = "version" ]; then echo "${version}"; exit 0; fi\nwhile [ $# -gt 0 ]; do if [ "$1" = "--report-path" ]; then echo "[]" > "$2"; fi; shift; done\necho "no leaks found"\nexit 0\n`,
  );
  chmodSync(join(dir, 'betterleaks'), 0o755);
  const tgz = join(root, `betterleaks-${version}.tar.gz`);
  execFileSync('/usr/bin/tar', ['-czf', tgz, '-C', dir, 'betterleaks']);
  return readFileSync(tgz);
}

async function serve(files: Record<string, Buffer>): Promise<{ base: string; hits: string[] }> {
  const hits: string[] = [];
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    const body = files[req.url ?? ''];
    if (!body) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-length': body.length }).end(body);
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { base: `http://127.0.0.1:${port}`, hits };
}

function registry(file: string, url: string, body: Buffer, version = '1.9.0'): void {
  writeFileSync(
    file,
    JSON.stringify([
      {
        key: 'betterleaks',
        version,
        license: 'MIT',
        homepage: 'https://github.com/betterleaks/betterleaks',
        verifiedAt: '2026-10-10',
        files: [{ arch: process.arch === 'arm64' ? 'arm64' : 'x64', url, sha256: createHash('sha256').update(body).digest('hex'), size: body.length, archive: 'tar.gz', bin: 'betterleaks' }],
        verification: { kind: 'sha256' },
        signature: null,
        versionArgs: ['version'],
        versionPattern: '(\\d+\\.\\d+\\.\\d+)',
        system: null,
        test: true,
      },
    ]),
  );
}

const INSTANCE = 'sec.secrets.files@.';

async function setupFlow(engine: EngineConnection, projectId: string, dataDir: string): Promise<{ actionId: string; result: SetupExecuteResult }> {
  // Readiness: «يحتاج تجهيزًا: أداة غير مثبتة», with the action that would fix it.
  const readiness = ok<ReadinessReport>(await engine.invoke('readiness.evaluate', { projectId }));
  const item = readiness.items.find((i) => i.instance === INSTANCE)!;
  expect(item).toMatchObject({ readiness: 'needs_setup', reasons: [{ key: 'setup.reason.toolMissing', params: { tool: 'betterleaks' } }] });
  const action = readiness.actions.find((a) => a.id === item.actions[0])!;
  expect(action).toMatchObject({ kind: 'install_tool', state: 'proposed', target: { tool: 'betterleaks' } });

  // The plan says so before anything runs; the run says «ناقص»; nothing was installed meanwhile.
  const p = await plan(engine, projectId, { kind: 'check', instance: INSTANCE });
  expect(p.items.find((i) => i.instance === INSTANCE)).toMatchObject({ status: 'missing', readiness: 'needs_setup', setupActions: [action.id] });
  const first = await waitRun(engine, (await startRun(engine, p.id)).runId);
  expect(check(first, INSTANCE)).toMatchObject({ outcome: 'missing', outcomeReason: { key: 'setup.reason.toolMissing' } });
  expect(existsSync(join(dataDir, 'tools', 'betterleaks'))).toBe(false);

  // The preview (FR-17): what runs, the host, the size, what is written and where.
  const preview = ok<{ target: string; digest: string; preview: { preview: { network: { host: string; url: string }; sizeBytes: number; writes: { location: string; path: string }[]; runsScripts: boolean } } }>(await engine.invoke('setup.preview', { actionId: action.id }));
  expect(preview.target).toBe(action.id);
  expect(preview.preview.preview).toMatchObject({ writes: [{ location: 'ayar', path: 'tools/betterleaks/1.9.0/' }], runsScripts: false });
  expect(preview.preview.preview.sizeBytes).toBeGreaterThan(0);
  // No confirmation, or one bound to another preview: refused.
  expect(await engine.invoke('setup.execute', { actionId: action.id, confirmationToken: `cfm_${'A'.repeat(43)}` })).toMatchObject({ ok: false, error: { code: 'grant_missing' } });
  const stale = confirmationGrant('setup.execute', action.id, '0'.repeat(64));
  expect(await engine.invoke('setup.execute', { actionId: action.id, confirmationToken: stale.token }, stale.grants)).toMatchObject({ ok: false, error: { code: 'confirmation_mismatch' } });
  const g = confirmationGrant('setup.execute', action.id, preview.digest);
  const result = ok<SetupExecuteResult>(await engine.invoke('setup.execute', { actionId: action.id, confirmationToken: g.token }, g.grants));
  expect(preview.preview.preview.network.host).toBeTruthy();
  return { actionId: action.id, result };
}

describe('AT-06 (engine): readiness apart from the outcome, and setup only as an explicit action', () => {
  it('needs setup, then «ناقص» without implicit setup, then the previewed, confirmed, hash-checked install makes it ready', async () => {
    const good = fakeScanner('1.9.0');
    const { base, hits } = await serve({ '/betterleaks.tar.gz': good });
    const reg = join(root, 'registry.json');
    registry(reg, `${base}/betterleaks.tar.gz`, good);
    const dataDir = join(root, 'AYAR');
    // A login PATH without any secrets scanner of the system (gitleaks may be installed by Homebrew).
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/usr/bin:/bin' }), AYAR_TEST_TOOL_REGISTRY: reg, AYAR_TEST_ALLOW_LOOPBACK_HTTP: '1' } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, materialize('FX-EXT', 'good', join(root, 'fx')));
      await approveAll(engine, projectId);
      const { result } = await setupFlow(engine, projectId, dataDir);
      expect(hits).toEqual(['/betterleaks.tar.gz']); // exactly one download, and only after the confirmation
      expect(result.install).toMatchObject({ status: 'installed', tool: { source: 'managed', installedVersion: '1.9.0' } });
      expect(result.action.state).toBe('done');
      // «جاهز» from the tool itself.
      expect(result.readiness).toEqual([expect.objectContaining({ instance: INSTANCE, readiness: 'ready', reasons: [{ key: 'setup.reason.ready.managed', params: { tool: 'betterleaks', version: '1.9.0' } }] })]);
      // «أعد غير المكتمل»: the check runs now, with the managed tool, its raw report kept after redaction (D-46).
      const runs = ok<{ runs: { runId: string }[] }>(await engine.invoke('runs.list', { projectId }));
      const again = ok<RunPlan>(await engine.invoke('run.rerun', { runId: runs.runs[0]!.runId, filter: { mode: 'incomplete' } }));
      expect(again.items.find((i) => i.instance === INSTANCE)).toMatchObject({ status: 'run', readiness: 'ready', tool: { key: 'betterleaks', source: 'managed' } });
      const second: RunDetail = await waitRun(engine, (await startRun(engine, again.id)).runId);
      const c = check(second, INSTANCE);
      expect(c.raw).toMatchObject({ ended: 'exited', exitCode: 0, toolVersions: { betterleaks: '1.9.0' } });
      expect(c.previousCheckRunId).not.toBeNull();
      expect(c.evidence.map((x) => x.relPath.split('/').slice(-2).join('/'))).toContain('reports/betterleaks.json');
    } finally {
      await engine.close();
    }
  }, 120_000);

  it('a tool that installs but does not answer with its pinned version stays «يحتاج تجهيزًا» (9.4 point 4)', async () => {
    const wrongVersion = fakeScanner('0.0.1');
    const { base } = await serve({ '/betterleaks.tar.gz': wrongVersion });
    const reg = join(root, 'registry.json');
    registry(reg, `${base}/betterleaks.tar.gz`, wrongVersion);
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/usr/bin:/bin' }), AYAR_TEST_TOOL_REGISTRY: reg, AYAR_TEST_ALLOW_LOOPBACK_HTTP: '1' } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, materialize('FX-EXT', 'good', join(root, 'fx')));
      await approveAll(engine, projectId);
      const { result } = await setupFlow(engine, projectId, dataDir);
      expect(result.install).toMatchObject({ status: 'failed', reason: 'extract', detail: 'version 0.0.1' });
      expect(result.action.state).toBe('failed');
      expect(result.readiness[0]).toMatchObject({ instance: INSTANCE, readiness: 'needs_setup' });
      expect(readdirSync(join(dataDir, 'tools'))).toEqual([]);
      expect(ok<{ tools: ToolView[] }>(await engine.invoke('tools.list', {})).tools.find((t) => t.key === 'betterleaks')?.status).toBe('not_installed');
    } finally {
      await engine.close();
    }
  }, 120_000);

  it.runIf(process.env.AYAR_AT06_NETWORK === '1')('with the network: the real Betterleaks 1.9.0, pinned hash, version from the tool, then a real scan', async () => {
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/usr/bin:/bin' }) } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, materialize('FX-EXT', 'secret', join(root, 'fx')));
      await approveAll(engine, projectId);
      const { result } = await setupFlow(engine, projectId, dataDir);
      expect(result.install).toMatchObject({ status: 'installed', tool: { installedVersion: '1.9.0', sizeBytes: 9389819 } });
      expect(result.readiness[0]).toMatchObject({ readiness: 'ready' });
      const runs = ok<{ runs: { runId: string }[] }>(await engine.invoke('runs.list', { projectId }));
      const again = ok<RunPlan>(await engine.invoke('run.rerun', { runId: runs.runs[0]!.runId, filter: { mode: 'incomplete' } }));
      const second = await waitRun(engine, (await startRun(engine, again.id)).runId);
      // The planted secret is found (Betterleaks exits 42), and its report reaches the evidence redacted.
      expect(check(second, INSTANCE).raw).toMatchObject({ ended: 'exited', exitCode: 42 });
      console.log(`AT-06 (network): installed Betterleaks 1.9.0 (${result.install && 'downloadedBytes' in result.install ? result.install.downloadedBytes : '?'} bytes) and scanned FX-EXT/secret`);
    } finally {
      await engine.close();
    }
  }, 180_000);
});
