#!/usr/bin/env node
// AT-30 on a package, without driving the UI (D-51, D-52, 15.2): the fuses as read from the binary, and the
// debugging and control paths the fuses and the remote-debugging guard close. Each check records what the app did
// and whether the path was open. On the release package every path must be closed; on the control package (the
// same fuses flipped open with derive.mjs) each must be open, so a check that detects nothing shows up (D-51
// «ولكل فحص ضابط إيجابي»).
//
//   node tools/packaging/checks.mjs --app <.app> --label release|control [--json <report path>] [--expect closed|open]
//
// HOME is pointed at a temporary folder so the app's data (~/Library/Application Support/AYAR) never touches the
// owner's; the folder is removed at the end. Only the inspector, remote debugging, RUN_AS_NODE and NODE_OPTIONS
// paths are exercised: nothing in the app's data is read or kept.
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const appPath = opt('app');
const label = opt('label', 'release');
const jsonOut = opt('json');
const expect = opt('expect', label === 'control' ? 'open' : 'closed');
if (!appPath) {
  console.error('usage: checks.mjs --app <.app> --label <name> [--json <path>] [--expect closed|open]');
  process.exit(2);
}
const exe = join(appPath, 'Contents/MacOS', basename(appPath, '.app'));
const home = mkdtempSync(join(tmpdir(), 'ayar-DEV-13-at30-home-'));
mkdirSync(join(home, 'Library', 'Application Support'), { recursive: true });
const baseEnv = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, TMPDIR: home };

function run(args, env = {}, ms = 8000, signalAfterMs = null, signal = 'SIGUSR1') {
  return new Promise((done) => {
    const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...baseEnv, ...env } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const sig = signalAfterMs ? setTimeout(() => child.kill(signal), signalAfterMs) : null;
    const timer = setTimeout(() => child.kill('SIGKILL'), ms);
    child.on('exit', (code, sgn) => {
      clearTimeout(timer);
      if (sig) clearTimeout(sig);
      done({ code, signal: sgn, killedByUs: sgn === 'SIGKILL', output: out.trim().split('\n').filter(Boolean).slice(0, 6) });
    });
  });
}
const listening = (r) => r.output.some((l) => l.includes('Debugger listening'));
const devtools = (r) => r.output.some((l) => l.includes('DevTools listening'));

const wire = await getCurrentFuseWire(appPath);
const fuses = Object.fromEntries(
  Object.entries(wire)
    .filter(([k]) => k !== 'version')
    .map(([k, v]) => [FuseV1Options[k], FuseState[v]]),
);
// 15.2: the six fuses, cookie encryption off (D-53).
const fusesExpected = { RunAsNode: 'DISABLE', EnableNodeOptionsEnvironmentVariable: 'DISABLE', EnableNodeCliInspectArguments: 'DISABLE', GrantFileProtocolExtraPrivileges: 'DISABLE', EnableEmbeddedAsarIntegrityValidation: 'ENABLE', OnlyLoadAppFromAsar: 'ENABLE', EnableCookieEncryption: 'DISABLE' };
const fusesMatch152 = Object.entries(fusesExpected).every(([k, v]) => fuses[k] === v);

const checks = {};
// --inspect: the fuse drops the argument; with it open, Node's inspector listens.
const inspect = await run(['--inspect=0']);
checks.inspect = { ...inspect, open: listening(inspect) };
// SIGUSR1 opens Node's inspector in a plain Node process; the fuse keeps it closed.
const sigusr1 = await run([], {}, 8000, 3000, 'SIGUSR1');
checks.sigusr1 = { ...sigusr1, open: listening(sigusr1) };
// D-52: Chromium's remote debugging switches end the app with exit 78 before any port opens, unless Node's
// inspector is active (the derived test package under Playwright). On the control package the inspect fuse is open
// but no --inspect is passed, so the guard still applies: these three are expected to exit 78 on every package.
for (const [name, args] of [
  ['remoteDebuggingPort', ['--remote-debugging-port=0']],
  ['remoteDebuggingPipe', ['--remote-debugging-pipe']],
  ['remoteDebuggingAddress', ['--remote-debugging-address=127.0.0.1']],
]) {
  const r = await run(args);
  checks[name] = { ...r, open: devtools(r) || r.code !== 78, guardExit78: r.code === 78 };
}
// ELECTRON_RUN_AS_NODE: with the fuse off the app starts as the app (the -e script never runs).
const asNode = await run(['-e', 'console.log("RUN_AS_NODE_OK")'], { ELECTRON_RUN_AS_NODE: '1' });
checks.runAsNode = { ...asNode, open: asNode.output.includes('RUN_AS_NODE_OK') };
// NODE_OPTIONS: with the fuse off the variable is ignored entirely. With it on, Electron reads it and refuses the
// options it does not support in a packaged app with a warning on stderr — that warning is the visible trace
// (the spike's --max-http-header-size probe needed a hook the real app does not have, D-51).
const evil = join(home, 'evil.cjs');
const marker = join(home, 'marker');
writeFileSync(evil, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
const nodeOptions = await run([], { NODE_OPTIONS: `--require=${evil}` });
const readNodeOptions = nodeOptions.output.some((l) => /NODE_OPTION/i.test(l));
let requireRan = false;
try {
  requireRan = (await import('node:fs')).existsSync(marker);
} catch {
  requireRan = false;
}
checks.nodeOptions = { ...nodeOptions, readByElectron: readNodeOptions, requireRan, open: readNodeOptions || requireRan };

const openPaths = Object.entries(checks)
  .filter(([, c]) => c.open)
  .map(([k]) => k);
// The guard's three switches are closed on every package (D-52); the others follow the fuses.
const fuseGated = ['inspect', 'sigusr1', 'runAsNode', 'nodeOptions'];
const guardOk = ['remoteDebuggingPort', 'remoteDebuggingPipe', 'remoteDebuggingAddress'].every((k) => checks[k].guardExit78 && !devtools(checks[k]));
const expectedOpen = expect === 'open';
const fuseGatedOk = fuseGated.every((k) => checks[k].open === expectedOpen);
const ok = guardOk && fuseGatedOk && (expect === 'open' || fusesMatch152);

rmSync(home, { recursive: true, force: true });
const result = { label, app: resolve(appPath), at: new Date().toISOString(), expect, fuses, fusesMatch152, checks, openPaths, guardOk, fuseGatedOk, ok };
if (jsonOut) {
  mkdirSync(dirname(jsonOut), { recursive: true });
  writeFileSync(jsonOut, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify(result, null, 2));
process.exit(ok ? 0 : 1);
