// Test project of ayar.js.child-process-shell.
const cp = require('child_process');
import { exec, spawn } from 'node:child_process';

export function run(cmd, dir) {
  // ruleid: ayar.js.child-process-shell
  cp.exec(`ls ${dir}`);
  // ruleid: ayar.js.child-process-shell
  cp.execSync(cmd);
  // ruleid: ayar.js.child-process-shell
  exec(cmd, () => {});
  // ruleid: ayar.js.child-process-shell
  spawn(cmd, [], { shell: true });
}

export function safe(dir, text) {
  // ok: ayar.js.child-process-shell
  cp.exec('ls -la');
  // ok: ayar.js.child-process-shell
  spawn('ls', [dir]);
  // ok: ayar.js.child-process-shell
  return /a+/.exec(text);
}
