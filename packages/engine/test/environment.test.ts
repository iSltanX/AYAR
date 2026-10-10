// C-07 (D-06, D-47, FR-14, FR-15, E-06, E-07, G-35, G-49): the login shell read between nonce markers from a
// minimal base environment, the fallback, version managers' folders read without running them, tool
// resolution with the matching nvm version proposed explicitly, corepack shims, the version probes (5 s, no
// network), and the child environment contract. Fake shells and tools are small scripts in a temp folder.
import { loadCatalog } from '@ayar/catalog';
import type { Fact } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeChildEnv } from '../src/environment/child-env.ts';
import { loginShellScript, parseLoginShellOutput, readLoginShell } from '../src/environment/login-shell.ts';
import { installedVersions, nvmDefault } from '../src/environment/managers.ts';
import { fallbackPath, probeVersions, resolveTools, versionFromPath } from '../src/environment/resolve.ts';
import { best, satisfies } from '../src/environment/semver.ts';
import { EnvironmentService } from '../src/environment/service.ts';
import { nodePorts } from '../src/node/ports.ts';
import { nodeFileSystem } from '../src/node/fs.ts';
import { nodeProcessControl } from '../src/node/processes.ts';
import { nameRules } from '../src/redaction/names.ts';
import { RedactionService } from '../src/redaction/service.ts';
import { tempRoot } from './support/tmp.ts';

const { catalog } = loadCatalog(undefined, { now: new Date('2026-10-10T00:00:00Z') });
let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempRoot('ayar-DEV-4-env-')));
afterEach(() => cleanup());

function script(rel: string, body: string): string {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

/** A login shell stand-in: `<shell> -ilc <command>` exports some variables, prints noise, then runs the command. */
function fakeShell(exports: Record<string, string>, extra = ''): string {
  const lines = Object.entries(exports).map(([k, v]) => `export ${k}='${v}'`);
  return script('bin/fake-login-shell', [...lines, 'echo "welcome banner from .zprofile"', extra, 'exec /bin/sh -c "$2"'].join('\n'));
}

const fact = (key: string, value: unknown, component = '.'): Fact => ({ key, component, value: value as Fact['value'], source: null, proof: 'declared', detector: 't@1' });

describe('version requirements', () => {
  it('understands .nvmrc, engines, requires-python and .tool-versions forms', () => {
    expect(satisfies('24.16.0', '24')).toBe(true);
    expect(satisfies('24.18.1', '24.16.0')).toBe(false);
    expect(satisfies('24.16.0', 'v24.16.0')).toBe(true);
    expect(satisfies('24.16.0', '>=24.12.0')).toBe(true);
    expect(satisfies('24.16.0', '>= 24.12')).toBe(true);
    expect(satisfies('22.1.0', '^24 || ^22')).toBe(true);
    expect(satisfies('20.20.2', '^24 || ^22')).toBe(false);
    expect(satisfies('3.12.13', '>=3.12,<4')).toBe(true);
    expect(satisfies('3.12.13', '3.12')).toBe(true);
    expect(satisfies('3.13.0', '~=3.12')).toBe(true);
    expect(satisfies('24.16.0', 'lts/*')).toBeNull();
    expect(best(['20.20.2', '24.14.0', '24.16.0'], '24')).toBe('24.16.0');
    expect(best(['20.20.2'], '24')).toBeNull();
  });
});

describe('the login shell (C-07 point 1, E-06)', () => {
  it('reads the environment between nonce markers, from a minimal base environment', async () => {
    const shell = fakeShell({ MY_API_TOKEN: 'tok-1234567890', PATH: '/opt/x/bin:/usr/bin:/bin', CALLER_LEAK_CHECK: 'set-by-profile' });
    const r = await readLoginShell({ processes: nodeProcessControl, shell, timeoutMs: 5000, base: { HOME: root, USER: 'u', LOGNAME: 'u', TMPDIR: root, LANG: 'ar_SA.UTF-8' }, nonce: 'n1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.env).toMatchObject({ MY_API_TOKEN: 'tok-1234567890', PATH: '/opt/x/bin:/usr/bin:/bin', HOME: root, LANG: 'ar_SA.UTF-8', AYAR_RESOLVING_ENVIRONMENT: '1' });
    // Nothing of the engine's own environment leaked in: only the base and what the profile exported.
    expect(Object.keys(r.env).filter((k) => !['MY_API_TOKEN', 'PATH', 'CALLER_LEAK_CHECK', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'AYAR_RESOLVING_ENVIRONMENT', 'PWD', 'SHLVL', '_', 'OLDPWD'].includes(k))).toEqual([]);
  });

  it('ignores output that imitates the markers without the nonce', () => {
    const fake = `\0__AYAR_ENV_BEGIN___\0EVIL=1\0\0__AYAR_ENV_END___\0`;
    const real = `\0__AYAR_ENV_BEGIN_abc__\0A=1\0B=x=y\0\0__AYAR_ENV_END_abc__\0node: function\0\0__AYAR_FN_END_abc__\0`;
    expect(parseLoginShellOutput(fake + real, 'abc')).toEqual({ env: { A: '1', B: 'x=y' }, functions: ['node'] });
    expect(parseLoginShellOutput(fake, 'abc')).toBeNull();
    expect(loginShellScript('/bin/zsh', 'n')).toContain('whence -w');
    expect(loginShellScript('/bin/bash', 'n')).toContain('type -t');
  });

  it('times out, kills the whole group, and the service falls back to a marked PATH (C-07 point 2)', async () => {
    const shell = script('bin/slow-shell', 'exec /bin/sleep 31.4159');
    const r = await readLoginShell({ processes: nodeProcessControl, shell, timeoutMs: 300, base: { HOME: root, USER: 'u', LOGNAME: 'u', TMPDIR: root, LANG: null }, nonce: 'n2' });
    expect(r).toMatchObject({ ok: false, reason: 'timeout' });
    await new Promise((res) => setTimeout(res, 700));
    expect(execFileSync('/bin/ps', ['-axo', 'args=']).toString().split('\n').filter((l) => l.startsWith('/bin/sleep 31.4159'))).toEqual([]);
    const svc = new EnvironmentService({ ports: nodePorts, redaction: new RedactionService(catalog), logger: { log: () => {}, flush: () => {} }, catalog, settings: () => ({ shell, timeoutSeconds: 1 }), processEnv: { HOME: root, USER: 'u' } });
    const env = await svc.resolve({ projectRoot: root, facts: [] });
    expect(env).toMatchObject({ source: 'fallback', fallbackReason: 'timeout' });
    expect(env.path.slice(-4)).toEqual(['/usr/bin', '/bin', '/usr/sbin', '/sbin']);
  });

  it('keeps only fallback folders that exist', async () => {
    mkdirSync(join(root, '.cargo/bin'), { recursive: true });
    const path = await fallbackPath(nodeFileSystem, root);
    expect(path).toContain(join(root, '.cargo/bin'));
    expect(path).not.toContain(join(root, '.bun/bin'));
  });
});

describe('the environment service and the child environment (D-47, AT-48, G-35)', () => {
  it('lists the sensitive variables as withheld, passes the exceptions, removes internals, and registers values with C-18', async () => {
    const shell = fakeShell({ MY_API_TOKEN: 'mytoken-value-123456', NPM_TOKEN: 'npmtoken-value-123456', SSH_AUTH_SOCK: '/tmp/agent.sock', TERM_SESSION_ID: 'w0t0p0', ELECTRON_RUN_AS_NODE: '1' });
    const redaction = new RedactionService(catalog);
    const svc = new EnvironmentService({ ports: nodePorts, redaction, logger: { log: () => {}, flush: () => {} }, catalog, settings: () => ({ shell, timeoutSeconds: 5 }), processEnv: { HOME: root, USER: 'u' } });
    const env = await svc.resolve({ projectRoot: root, facts: [] });
    expect(env.source).toBe('login_shell');
    expect(env.withheld).toEqual(['MY_API_TOKEN', 'NPM_TOKEN']);
    expect(env.exceptions).toEqual([
      { name: 'SSH_AUTH_SOCK', reason: 'catalog.redaction.exception.SSH_AUTH_SOCK' },
      { name: 'TERM_SESSION_ID', reason: 'catalog.redaction.exception.TERM_SESSION_ID' },
    ]);
    expect(env.removedInternal).toEqual(['AYAR_RESOLVING_ENVIRONMENT', 'ELECTRON_RUN_AS_NODE']);
    expect(JSON.stringify(env)).not.toContain('mytoken-value');
    // C-18 layer 1: both values are redacted wherever they appear, passed or not.
    expect(redaction.redactor().redactText('a mytoken-value-123456 b npmtoken-value-123456').text).toBe('a ⟦redacted:env:MY_API_TOKEN⟧ b ⟦redacted:env:NPM_TOKEN⟧');
    const withheld = await svc.childSummary('beh.unit@.', { allowSensitive: [], explicit: {} });
    expect(withheld).toMatchObject({ withheld: ['MY_API_TOKEN', 'NPM_TOKEN'], allowedSensitive: [] });
    expect(withheld.passed).toEqual(expect.arrayContaining(['SSH_AUTH_SOCK', 'TERM_SESSION_ID', 'NO_COLOR', 'FORCE_COLOR', 'AYAR']));
    expect(withheld.passed).not.toContain('CI');
    const allowed = await svc.childSummary('beh.unit@.', { allowSensitive: ['MY_API_TOKEN'], explicit: { FX_MODE: 'ci-like' } });
    expect(allowed).toMatchObject({ withheld: ['NPM_TOKEN'], allowedSensitive: ['MY_API_TOKEN'] });
    expect(allowed.passed).toEqual(expect.arrayContaining(['MY_API_TOKEN', 'FX_MODE']));
  });

  it('computes the exact child environment', () => {
    const c = computeChildEnv({
      login: { PATH: '/bin', LANG: 'ar_SA.UTF-8', MY_API_TOKEN: 'x', GH_TOKEN: 'y', AYAR_CHECK_TOKEN: 'z', SSH_AUTH_SOCK: '/s' },
      rules: nameRules(catalog.redaction),
      allowSensitive: ['GH_TOKEN'],
      explicit: { MODE: 'a' },
      tmpDir: '/tmp/check-1',
      adapter: { VITEST_X: '1' },
    });
    expect(c.env).toEqual({ PATH: '/bin', LANG: 'ar_SA.UTF-8', GH_TOKEN: 'y', SSH_AUTH_SOCK: '/s', MODE: 'a', NO_COLOR: '1', FORCE_COLOR: '0', AYAR: '1', TMPDIR: '/tmp/check-1', VITEST_X: '1' });
    expect(c).toMatchObject({ withheld: ['MY_API_TOKEN'], allowedSensitive: ['GH_TOKEN'], removedInternal: ['AYAR_CHECK_TOKEN'] });
  });
});

describe('toolchains (C-07 point 3, E-07, G-49, G-DEV2-01)', () => {
  function stub(rel: string, out: string): string {
    return script(rel, `echo "${out}"`);
  }

  it('reads version managers’ folders without running them, and resolves nvm’s default alias', async () => {
    const nvm16 = stub('.nvm/versions/node/v24.16.0/bin/node', 'v24.16.0');
    stub('.nvm/versions/node/v20.20.2/bin/node', 'v20.20.2');
    stub('.local/share/fnm/node-versions/v22.1.0/installation/bin/node', 'v22.1.0');
    stub('.pyenv/versions/3.12.13/bin/python3', 'Python 3.12.13');
    stub('.local/share/uv/python/cpython-3.13.1-macos-aarch64-none/bin/python3', 'Python 3.13.1');
    mkdirSync(join(root, '.nvm/alias'), { recursive: true });
    writeFileSync(join(root, '.nvm/alias/default'), '24\n');
    const installed = await installedVersions(nodeFileSystem, root);
    expect(installed.map((i) => `${i.tool}:${i.manager}:${i.version}`)).toEqual(['node:nvm:24.16.0', 'node:fnm:22.1.0', 'node:nvm:20.20.2', 'python:uv:3.13.1', 'python:pyenv:3.12.13']);
    expect(await nvmDefault(nodeFileSystem, root, installed)).toBe('24.16.0');
    expect(installed[0]!.path).toBe(nvm16);
  });

  it('proposes the matching nvm version when PATH has another, and shows the terminal’s version (G-49)', async () => {
    const brew = stub('Cellar/node/24.18.1/bin/node', 'v24.18.1');
    mkdirSync(join(root, 'path-bin'), { recursive: true });
    symlinkSync(brew, join(root, 'path-bin/node'));
    stub('.nvm/versions/node/v24.16.0/bin/node', 'v24.16.0');
    const installed = await installedVersions(nodeFileSystem, root);
    const tools = await resolveTools({
      fs: nodeFileSystem,
      path: [join(root, 'path-bin')],
      projectRoot: root,
      facts: [fact('node.package', { name: 'x' }), fact('runtime.node', { spec: '24.16.0', from: 'nvmrc' })],
      installed,
      shellFunctions: ['node', 'npm'],
      nvmDefault: '24.16.0',
    });
    const node = tools.find((t) => t.tool === 'node')!;
    expect(node).toMatchObject({ version: '24.18.1', versionSource: 'path', required: { spec: '24.16.0', from: 'nvmrc' }, satisfies: false, status: 'mismatch', shellFunction: true, terminalVersion: '24.16.0' });
    expect(node.proposedPath).toBe(join(root, '.nvm/versions/node/v24.16.0/bin/node'));
    expect(tools.find((t) => t.tool === 'npm')).toMatchObject({ status: 'missing' });
  });

  it('marks pnpm as a corepack shim when the declared version would be downloaded (G-DEV2-01)', async () => {
    const corepackPnpm = script('nvm/lib/node_modules/corepack/dist/pnpm.js', 'echo "shim"');
    mkdirSync(join(root, 'bin2'), { recursive: true });
    symlinkSync(corepackPnpm, join(root, 'bin2/pnpm'));
    const tools = await resolveTools({ fs: nodeFileSystem, path: [join(root, 'bin2')], projectRoot: root, facts: [fact('node.package', {}), fact('node.packageManager', { name: 'pnpm', version: '9.15.4', spec: 'pnpm@9.15.4' })], installed: [], shellFunctions: [], nvmDefault: null });
    expect(tools.find((t) => t.tool === 'pnpm')).toMatchObject({ viaCorepack: true, required: { spec: '9.15.4', from: 'packageManager' }, status: 'mismatch' });
  });

  it('reads a project venv’s Python version from pyvenv.cfg without running it', async () => {
    stub('.venv/bin/python3', 'Python 3.12.13');
    writeFileSync(join(root, '.venv/pyvenv.cfg'), 'home = /opt/homebrew/bin\nversion = 3.12.13\n');
    const tools = await resolveTools({ fs: nodeFileSystem, path: [], projectRoot: root, facts: [fact('python.project', {}), fact('runtime.python', { spec: '3.12', from: 'python-version' })], installed: [], shellFunctions: [], nvmDefault: null });
    expect(tools.find((t) => t.tool === 'python3')).toMatchObject({ path: join(root, '.venv/bin/python3'), version: '3.12.13', versionSource: 'venv', satisfies: true, status: 'ok' });
  });

  it('probes versions at readiness: 5 s, no network for corepack, a timeout is «تعذّر فحص الإصدار»', async () => {
    // The tool answers only when the probe switched off corepack's network and mise's auto-install.
    const ok = script('p/node', 'if [ "$COREPACK_ENABLE_NETWORK" = "0" ] && [ "$MISE_AUTO_INSTALL" = "0" ]; then echo "v24.16.0"; else exit 3; fi');
    const hang = script('p/hang', 'exec /bin/sleep 27.1828');
    const base = { tool: 'x', realPath: null, viaCorepack: false, shellFunction: false, version: null, versionSource: null, required: null, satisfies: null, installed: [], proposedPath: null, terminalVersion: null, status: 'unknown' as const, probe: null };
    const started = Date.now();
    const out = await probeVersions(nodeProcessControl, [{ ...base, tool: 'node', path: ok, required: { spec: '24', from: 'nvmrc' } }, { ...base, tool: 'hang', path: hang }], { cwd: root, env: { PATH: '/usr/bin:/bin' } });
    expect(Date.now() - started).toBeLessThan(9000);
    expect(out[0]).toMatchObject({ version: '24.16.0', versionSource: 'probe', satisfies: true, status: 'ok', probe: { ok: true } });
    expect(out[1]).toMatchObject({ status: 'unknown', probe: { ok: false, error: 'timeout' } });
    expect(execFileSync('/bin/ps', ['-axo', 'args=']).toString().split('\n').filter((l) => l.startsWith('/bin/sleep 27.1828'))).toEqual([]);
  }, 15_000);

  it('reads versions from where programs live', () => {
    expect(versionFromPath('/opt/homebrew/Cellar/node/24.18.1/bin/node')).toBe('24.18.1');
    expect(versionFromPath('/Users/u/.nvm/versions/node/v24.16.0/bin/node')).toBe('24.16.0');
    expect(versionFromPath('/opt/homebrew/Cellar/python@3.12/3.12.13/Frameworks/x')).toBe('3.12.13');
    expect(versionFromPath('/usr/bin/node')).toBeNull();
  });
});
