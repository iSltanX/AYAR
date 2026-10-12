#!/usr/bin/env node
// Compares two AYAR packages for repeatability (plan 25): the same files, the same app.asar (byte for byte, so the
// same bundles), the same Electron files, and every Mach-O the same once its signature is stripped — the signature's
// CMS blob carries its signing time and is expected to differ. The cdhash of each leaf binary is expected to be
// equal too and is reported; a bundle's cdhash (the app, the Electron framework, Squirrel) is reported but not
// required, because its resource seal hashes nested dylibs and helpers as whole files, signature included, so it
// follows the signing time (D-DEV13-08). Exit 0 when repeatable, 1 otherwise.
//   node tools/packaging/compare-packages.mjs --a <.app> --b <.app> [--json <report>] [--note <text>]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const a = opt('a');
const b = opt('b');
const jsonOut = opt('json');
const note = opt('note', '');
if (!a || !b) {
  console.error('usage: compare-packages.mjs --a <.app> --b <.app> [--json <path>] [--note <text>]');
  process.exit(2);
}
const walk = (root, rel = '') =>
  readdirSync(join(root, rel), { withFileTypes: true }).flatMap((d) => {
    const r = join(rel, d.name);
    if (d.isSymbolicLink()) return [];
    return d.isDirectory() ? walk(root, r) : [r];
  });
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const isMachO = (f) => {
  const fd = readFileSync(f).subarray(0, 4).toString('hex');
  return ['cffaedfe', 'feedfacf', 'cafebabe'].includes(fd);
};
// codesign prints its description on stderr, so both streams are read (the first version read stdout alone and saw
// no cdhash at all, which made every signed file "differ" with null on both sides).
const cdhash = (f) => {
  const r = spawnSync('codesign', ['-dvvv', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return /CDHash=([0-9a-f]+)/.exec(`${r.stdout ?? ''}${r.stderr ?? ''}`)?.[1] ?? null;
};
/** Are two Mach-O files the same once their signatures are stripped (on temporary copies)? */
const sameStripped = (fa, fb) => {
  const t = mkdtempSync(join(tmpdir(), 'ayar-compare-'));
  try {
    const ca = join(t, 'a');
    const cb = join(t, 'b');
    copyFileSync(fa, ca);
    copyFileSync(fb, cb);
    for (const c of [ca, cb]) spawnSync('codesign', ['--remove-signature', c], { stdio: 'ignore' });
    return sha(ca) === sha(cb);
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
};
const filesA = walk(a).sort();
const filesB = walk(b).sort();
const onlyA = filesA.filter((f) => !filesB.includes(f));
const onlyB = filesB.filter((f) => !filesA.includes(f));
const common = filesA.filter((f) => filesB.includes(f));
const differing = [];
const signatureOnly = [];
/** Mach-O files whose bytes match once stripped but whose cdhash differs: bundles whose seal covers signed files. */
const sealedOverSignatures = [];
for (const f of common) {
  if (f.includes('_CodeSignature/')) {
    if (sha(join(a, f)) !== sha(join(b, f))) signatureOnly.push(f);
    continue;
  }
  if (sha(join(a, f)) === sha(join(b, f))) continue;
  const pa = join(a, f);
  if (isMachO(pa)) {
    const ca = cdhash(pa);
    const cb = cdhash(join(b, f));
    if (ca && ca === cb) signatureOnly.push(f);
    else if (sameStripped(pa, join(b, f))) sealedOverSignatures.push({ file: f, cdhashA: ca, cdhashB: cb });
    else differing.push({ file: f, cdhashA: ca, cdhashB: cb, sizeA: statSync(pa).size, sizeB: statSync(join(b, f)).size });
  } else differing.push({ file: f, sizeA: statSync(pa).size, sizeB: statSync(join(b, f)).size });
}
const asar = { a: sha(join(a, 'Contents/Resources/app.asar')), b: sha(join(b, 'Contents/Resources/app.asar')) };
const bundle = { a: cdhash(a), b: cdhash(b) };
const ok = !onlyA.length && !onlyB.length && !differing.length && asar.a === asar.b;
const report = { a: resolve(a), b: resolve(b), at: new Date().toISOString(), note, files: { a: filesA.length, b: filesB.length, onlyA, onlyB }, asarSha256: asar, bundleCdhash: bundle, signatureOnlyDifferences: signatureOnly, sealedOverSignatures, differing, ok };
if (jsonOut) {
  mkdirSync(dirname(jsonOut), { recursive: true });
  writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
