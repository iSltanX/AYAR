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

function run(args, env = {}, ms = 6000, extraFds = false) {
  return new Promise((resolve) => {
    const stdio = ['ignore', 'pipe', 'pipe', ...(extraFds ? ['pipe', 'pipe'] : [])];
    const child = spawn(exe, ['--no-selftest', ...args], { stdio, env: { ...process.env, ...env } });
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
checks.runAsNode = await run(['-e', 'console.log("RUN_AS_NODE_OK")'], { ELECTRON_RUN_AS_NODE: '1' });
checks.runAsNode.actedAsNode = checks.runAsNode.output.includes('RUN_AS_NODE_OK');
checks.nodeOptions = await run([], { NODE_OPTIONS: `--require=${evil}` });
checks.nodeOptions.requireRan = fs.existsSync(marker);
fs.rmSync(evil, { force: true });
fs.rmSync(marker, { force: true });

const result = { label, app: path.basename(appPath), at: new Date().toISOString(), checks };
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(`results/checks-${label}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(0);
