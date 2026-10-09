// E-25: does iCloud Drive's sync daemon change a file's key on its own after a write?
// node icloud-watch.mjs <seconds>   -> results/icloud-watch.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const secs = Number(process.argv[2] || 60);
const dir = path.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs/ayar-spike-tmp-watch');
fs.mkdirSync(dir, { recursive: true });
const f = path.join(dir, 'watched.txt');
fs.writeFileSync(f, 'ayar e25 '.repeat(500));
const key = () => { const s = fs.statSync(f, { bigint: true }); return `${s.size}|${s.mtimeNs}|${s.ctimeNs}|${s.ino}`; };
const samples = [];
let last = key();
samples.push({ t: 0, key: last });
for (let t = 5; t <= secs; t += 5) {
  await new Promise((r) => setTimeout(r, 5000));
  const k = key();
  if (k !== last) samples.push({ t, key: k, changed: true });
  last = k;
}
let xattrs = [];
try { xattrs = (await import('node:child_process')).execFileSync('/usr/bin/xattr', [f], { encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch {}
fs.rmSync(dir, { recursive: true, force: true });
const result = { seconds: secs, keyChanges: samples.filter((s) => s.changed).length, samples, xattrsAtEnd: xattrs };
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/icloud-watch.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
