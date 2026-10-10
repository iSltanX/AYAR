// AT-35 (FR-49, FR-50, NFR-06, T6), through tools/cli with DEV-1's local tool server (fixtures/tools/tool-server):
// a tool whose bytes do not match the pinned hash is refused — the download is deleted, a security alert is raised
// and the audit log records what came and what was expected — and the register shows the pinned version, the
// licence, where it comes from, and a stale alert for an entry verified more than 180 days ago. With honest bytes
// the same tool installs, verifies, and a file changed after install shows as damaged. With AYAR_AT35_NETWORK=1,
// the real uv 0.13.0 installs only once its Developer ID requirement names the pinned team, and the same bytes
// pinned to another team are refused (E-20; the network for this test only).
import type { ToolInstallResult, ToolView } from '@ayar/protocol';
import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmationGrant } from '../src/grants.ts';
import { connectEngine, FIXTURES, ok, tempDir } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
const servers: ChildProcess[] = [];
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-at35-')));
afterEach(() => {
  for (const s of servers.splice(0)) s.kill('SIGTERM');
  cleanup();
});

interface FixtureEntry {
  tool: string;
  version: string;
  url: string;
  sha256: string;
  served_sha256: string;
  license: string;
  verified_at: string;
}

/** Starts DEV-1's server and turns its catalog entry into a registry entry the host hands the engine. */
async function server(name: string, extra: string[]): Promise<{ entry: FixtureEntry; registry: string; served: number }> {
  const out = join(root, `${name}-entry.json`);
  const child = spawn(process.execPath, [join(FIXTURES, 'tools/tool-server/server.mjs'), '--catalog-out', out, ...extra], { stdio: ['ignore', 'pipe', 'inherit'] });
  servers.push(child);
  const info = await new Promise<{ url: string }>((resolve) => child.stdout.once('data', (d: Buffer) => resolve(JSON.parse(d.toString()) as { url: string })));
  const entry = JSON.parse(readFileSync(out, 'utf8')) as FixtureEntry;
  const served = (await (await fetch(info.url)).arrayBuffer()).byteLength;
  const registry = join(root, `${name}-registry.json`);
  // The size pinned is what the server serves: only the hash differs, as in a swapped release asset.
  writeFileSync(
    registry,
    JSON.stringify([
      {
        key: entry.tool,
        version: entry.version,
        license: entry.license,
        homepage: 'https://example.invalid/ayar-fake-tool',
        verifiedAt: entry.verified_at,
        files: [{ arch: process.arch === 'arm64' ? 'arm64' : 'x64', url: entry.url, sha256: entry.sha256, size: served, archive: 'tar.gz', bin: 'bin/ayar-fake-tool' }],
        verification: { kind: 'sha256' },
        signature: null,
        versionArgs: ['--version'],
        versionPattern: '(\\d+\\.\\d+\\.\\d+)',
        system: null,
        test: true,
      },
    ]),
  );
  return { entry, registry, served };
}

const audit = (dataDir: string, action: string) => {
  const db = new DatabaseSync(join(dataDir, 'ayar.db'), { readOnly: true });
  try {
    return (db.prepare('SELECT action, details_json FROM audit_log WHERE action = ?').all(action) as { action: string; details_json: string }[]).map((r) => JSON.parse(r.details_json) as Record<string, unknown>);
  } finally {
    db.close();
  }
};

describe('AT-35: a tampered tool is refused; the register shows version, licence, source and staleness', () => {
  it('refuses the tampered download, deletes it, alerts and audits; shows the pinned version and the stale entry', async () => {
    const { entry, registry } = await server('tampered', []);
    expect(entry.served_sha256).not.toBe(entry.sha256);
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_TOOL_REGISTRY: registry, AYAR_TEST_ALLOW_LOOPBACK_HTTP: '1' } });
    try {
      await engine.waitForEvent('engine.health');
      const listed = ok<{ tools: ToolView[] }>(await engine.invoke('tools.list', {}));
      const fake = listed.tools.find((t) => t.key === 'ayar-fake-tool')!;
      // FR-49: the pinned version, the licence, where it would come from, and NFR-06's staleness (200 days).
      expect(fake).toMatchObject({ version: '1.0.0', license: 'MIT', status: 'not_installed', stale: true, catalogVerifiedAt: entry.verified_at, verification: { kind: 'sha256' } });
      expect(listed.tools.find((t) => t.key === 'betterleaks')).toMatchObject({ version: '1.9.0', stale: false, license: 'MIT' });

      const preview = ok<{ target: string; digest: string; preview: { url: string; sha256: string; writes: string } }>(await engine.invoke('tools.preview', { toolId: 'ayar-fake-tool' }));
      expect(preview.preview).toMatchObject({ url: entry.url, sha256: entry.sha256, writes: 'tools/ayar-fake-tool/1.0.0/' });
      // No confirmation, or one for something else: nothing is downloaded.
      const bare = await engine.invoke('tools.install', { toolId: 'ayar-fake-tool', confirmationToken: `cfm_${'A'.repeat(43)}` });
      expect(bare).toMatchObject({ ok: false, error: { code: 'grant_missing' } });
      const wrong = confirmationGrant('tools.install', 'ayar-fake-tool', 'f'.repeat(64));
      expect(await engine.invoke('tools.install', { toolId: 'ayar-fake-tool', confirmationToken: wrong.token }, wrong.grants)).toMatchObject({ ok: false, error: { code: 'confirmation_mismatch' } });

      const g = confirmationGrant('tools.install', 'ayar-fake-tool', preview.digest);
      const r = ok<ToolInstallResult>(await engine.invoke('tools.install', { toolId: 'ayar-fake-tool', confirmationToken: g.token }, g.grants));
      expect(r).toMatchObject({ status: 'rejected', reason: 'hash_mismatch', tool: { status: 'rejected', path: null } });
      // The security alert went out as an event, and nothing of the download remains.
      const alert = await engine.waitForEvent('setup.progress', (e) => e.payload.phase === 'rejected');
      expect(alert.payload).toMatchObject({ actionId: 'tool:ayar-fake-tool', securityAlert: true, messageKey: 'setup.rejected.hash_mismatch' });
      expect(existsSync(join(dataDir, 'tools', 'ayar-fake-tool'))).toBe(false);
      expect(readdirSync(join(dataDir, 'tmp'))).toEqual([]);
    } finally {
      await engine.close();
    }
    const records = audit(dataDir, 'tool.installRejected');
    expect(records).toEqual([expect.objectContaining({ tool: 'ayar-fake-tool', version: '1.0.0', reason: 'hash_mismatch', expected: entry.sha256, actual: entry.served_sha256, url: entry.url })]);
  }, 60_000);

  it('installs honest bytes, verifies them, and shows a file changed after install as damaged', async () => {
    const { registry } = await server('honest', ['--honest', '--verified-days-ago', '10']);
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_TOOL_REGISTRY: registry, AYAR_TEST_ALLOW_LOOPBACK_HTTP: '1' } });
    try {
      await engine.waitForEvent('engine.health');
      const preview = ok<{ digest: string }>(await engine.invoke('tools.preview', { toolId: 'ayar-fake-tool' }));
      const g = confirmationGrant('tools.install', 'ayar-fake-tool', preview.digest);
      const r = ok<ToolInstallResult>(await engine.invoke('tools.install', { toolId: 'ayar-fake-tool', confirmationToken: g.token }, g.grants));
      expect(r).toMatchObject({ status: 'installed', tool: { status: 'installed', source: 'managed', installedVersion: '1.0.0', stale: false } });
      const path = (r as { tool: ToolView }).tool.path!;
      expect(path).toBe(join(dataDir, 'tools', 'ayar-fake-tool', '1.0.0', 'bin', 'ayar-fake-tool'));
      expect(statSync(path).mode & 0o111).not.toBe(0);
      expect(ok<{ tools: ToolView[] }>(await engine.invoke('tools.verify', { toolId: 'ayar-fake-tool' })).tools[0]).toMatchObject({ status: 'installed', verifiedOk: true });
      chmodSync(path, 0o755);
      writeFileSync(path, '#!/bin/sh\necho "ayar-fake-tool 1.0.0"\necho changed\n');
      expect(ok<{ tools: ToolView[] }>(await engine.invoke('tools.verify', { toolId: 'ayar-fake-tool' })).tools[0]).toMatchObject({ status: 'damaged', verifiedOk: false });
      const rm = confirmationGrant('tools.remove', 'ayar-fake-tool');
      expect(ok(await engine.invoke('tools.remove', { toolId: 'ayar-fake-tool', confirmationToken: rm.token }, rm.grants))).toMatchObject({ removed: true, tool: { status: 'not_installed' } });
      expect(existsSync(join(dataDir, 'tools', 'ayar-fake-tool'))).toBe(false);
    } finally {
      await engine.close();
    }
    expect(audit(dataDir, 'tool.installed')).toEqual([expect.objectContaining({ tool: 'ayar-fake-tool', verification: 'sha256' })]);
    expect(audit(dataDir, 'tool.removed')).toHaveLength(1);
  }, 60_000);

  it.runIf(process.env.AYAR_AT35_NETWORK === '1')('with the network: uv is installed only when its Developer ID names the pinned team', async () => {
    const install = async (env: Record<string, string>): Promise<ToolInstallResult> => {
      const engine = await connectEngine({ dataDir: join(root, `AYAR-${Object.keys(env).length}`), env });
      try {
        await engine.waitForEvent('engine.health');
        const preview = ok<{ digest: string }>(await engine.invoke('tools.preview', { toolId: 'uv' }));
        const g = confirmationGrant('tools.install', 'uv', preview.digest);
        return ok<ToolInstallResult>(await engine.invoke('tools.install', { toolId: 'uv', confirmationToken: g.token }, g.grants));
      } finally {
        await engine.close();
      }
    };
    // The shipped entry: Astral's team.
    expect(await install({})).toMatchObject({ status: 'installed', tool: { installedVersion: '0.13.0', signatureChecked: true, verification: { kind: 'developer_id', teamId: '2DC432GLL2' } } });
    // The very same bytes and hash, pinned to another team: the signature does not satisfy the requirement.
    const reg = join(root, 'registry-uv.json');
    const { BUILTIN_TOOLS } = await import('../../../packages/engine/src/tools/registry.ts');
    const uv = BUILTIN_TOOLS.find((t) => t.key === 'uv')!;
    writeFileSync(reg, JSON.stringify([{ ...uv, verification: { kind: 'developer_id', teamId: '4993Y37DX6' }, test: true }]));
    expect(await install({ AYAR_TEST_TOOL_REGISTRY: reg })).toMatchObject({ status: 'rejected', reason: 'signature_invalid' });
  }, 180_000);
});
