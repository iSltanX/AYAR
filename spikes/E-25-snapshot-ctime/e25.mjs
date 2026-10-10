// E-25: is the four-part key (size, mtime, ctime, inode) a reliable "unchanged" shortcut?
//   node e25.mjs keys  <dir> <label>       write methods that keep size and mtime; does the key change?
//   node e25.mjs bench <dir> <label> <n>   n files: full snapshot vs. shortcut, then mutate and compare
// Results: results/keys-<label>.json, results/bench-<label>.json
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const [cmd, dir, label, nArg] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const st = (f) => {
  const s = fs.statSync(f, { bigint: true });
  return { size: Number(s.size), mtimeNs: s.mtimeNs.toString(), ctimeNs: s.ctimeNs.toString(), ino: s.ino.toString() };
};
const hashFile = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const keyOf = (s) => `${s.size}|${s.mtimeNs}|${s.ctimeNs}|${s.ino}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fsInfo = (d) => {
  try {
    const out = sh('/usr/sbin/diskutil', ['info', sh('/bin/df', [d]).trim().split('\n').pop().split(/\s+/)[0]]);
    const pick = (k) => new RegExp(`${k}:\\s+(.+)`).exec(out)?.[1]?.trim() ?? null;
    return { personality: pick('File System Personality'), location: pick('Device Location'), protocol: pick('Protocol') };
  } catch (e) {
    return { error: String(e.message).split('\n')[0] };
  }
};
const same = (n) => crypto.randomBytes(n).toString('base64').slice(0, n);

// Each method changes content but tries to keep size and mtime (and sometimes inode) identical.
const METHODS = {
  'write+touch-r': (f, ref) => { fs.writeFileSync(f, same(fs.statSync(f).size)); sh('/usr/bin/touch', ['-r', ref, f]); },
  'cp-p': (f, ref) => { const t = `${f}.src`; fs.writeFileSync(t, same(fs.statSync(f).size)); sh('/usr/bin/touch', ['-r', ref, t]); sh('/bin/cp', ['-p', t, f]); fs.rmSync(t); },
  'ditto': (f, ref) => { const t = `${f}.src`; fs.writeFileSync(t, same(fs.statSync(f).size)); sh('/usr/bin/touch', ['-r', ref, t]); sh('/usr/bin/ditto', [t, f]); fs.rmSync(t); },
  'atomic-rename': (f, ref) => { const t = `${f}.tmp`; fs.writeFileSync(t, same(fs.statSync(f).size)); sh('/usr/bin/touch', ['-r', ref, t]); fs.renameSync(t, f); },
  'utimes-api': (f, ref) => { const r = fs.statSync(ref); fs.writeFileSync(f, same(fs.statSync(f).size)); fs.utimesSync(f, r.atime, r.mtime); },
  // In-place write without truncation (same first cluster on FAT-family file systems).
  'inplace-pwrite+touch-r': (f, ref) => { const fd = fs.openSync(f, 'r+'); fs.writeSync(fd, same(64), 0); fs.closeSync(fd); sh('/usr/bin/touch', ['-r', ref, f]); },
  // No content change: these should only cause a (harmless) re-hash.
  'chmod-only': (f) => { fs.chmodSync(f, 0o640); },
  'xattr-only': (f) => { sh('/usr/bin/xattr', ['-w', 'com.ayar.e25', 'x', f]); },
};

async function keys() {
  const work = path.join(dir, `ayar-e25-${process.pid}`);
  fs.mkdirSync(work, { recursive: true });
  const result = { label, dir: dir.replace(os.homedir(), '~'), fs: fsInfo(dir), at: new Date().toISOString(), methods: {} };
  for (const [name, fn] of Object.entries(METHODS)) {
    const f = path.join(work, `${name}.txt`);
    const ref = path.join(work, `${name}.ref`);
    fs.writeFileSync(f, same(4096));
    sh('/usr/bin/touch', ['-r', f, ref]) ; // ref keeps the original timestamps
    await sleep(1100); // make sure a "new" mtime would differ by more than one second
    const before = st(f);
    const h0 = hashFile(f);
    fn(f, ref);
    const after = st(f);
    const h1 = hashFile(f);
    await sleep(1500); // let sync daemons (iCloud) touch the file if they will
    const later = st(f);
    const contentChanged = h0 !== h1;
    const changed = Object.fromEntries(['size', 'mtimeNs', 'ctimeNs', 'ino'].map((k) => [k, before[k] !== after[k]]));
    const keyChanged = keyOf(before) !== keyOf(after);
    result.methods[name] = {
      contentChanged, changed, keyChanged,
      detected: !contentChanged || keyChanged, // a miss = content changed and key identical
      laterChangedBySystem: keyOf(after) !== keyOf(later),
      before, after,
    };
  }
  fs.rmSync(work, { recursive: true, force: true });
  result.allDetected = Object.values(result.methods).every((m) => m.detected);
  save(`keys-${label}`, result);
}

async function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) out.push(p);
    }
  }
  return out.sort();
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}
// full: stat + read + hash every file. fast: stat only; re-hash only when the key differs from prev.
async function snapshot(root, prev) {
  const t0 = performance.now();
  const files = await walk(root);
  const m = new Map();
  let hashed = 0;
  await pool(files, 32, async (f) => {
    const s = await fsp.stat(f, { bigint: true });
    const k = `${s.size}|${s.mtimeNs}|${s.ctimeNs}|${s.ino}`;
    const p = prev?.get(f);
    if (p && p.key === k) { m.set(f, p); return; }
    const h = crypto.createHash('sha256').update(await fsp.readFile(f)).digest('hex');
    hashed++;
    m.set(f, { key: k, hash: h });
  });
  return { m, ms: performance.now() - t0, files: files.length, hashed };
}

async function bench() {
  const n = Number(nArg || 50000);
  const root = path.join(dir, `ayar-e25-bench-${process.pid}`);
  const result = { label, dir: dir.replace(os.homedir(), '~'), fs: fsInfo(dir), at: new Date().toISOString(), n };
  const tg = performance.now();
  let bytes = 0;
  for (let i = 0; i < n; i++) {
    const d = path.join(root, `d${Math.floor(i / 500)}`, `s${Math.floor((i % 500) / 50)}`);
    if (i % 50 === 0) fs.mkdirSync(d, { recursive: true });
    const size = Math.floor(100 * Math.pow(640, Math.random())); // 100 B .. 64 KB, log-uniform
    bytes += size;
    fs.writeFileSync(path.join(d, `f${i}.txt`), crypto.randomBytes(size));
  }
  result.generate = { ms: Math.round(performance.now() - tg), bytes };
  const full1 = await snapshot(root);
  const full2 = await snapshot(root);
  const fast1 = await snapshot(root, full2.m);
  const fast2 = await snapshot(root, full2.m);
  result.timingsMs = {
    fullFirst: Math.round(full1.ms), fullSecond: Math.round(full2.ms),
    shortcutFirst: Math.round(fast1.ms), shortcutSecond: Math.round(fast2.ms),
  };
  result.shortcutHashed = [fast1.hashed, fast2.hashed];
  // Mutate 30 files per method (8 methods: 240 files), then compare what the shortcut and a full re-hash see as changed.
  const files = [...full2.m.keys()];
  const picks = new Set();
  while (picks.size < 30 * Object.keys(METHODS).length) picks.add(files[Math.floor(Math.random() * files.length)]);
  const pickList = [...picks];
  const refDir = path.join(root, '_refs');
  fs.mkdirSync(refDir);
  const methodOf = new Map();
  Object.keys(METHODS).forEach((name, mi) => {
    for (const f of pickList.slice(mi * 30, mi * 30 + 30)) {
      const ref = path.join(refDir, `${path.basename(f)}.ref`);
      sh('/usr/bin/touch', ['-r', f, ref]);
      METHODS[name](f, ref);
      methodOf.set(f, name);
    }
  });
  fs.rmSync(refDir, { recursive: true });
  const fastAfter = await snapshot(root, full2.m);
  const fullAfter = await snapshot(root);
  const changedByContent = files.filter((f) => full2.m.get(f).hash !== fullAfter.m.get(f).hash);
  const missedByShortcut = changedByContent.filter((f) => fastAfter.m.get(f).hash === full2.m.get(f).hash);
  result.mutation = {
    mutatedFiles: pickList.length,
    contentChanged: changedByContent.length,
    shortcutRehashed: fastAfter.hashed,
    missedByShortcut: missedByShortcut.length,
    missedByMethod: Object.fromEntries(Object.keys(METHODS).map((m) => [m, missedByShortcut.filter((f) => methodOf.get(f) === m).length])),
    shortcutMs: Math.round(fastAfter.ms),
    fullMs: Math.round(fullAfter.ms),
  };
  const tr = performance.now();
  fs.rmSync(root, { recursive: true, force: true });
  result.cleanupMs = Math.round(performance.now() - tr);
  save(`bench-${label}`, result);
}

function save(name, obj) {
  fs.mkdirSync(path.join(here, 'results'), { recursive: true });
  fs.writeFileSync(path.join(here, 'results', `${name}.json`), JSON.stringify(obj, null, 2));
  console.log(JSON.stringify(obj, (k, v) => (k === 'before' || k === 'after' ? undefined : v), 2));
}

if (cmd === 'keys') await keys();
else if (cmd === 'bench') await bench();
else { console.error('usage: e25.mjs keys|bench <dir> <label> [n]'); process.exit(2); }
