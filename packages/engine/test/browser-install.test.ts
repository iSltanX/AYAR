// C-11 and C-14 (DEV-7, task 6): «ثبّت متصفح المسبار» is an explicit setup action with its source and size shown
// first; it downloads, checks the pinned SHA-256, unpacks, reads the version from the browser itself, and registers
// the data asset — and a file that does not match its hash is rejected, deleted, audited, and nothing is installed.
// The shipped build is Google's 186 MB archive; here a loopback server (tools/cli's test hook, never the app)
// serves a stand-in with the same layout, so every step runs without the network.
import type { ReadinessReport, SetupExecuteResult } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { confirmationGrant } from '../../../tools/cli/src/grants.ts';
import { addProject, approveAll, connectEngine, loginShell, materialize } from '../../../tools/cli/test/support/fixtures.ts';
import { BROWSER_BUILD } from '../src/probe/browser.ts';
import { LOGIN_PATH, ok, tempDir, type EngineConnection } from './support/scan.ts';

const BIN = 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
let root: string;
let cleanup: () => void;
let server: Server;
let port = 0;
const files = new Map<string, Buffer>();

/** A stand-in archive: the executable at the pinned path answers `--version` as Chrome for Testing does. */
function standIn(dir: string, version: string): Buffer {
  const src = join(dir, `src-${version}`);
  const exe = join(src, BIN);
  mkdirSync(join(exe, '..'), { recursive: true });
  writeFileSync(exe, `#!/bin/sh\necho "Google Chrome for Testing ${version} "\n`);
  chmodSync(exe, 0o755);
  const zip = join(dir, `browser-${version}.zip`);
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', join(src, 'chrome-mac-arm64'), zip]);
  return readFileSync(zip);
}

beforeAll(async () => {
  ({ dir: root, cleanup } = tempDir('ayar-DEV-7-browser-'));
  files.set('/browser.zip', standIn(root, BROWSER_BUILD.version));
  files.set('/tampered.zip', standIn(root, '1.0.0.0'));
  server = createServer((req, res) => {
    const body = files.get(req.url ?? '');
    if (!body) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-length': String(body.length) }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as { port: number }).port;
}, 60_000);
afterAll(async () => {
  await new Promise<void>((r) => server?.close(() => r()));
  if (process.env.AYAR_KEEP_TMP) console.log(root);
  else cleanup?.();
});

async function engineWith(name: string, served: string, sha256: string): Promise<EngineConnection> {
  const build = { ...BROWSER_BUILD, url: `http://127.0.0.1:${port}${served}`, sha256, size: files.get(served)!.length, test: true };
  const buildFile = join(root, `${name}.json`);
  writeFileSync(buildFile, JSON.stringify(build));
  const engine = await connectEngine({ dataDir: join(root, name, 'AYAR'), env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: LOGIN_PATH }), AYAR_TEST_BROWSER_BUILD: buildFile, AYAR_TEST_ALLOW_LOOPBACK_HTTP: '1' } });
  await engine.waitForEvent('engine.health', undefined, 30_000);
  return engine;
}

async function installAction(engine: EngineConnection, projectRoot: string): Promise<{ projectId: string; actionId: string; readiness: ReadinessReport }> {
  const { projectId } = await addProject(engine, projectRoot);
  ok(await engine.invoke('profile.update', { projectId, patch: { checks: { 'design.a11y@.': { included: true } } } }));
  await approveAll(engine, projectId);
  const readiness = ok<ReadinessReport>(await engine.invoke('readiness.evaluate', { projectId }));
  const item = readiness.items.find((i) => i.instance === 'design.a11y@.')!;
  const action = readiness.actions.find((a) => a.kind === 'install_browser')!;
  expect(item.reasons.map((r) => r.key)).toContain('setup.reason.probeBrowserMissing');
  expect(item.actions).toContain(action.id);
  return { projectId, actionId: action.id, readiness };
}

describe('«ثبّت متصفح المسبار» (C-11, C-14)', () => {
  it('shows its source and size, installs the pinned build only after a confirmation, and makes the probe checks ready', async () => {
    const engine = await engineWith('ok', '/browser.zip', createHash('sha256').update(files.get('/browser.zip')!).digest('hex'));
    try {
      const { projectId, actionId, readiness } = await installAction(engine, materialize('FX-NOTEST', 'good', join(root, 'p-ok')));
      const action = readiness.actions.find((a) => a.id === actionId)!;
      expect(action.preview).toMatchObject({ command: null, network: { host: '127.0.0.1' }, sizeBytes: files.get('/browser.zip')!.length, writes: [{ location: 'ayar', path: 'browsers/chromium-1248/' }], runsScripts: false });
      expect(action.title).toEqual({ key: 'setup.action.installBrowser', params: { version: '156.0.8078.4' } });
      // Without the preview's digest, nothing runs.
      const wrong = confirmationGrant('setup.execute', actionId, 'f'.repeat(64));
      expect((await engine.invoke('setup.execute', { actionId, confirmationToken: wrong.token }, wrong.grants)).ok).toBe(false);
      const preview = ok<{ digest: string }>(await engine.invoke('setup.preview', { actionId }));
      const g = confirmationGrant('setup.execute', actionId, preview.digest);
      const r = ok<SetupExecuteResult>(await engine.invoke('setup.execute', { actionId, confirmationToken: g.token }, g.grants));
      expect(r.action.state).toBe('done');
      // 9.4 point 4: ready, read again from the installed browser.
      expect(r.readiness.find((i) => i.instance === 'design.a11y@.')?.readiness).toBe('ready');
      const db = new DatabaseSync(join(root, 'ok', 'AYAR', 'ayar.db'), { readOnly: true });
      try {
        expect(db.prepare("SELECT key, version_or_date, path FROM data_assets WHERE kind = 'browser'").all()).toEqual([{ key: 'chromium', version_or_date: '156.0.8078.4', path: join(root, 'ok', 'AYAR', 'browsers', 'chromium-1248', BIN) }]);
        expect(db.prepare("SELECT action FROM audit_log WHERE action LIKE 'browser.%'").all()).toEqual([{ action: 'browser.installed' }]);
      } finally {
        db.close();
      }
      void projectId;
    } finally {
      await engine.close();
    }
  }, 120_000);

  it('rejects a file that does not match its pinned hash: deleted, audited, a security alert, nothing installed', async () => {
    const engine = await engineWith('bad', '/tampered.zip', createHash('sha256').update(files.get('/browser.zip')!).digest('hex'));
    try {
      const { actionId } = await installAction(engine, materialize('FX-NOTEST', 'good', join(root, 'p-bad')));
      const preview = ok<{ digest: string }>(await engine.invoke('setup.preview', { actionId }));
      const g = confirmationGrant('setup.execute', actionId, preview.digest);
      const r = ok<SetupExecuteResult>(await engine.invoke('setup.execute', { actionId, confirmationToken: g.token }, g.grants));
      expect([r.action.state, r.action.resultReasons]).toEqual(['rejected', [{ key: 'setup.rejected.hash_mismatch' }]]);
      expect(engine.events.some((e) => e.topic === 'setup.progress' && (e.payload as { securityAlert: boolean }).securityAlert)).toBe(true);
      const db = new DatabaseSync(join(root, 'bad', 'AYAR', 'ayar.db'), { readOnly: true });
      try {
        expect(db.prepare("SELECT count(*) AS n FROM data_assets WHERE kind = 'browser'").get()).toEqual({ n: 0 });
        const audit = db.prepare("SELECT action, details_json FROM audit_log WHERE action LIKE 'browser.%'").all() as { action: string; details_json: string }[];
        expect(audit.map((a) => [a.action, a.details_json.includes('hash_mismatch')])).toEqual([['browser.installRejected', true]]);
      } finally {
        db.close();
      }
      expect(execFileSync('/bin/ls', [join(root, 'bad', 'AYAR', 'browsers')], { encoding: 'utf8' }).trim()).toBe('');
    } finally {
      await engine.close();
    }
  }, 120_000);
});
