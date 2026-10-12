// Known vulnerabilities in AYAR's own dependencies (DEV-13 review R1-04): the root package-lock.json alone, scanned by
// osv-scanner against a local npm database, so the list of packages is never sent anywhere. The self-check's
// sec.deps@. cannot run on this repository (G-DEV13-06: the scanner walks the whole tree and asks for the PyPI database
// of the test projects), so this is its evidence.
//   node tools/acceptance/deps-osv.ts --db <osv database folder> --out docs/acceptance/self-check/deps-osv.json
// The database folder is OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY; with --download it is filled first (npm only, ~200 MB).
import { execFileSync, spawnSync } from 'node:child_process';
import { statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const scanner = process.env.AYAR_OSV_SCANNER ?? join(homedir(), '.cache/ayar-fixtures-toolchain/bin/osv-scanner');
const db = resolve(opt('db') ?? join(homedir(), '.cache/ayar-DEV-13-osv'));
const out = resolve(root, opt('out') ?? 'docs/acceptance/self-check/deps-osv.json');
const lockfile = join(root, 'package-lock.json');

const args = ['scan', '--offline', '--offline-vulnerabilities', ...(argv.includes('--download') ? ['--download-offline-databases'] : []), '-L', lockfile, '--format', 'json'];
const run = spawnSync(scanner, args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: db } });
// 0: nothing found; 1: vulnerabilities found; anything else: the scan itself failed.
if (run.status !== 0 && run.status !== 1) {
  process.stderr.write(run.stderr);
  throw new Error(`osv-scanner exited ${run.status}`);
}
type Result = { results?: { packages?: { package: { name: string; version: string }; vulnerabilities?: { id: string }[] }[] }[] };
const report = JSON.parse(run.stdout) as Result;
const vulnerable = (report.results ?? []).flatMap((r) => r.packages ?? []).map((p) => ({ package: `${p.package.name}@${p.package.version}`, ids: (p.vulnerabilities ?? []).map((v) => v.id) }));
const scanned = /found (\d+) packages/.exec(run.stderr)?.[1];
const database = join(db, 'osv-scalibr/npm/all.zip');
const summary = {
  test: 'AYAR dependencies: known vulnerabilities (sec.deps evidence, DEV-13 review R1-04)',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  scanner: execFileSync(scanner, ['--version'], { encoding: 'utf8' }).split('\n')[0],
  lockfile: 'package-lock.json',
  packagesScanned: scanned ? Number(scanned) : null,
  database: { ecosystem: 'npm', modified: statSync(database).mtime.toISOString(), offline: true },
  vulnerable,
  at: new Date().toISOString(),
};
writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`${summary.packagesScanned} packages, ${vulnerable.length} vulnerable → ${out}`);
if (vulnerable.length) process.exitCode = 1;
