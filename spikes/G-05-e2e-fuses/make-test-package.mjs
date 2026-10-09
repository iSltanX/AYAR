// G-05: derive an ephemeral E2E test package from the release package by flipping exactly one fuse
// (EnableNodeCliInspectArguments -> on), re-sign it with the same identity, and prove that this
// fuse byte is the only difference once code signatures are stripped.
// Usage: node make-test-package.mjs "<release .app>" <codesign identity> <out dir>
import { flipFuses, getCurrentFuseWire, FuseV1Options, FuseState } from '../E-01-electron-forge/node_modules/@electron/fuses/dist/index.js';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [releaseApp, identity, outDir] = process.argv.slice(2);
const name = path.basename(releaseApp);
const testApp = path.join(outDir, name);
const fw = (app) => path.join(app, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework');
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

fs.rmSync(testApp, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
sh('ditto', [releaseApp, testApp]);
await flipFuses(testApp, { version: '1', [FuseV1Options.EnableNodeCliInspectArguments]: true });

// Re-sign inner to outer, keeping identifier, entitlements, requirements, flags and runtime.
const keep = '--preserve-metadata=identifier,entitlements,requirements,flags,runtime';
sh('codesign', ['--force', '--sign', identity, keep, path.join(testApp, 'Contents/Frameworks/Electron Framework.framework')]);
sh('codesign', ['--force', '--sign', identity, keep, testApp]);
sh('codesign', ['--verify', '--deep', '--strict', testApp]);

// Compare every file; then strip signatures from the differing Mach-O files and compare again.
const walk = (root, rel = '') =>
  fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((d) => {
    const r = path.join(rel, d.name);
    if (d.isSymbolicLink()) return [];
    return d.isDirectory() ? walk(root, r) : [r];
  });
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files = walk(releaseApp);
const differing = files.filter((f) => hash(path.join(releaseApp, f)) !== hash(path.join(testApp, f)));
const tmp = fs.mkdtempSync(path.join(outDir, 'strip-'));
const strippedDiffs = {};
for (const f of differing.filter((f) => !f.includes('_CodeSignature'))) {
  const a = path.join(tmp, 'a'), b = path.join(tmp, 'b');
  fs.copyFileSync(path.join(releaseApp, f), a);
  fs.copyFileSync(path.join(testApp, f), b);
  sh('codesign', ['--remove-signature', a]);
  sh('codesign', ['--remove-signature', b]);
  const A = fs.readFileSync(a), B = fs.readFileSync(b);
  const offsets = [];
  for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) offsets.push(i);
  strippedDiffs[f] = { sizeA: A.length, sizeB: B.length, differingBytes: offsets.length, offsets: offsets.slice(0, 10) };
}
fs.rmSync(tmp, { recursive: true, force: true });

const wire = async (app) => {
  const w = await getCurrentFuseWire(app);
  return Object.fromEntries(Object.entries(w).filter(([k]) => k !== 'version').map(([k, v]) => [FuseV1Options[k], FuseState[v]]));
};
const report = {
  releaseApp: name,
  filesCompared: files.length,
  differingFiles: differing,
  afterStrippingSignatures: strippedDiffs,
  fuses: { release: await wire(releaseApp), test: await wire(testApp) },
};
console.log(JSON.stringify(report, null, 2));
