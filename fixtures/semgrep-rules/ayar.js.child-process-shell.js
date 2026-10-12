// Test project of ayar.js.child-process-shell.
const cp = require('child_process');
import { exec, execFile, spawn } from 'node:child_process';

export function run(cmd, dir, opts, options) {
  // ruleid: ayar.js.child-process-shell
  cp.exec(`ls ${dir}`);
  // ruleid: ayar.js.child-process-shell
  cp.execSync(cmd);
  // ruleid: ayar.js.child-process-shell
  exec(cmd, () => {});
  // ruleid: ayar.js.child-process-shell
  spawn(cmd, [], { shell: true });
  // ruleid: ayar.js.child-process-shell
  spawn(cmd, [], { shell: opts.shell });
  // ruleid: ayar.js.child-process-shell
  spawn(cmd, [dir], options);
  // ruleid: ayar.js.child-process-shell
  spawn(cmd, [dir], { ...options, stdio: 'pipe' });
  // ruleid: ayar.js.child-process-shell
  cp.spawnSync(cmd, [dir], { shell: '/bin/sh' });
  // ruleid: ayar.js.child-process-shell
  execFile(cmd, [dir], { shell: true });
  // ruleid: ayar.js.child-process-shell
  spawn(cmd, { shell: true });
  // ruleid: ayar.js.child-process-shell
  spawn('ls', [dir], { shell: true });
}

export function safe(dir, text, cmd, args) {
  // ok: ayar.js.child-process-shell
  cp.exec('ls -la');
  // ok: ayar.js.child-process-shell
  spawn('ls', [dir]);
  // ok: ayar.js.child-process-shell
  spawn(dir, ['--version'], { stdio: 'pipe' });
  // ok: ayar.js.child-process-shell
  spawn(cmd, args, { shell: false });
  // ok: ayar.js.child-process-shell
  spawn('ls', ['-la'], { shell: true });
  // ok: ayar.js.child-process-shell
  execFile(cmd, args, { encoding: 'utf8' });
  // ok: ayar.js.child-process-shell
  spawn(cmd, args);
  // ok: ayar.js.child-process-shell
  return /a+/.exec(text);
}
