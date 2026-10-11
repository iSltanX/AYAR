// G-DEV6-01 (DEV-7, C-11): the managed Semgrep as E-10 settled it — with no Semgrep on the login PATH, sec.sast's
// readiness names «install_tool semgrep»; its preview shows the host, the size and the pinned requirements' hash; the
// install (uv's CPython, a virtual environment, the 915 pinned files with --require-hashes) happens only after a
// confirmation bound to that preview, and the version is read from Semgrep itself; then sec.sast runs with it, and
// the installed tree still matches its hash afterwards (Python writes no bytecode beside it). The data folder has a
// space in its path, as the app's does («Application Support»).
// It downloads from PyPI and python-build-standalone (about 100 MB): run only on purpose, AYAR_SEMGREP_INSTALL=1.
import type { ReadinessReport, SetupExecuteResult } from '@ayar/protocol';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { confirmationGrant } from '../../../tools/cli/src/grants.ts';
import { approveAll, plan, startRun, waitRun } from '../../../tools/cli/test/support/fixtures.ts';
import { engineFor, NVM_NODE, ok, scanVariant, tempDir, TOOLCHAIN, toolchainReady, type EngineConnection } from './support/scan.ts';

const ON = process.env.AYAR_SEMGREP_INSTALL === '1';
let root: string;
let cleanup: () => void;
let engine: EngineConnection;

beforeAll(async () => {
  if (!ON || !toolchainReady()) return;
  ({ dir: root, cleanup } = tempDir('ayar-DEV-7-semgrep Application Support-'));
  // A login PATH with uv (C-11 point 1: a system uv in range) and no Semgrep.
  const bin = join(root, 'bin');
  mkdirSync(bin);
  symlinkSync(join(TOOLCHAIN, 'py/bin/uv'), join(bin, 'uv'));
  engine = await engineFor(root, { path: [NVM_NODE, bin, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':') });
}, 60_000);
afterAll(async () => {
  await engine?.close();
  cleanup?.();
});

describe('the managed Semgrep (G-DEV6-01)', () => {
  it.runIf(ON && toolchainReady())('is an explicit action with its preview, installs the pinned environment, and runs sec.sast', async () => {
    const s = await scanVariant(engine, root, 'FX-EXT', 'good', { selection: { kind: 'group', instances: ['sec.sast@.'] }, timeoutMs: 120_000, folder: 'ext' });
    expect(s.detail.checks.find((c) => c.instance === 'sec.sast@.')?.outcome).toBe('missing');
    const readiness = ok<ReadinessReport>(await engine.invoke('readiness.evaluate', { projectId: s.projectId }));
    const action = readiness.actions.find((a) => a.kind === 'install_tool' && a.target.tool === 'semgrep')!;
    expect(action).toBeDefined();
    const preview = ok<{ digest: string; preview: { preview: { network: { host: string } | null; sizeBytes: number | null; writes: { path: string }[] } } }>(await engine.invoke('setup.preview', { actionId: action.id }));
    const g = confirmationGrant('setup.execute', action.id, preview.digest);
    const r = ok<SetupExecuteResult>(await engine.invoke('setup.execute', { actionId: action.id, confirmationToken: g.token }, g.grants));
    expect(r.install, JSON.stringify(r.install)).toMatchObject({ status: 'installed', tool: { key: 'semgrep', version: '1.180.0', source: 'managed', installedVersion: '1.180.0' } });
    const db = new DatabaseSync(join(root, 'AYAR', 'ayar.db'), { readOnly: true });
    try {
      expect(db.prepare("SELECT tool_key, version, source, status FROM tools WHERE tool_key = 'semgrep'").all()).toEqual([{ tool_key: 'semgrep', version: '1.180.0', source: 'managed', status: 'installed' }]);
    } finally {
      db.close();
    }
    await approveAll(engine, s.projectId);
    const p = await plan(engine, s.projectId, { kind: 'group', instances: ['sec.sast@.'] });
    const d = await waitRun(engine, (await startRun(engine, p.id)).runId, 600_000);
    const sast = d.checks.find((c) => c.instance === 'sec.sast@.')!;
    expect([sast.outcome, sast.raw?.toolVersions.semgrep]).toEqual(['passed', '1.180.0']);
    // Run, and still as installed: no bytecode was written beside the hashed files.
    const verified = ok<{ tools: { key: string; status: string; verifiedOk: boolean | null }[] }>(await engine.invoke('tools.verify', { toolId: 'semgrep' }));
    expect(verified.tools.find((t) => t.key === 'semgrep')).toMatchObject({ status: 'installed', verifiedOk: true });
  }, 1_800_000);
});
