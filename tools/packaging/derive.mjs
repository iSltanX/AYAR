#!/usr/bin/env node
// D-51 (G-05): derive an ephemeral test package from the release package. A `ditto` copy, exactly the named fuses
// flipped on (by default EnableNodeCliInspectArguments alone, so Playwright can drive it), re-signed with the same
// identity keeping identifier, entitlements, requirements, flags and runtime; then the proof that, once the code
// signatures are stripped, the only bytes that differ are the fuse bytes (one byte per flipped fuse, in the
// framework's fuse wire). Any other difference is a failure: the derived package is removed and the exit code is 1,
// so a test runner never starts on it.
//
//   node tools/packaging/derive.mjs --app <release .app> --out <folder> [--identity "AYAR Local Code Signing"]
//                                 [--fuses EnableNodeCliInspectArguments[,RunAsNode,...]] [--json <report path>]
//
// The derived package carries the app's identity and permissions (E-04), so it is temporary: the caller deletes it
// after the run (AGENTS.md 10). Run from the repository root (it imports @electron/fuses from node_modules).
import { FuseState, FuseV1Options, flipFuses, getCurrentFuseWire } from '@electron/fuses';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const releaseApp = opt('app');
const outDir = opt('out');
const identity = opt('identity', 'AYAR Local Code Signing');
const fuseNames = opt('fuses', 'EnableNodeCliInspectArguments').split(',').filter(Boolean);
const jsonOut = opt('json');
if (!releaseApp || !outDir) {
  console.error('usage: derive.mjs --app <release .app> --out <folder> [--identity <name>] [--fuses A,B] [--json <path>]');
  process.exit(2);
}
for (const n of fuseNames) if (!(n in FuseV1Options)) throw new Error(`unknown fuse: ${n}`);
if (resolve(outDir) === resolve(dirname(releaseApp))) throw new Error('the out folder must not be the release package folder');

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const testApp = join(outDir, basename(releaseApp));
rmSync(testApp, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
sh('ditto', [releaseApp, testApp]);
await flipFuses(testApp, { version: '1', ...Object.fromEntries(fuseNames.map((n) => [FuseV1Options[n], true])) });

// Re-sign inner to outer, keeping identifier, entitlements, requirements, flags and runtime (D-51).
const keep = '--preserve-metadata=identifier,entitlements,requirements,flags,runtime';
sh('codesign', ['--force', '--sign', identity, keep, join(testApp, 'Contents/Frameworks/Electron Framework.framework')]);
sh('codesign', ['--force', '--sign', identity, keep, testApp]);
sh('codesign', ['--verify', '--deep', '--strict', testApp]);
const requirement = (app) => sh('codesign', ['-d', '-r-', app]).split('\n').find((l) => l.startsWith('designated =>')) ?? '';

// Both trees walked, so a file or a link that is in one package only is seen (DEV-13 review R1-09); links compared by
// their targets; every file compared; the differing Mach-O files compared again with their signatures stripped.
const walk = (root, rel = '') =>
  readdirSync(join(root, rel), { withFileTypes: true }).flatMap((d) => {
    const r = join(rel, d.name);
    if (d.isSymbolicLink()) return [[r, readlinkSync(join(root, r))]];
    return d.isDirectory() ? walk(root, r) : [[r, null]];
  });
const releaseEntries = new Map(walk(releaseApp));
const derivedEntries = new Map(walk(testApp));
const onlyRelease = [...releaseEntries.keys()].filter((k) => !derivedEntries.has(k));
const onlyDerived = [...derivedEntries.keys()].filter((k) => !releaseEntries.has(k));
const linkDifferences = [...releaseEntries].filter(([k, target]) => derivedEntries.has(k) && derivedEntries.get(k) !== target).map(([k]) => k);
const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const files = [...releaseEntries].filter(([k, target]) => target === null && derivedEntries.get(k) === null).map(([k]) => k);
const differing = files.filter((f) => hash(join(releaseApp, f)) !== hash(join(testApp, f)));
const tmp = mkdtempSync(join(outDir, 'strip-'));
const stripped = {};
let otherBytes = 0;
const FRAMEWORK = 'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework';
for (const f of differing.filter((f) => !f.includes('_CodeSignature'))) {
  const a = join(tmp, 'a');
  const b = join(tmp, 'b');
  copyFileSync(join(releaseApp, f), a);
  copyFileSync(join(testApp, f), b);
  sh('codesign', ['--remove-signature', a]);
  sh('codesign', ['--remove-signature', b]);
  const A = readFileSync(a);
  const B = readFileSync(b);
  const offsets = [];
  for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) offsets.push(i);
  stripped[f] = { sizeA: A.length, sizeB: B.length, differingBytes: offsets.length, offsets: offsets.slice(0, 16) };
  otherBytes += f === FRAMEWORK ? Math.max(0, offsets.length - fuseNames.length) : offsets.length;
}
rmSync(tmp, { recursive: true, force: true });

const wire = async (app) => {
  const w = await getCurrentFuseWire(app);
  return Object.fromEntries(
    Object.entries(w)
      .filter(([k]) => k !== 'version')
      .map(([k, v]) => [FuseV1Options[k], FuseState[v]]),
  );
};
const fuses = { release: await wire(releaseApp), derived: await wire(testApp) };
const flippedAsAsked = fuseNames.every((n) => fuses.derived[n] === 'ENABLE') && Object.keys(fuses.release).every((n) => fuseNames.includes(n) || fuses.release[n] === fuses.derived[n]);
const frameworkDiff = stripped[FRAMEWORK]?.differingBytes ?? 0;
const sameTree = onlyRelease.length === 0 && onlyDerived.length === 0 && linkDifferences.length === 0;
const ok = sameTree && flippedAsAsked && otherBytes === 0 && frameworkDiff === fuseNames.length && requirement(releaseApp) === requirement(testApp);

const report = {
  releaseApp: resolve(releaseApp),
  derivedApp: resolve(testApp),
  identity,
  fusesFlipped: fuseNames,
  filesCompared: files.length,
  linksCompared: [...releaseEntries.values()].filter((t) => t !== null).length,
  onlyRelease,
  onlyDerived,
  linkDifferences,
  differingFiles: differing,
  afterStrippingSignatures: stripped,
  fuses,
  designatedRequirement: { release: requirement(releaseApp), derived: requirement(testApp) },
  ok,
};
if (jsonOut) {
  mkdirSync(dirname(jsonOut), { recursive: true });
  writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (!ok) {
  rmSync(testApp, { recursive: true, force: true });
  console.error('derive: the derived package differs by more than the fuse bytes (or the requirement changed): removed');
  process.exit(1);
}
