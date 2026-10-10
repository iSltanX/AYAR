// G-05: inspection/debugging checks that run on a package directly, without driving the UI.
// Usage: node release-checks.mjs "<.app>" <label>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [appPath, label] = process.argv.slice(2);
const exe = path.join(appPath, 'Contents/MacOS', path.basename(appPath, '.app'));
const marker = path.join(os.tmpdir(), `g05-node-options-marker-${process.pid}`);
const evil = path.join(os.tmpdir(), `g05-node-options-${process.pid}.cjs`);
fs.writeFileSync(evil, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);

function run(args, env = {}, ms = 6000, extraFds = false, selftestFlag = true) {
  return new Promise((resolve) => {
    const stdio = ['ignore', 'pipe', 'pipe', ...(extraFds ? ['pipe', 'pipe'] : [])];
    const child = spawn(exe, selftestFlag ? ['--no-selftest', ...args] : args, { stdio, env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), ms);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, killedAfterMs: signal === 'SIGKILL' ? ms : null, output: out.trim().split('\n').filter(Boolean).slice(0, 4) });
    });
  });
}

const checks = {};
checks.inspect = await run(['--inspect=0']);
checks.inspect.nodeInspectorOpened = checks.inspect.output.some((l) => l.includes('Debugger listening'));
checks.remoteDebuggingPort = await run(['--remote-debugging-port=0']);
checks.remoteDebuggingPort.devtoolsOpened = checks.remoteDebuggingPort.output.some((l) => l.includes('DevTools listening'));
checks.remoteDebuggingPipe = await run(['--remote-debugging-pipe'], {}, 6000, true);
checks.remoteDebuggingAddress = await run(['--remote-debugging-address=127.0.0.1']);
// SIGUSR1 would start the Node inspector in a plain Node process.
checks.sigusr1 = await new Promise((resolve) => {
  const child = spawn(exe, ['--no-selftest'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stderr.on('data', (d) => { out += d; });
  setTimeout(() => child.kill('SIGUSR1'), 2500);
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  child.on('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal, inspectorOpened: out.includes('Debugger listening') }); });
});
// No --no-selftest here: as Node, an unknown option would fail before -e runs ("bad option").
checks.runAsNode = await run(['-e', 'console.log("RUN_AS_NODE_OK")'], { ELECTRON_RUN_AS_NODE: '1' }, 6000, false, false);
checks.runAsNode.actedAsNode = checks.runAsNode.output.includes('RUN_AS_NODE_OK');
checks.nodeOptions = await run([], { NODE_OPTIONS: `--require=${evil}` });
checks.nodeOptions.requireRan = fs.existsSync(marker); // Electron refuses --require in packaged apps anyway
// Discriminating check: --max-http-header-size is honored iff the fuse lets NODE_OPTIONS through.
checks.nodeOptionsHttp = await run([], { NODE_OPTIONS: '--max-http-header-size=12345', AYAR_SPIKE_REPORT_NODE_OPTIONS: '1' });
checks.nodeOptionsHttp.maxHeaderSize = Number(/AYAR_HTTP_MAX_HEADER=(\d+)/.exec(checks.nodeOptionsHttp.output.join('\n'))?.[1] ?? NaN);
checks.nodeOptionsHttp.honored = checks.nodeOptionsHttp.maxHeaderSize === 12345;
fs.rmSync(evil, { force: true });
fs.rmSync(marker, { force: true });

const result = { label, app: path.basename(appPath), at: new Date().toISOString(), checks };
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(`results/checks-${label}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(0);
