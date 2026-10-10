// D-19: tools/cli boots the engine as a plain Node process, over the same protocol, invokes a command and
// receives an event. Also: the engine process's exit paths, seen from outside.
import { execFile } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { latestVersion } from '@ayar/engine';
import { PROTOCOL_VERSION, settingDefaults } from '@ayar/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectEngine, spawnEngine } from '../src/index.ts';

const run = promisify(execFile);
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-cli-')));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('tools/cli (D-19)', () => {
  it('boots the engine, invokes a command, and receives an event', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    expect(engine.welcome).toMatchObject({ protocol: PROTOCOL_VERSION, engine: { version: '0.1.0', pid: engine.process.child.pid } });
    const health = await engine.waitForEvent('engine.health');
    expect(health).toMatchObject({ seq: 1, stream: engine.welcome.engine.stream, payload: { state: 'ready', hmacKeySource: 'test', schemaVersion: latestVersion() } });
    expect(await engine.invoke('settings.set', { key: 'ui.theme', value: 'dark' })).toEqual({ ok: true, result: { key: 'ui.theme', value: 'dark' } });
    expect(await engine.invoke('settings.get', {})).toEqual({ ok: true, result: { values: { ...settingDefaults(), 'ui.theme': 'dark' } } });
    expect(await engine.close()).toBe(0);
  });

  it('keeps data between engine sessions', async () => {
    const a = await connectEngine({ dataDir: join(root, 'AYAR') });
    await a.waitForEvent('engine.health');
    await a.invoke('settings.set', { key: 'ui.language', value: 'ar' });
    await a.close();
    const b = await connectEngine({ dataDir: join(root, 'AYAR') });
    await b.waitForEvent('engine.health');
    expect(await b.invoke('settings.get', { keys: ['ui.language'] })).toEqual({ ok: true, result: { values: { 'ui.language': 'ar' } } });
    expect(b.welcome.engine.stream).not.toBe(a.welcome.engine.stream);
    await b.close();
  });

  it('runs as a command line tool', async () => {
    const dir = join(root, 'AYAR');
    const boot = await run(process.execPath, [MAIN, '--data-dir', dir, 'boot']);
    expect(JSON.parse(boot.stdout)).toMatchObject({ health: { state: 'ready', hmacKeySource: 'test' } });
    const set = await run(process.execPath, [MAIN, '--data-dir', dir, 'invoke', 'settings.set', '{"key":"ui.language","value":"en"}']);
    expect(JSON.parse(set.stdout)).toEqual({ ok: true, result: { key: 'ui.language', value: 'en' } });
    expect(JSON.parse((await run(process.execPath, [MAIN, '--data-dir', dir, 'invoke', 'project.list'])).stdout)).toEqual({ ok: true, result: { projects: [] } });
    // A command a later phase implements still answers not_implemented, and the tool exits 1.
    await expect(run(process.execPath, [MAIN, '--data-dir', dir, 'invoke', 'tools.list'])).rejects.toMatchObject({ code: 1 });
    await expect(run(process.execPath, [MAIN, '--data-dir', dir, 'invoke', 'shell.exec'])).rejects.toMatchObject({ code: 2 });
  });

  it("refuses the app's own data folder by default (test key, G-47)", async () => {
    const appData = join(process.env.HOME!, 'Library', 'Application Support', 'AYAR');
    await expect(run(process.execPath, [MAIN, '--data-dir', appData, 'boot'])).rejects.toMatchObject({ code: 2 });
  });

  it('a killed engine fails pending requests instead of hanging', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR') });
    await engine.waitForEvent('engine.health');
    const pending = engine.invoke('settings.get', {});
    engine.process.child.kill('SIGKILL');
    const r = await pending;
    // Either the answer won the race, or the request failed cleanly: never a hang.
    expect(r.ok || r.error.code === 'engine_unavailable').toBe(true);
    expect(await engine.process.exited).toBe('SIGKILL');
    expect(await engine.invoke('settings.get', {})).toMatchObject({ ok: false, error: { code: 'engine_unavailable' } });
  });

  it('an unhandled exception ends the engine with code 70 (C-04)', async () => {
    const engine = await connectEngine({ dataDir: join(root, 'AYAR'), env: { AYAR_ENGINE_TEST_CRASH: 'after-boot' } });
    expect(await engine.process.exited).toBe(70);
    expect(engine.process.stderr()).toContain('AYAR engine crash: Error: test crash');
  });

  it('a host with another major version is refused and the engine exits with 76 (D-29)', async () => {
    const proc = spawnEngine();
    const messages: unknown[] = [];
    proc.transport.onMessage((m) => messages.push(m));
    proc.transport.send({ kind: 'hello', protocol: { major: PROTOCOL_VERSION.major + 1, minor: 0 }, peer: 'cli', config: { dataDir: join(root, 'AYAR'), hmacKeySource: 'test', appVersion: '9.0.0' } });
    expect(await proc.exited).toBe(76);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: 'refuse', protocol: PROTOCOL_VERSION, error: { code: 'protocol_mismatch' } });
  });
});
