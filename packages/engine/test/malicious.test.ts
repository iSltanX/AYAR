// AT-01 (FR-04, FR-57), the full-scan half, and AT-42 (FR-31, FR-55), on FX-MALICIOUS generated in a temp folder:
// - a full scan, with the static tools that read the code (Semgrep with AYAR's rules, the secrets scanner, OSV), never
//   runs git on the repository: every git the engine's children start by name is traced with its folder and its
//   arguments (a stand-in first on the login PATH that records, then hands over to the real git), Semgrep's own
//   calls go to E-10's stand-in (kept as evidence), and none of them is in the repository or names it; the traps
//   (core.fsmonitor, a diff driver, textconv) write no marker; and none of the fake secrets is anywhere in AYAR's
//   data folder after the scan (the database, its journal, the evidence, the snapshots, the logs);
// - the history scan finds the old secret by its commit and file, its value hidden, through E-24's shadow
//   repository, in «مشروع غير موثوق» too (it runs nothing of the project), with no marker written.
import type { ResultsPage, RunDetail } from '@ayar/protocol';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addProject, approveAll, filesContaining, plan, startRun, waitRun } from '../../../tools/cli/test/support/fixtures.ts';
import { compare } from './support/conformance.ts';
import { engineFor, execOf, expectations, LOGIN_PATH, materialize, ok, tempDir, toolchainReady, type EngineConnection } from './support/scan.ts';
import { systemBin } from './support/variants.ts';

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
let repo: string;
let manifest: { markers_dir: string; head: string; first_commit: string; fake_secrets: Record<string, string> };
let gitLog: string;
const dataDir = () => join(root, 'AYAR');

beforeAll(async () => {
  if (!toolchainReady()) return;
  ({ dir: root, cleanup } = tempDir('ayar-DEV-6-malicious-'));
  repo = materialize('FX-MALICIOUS', 'default', join(root, 'fx'));
  manifest = JSON.parse(readFileSync(join(root, 'fx', 'MANIFEST.json'), 'utf8')) as typeof manifest;
  // Every git started by name is traced (its folder and its arguments), then the real one runs.
  const trace = join(root, 'trace-bin');
  mkdirSync(trace);
  gitLog = join(root, 'git-calls.log');
  writeFileSync(join(trace, 'git'), `#!/bin/sh\nprintf 'cwd=%s args=%s\\n' "$(pwd -P)" "$*" >> '${gitLog}'\nexec /usr/bin/git "$@"\n`);
  chmodSync(join(trace, 'git'), 0o755);
  engine = await engineFor(root, { path: `${trace}:${systemBin(root)}:${LOGIN_PATH}` });
}, 120_000);
afterAll(async () => {
  await engine?.close();
  cleanup?.();
});

const calls = () => (existsSync(gitLog) ? readFileSync(gitLog, 'utf8').trim().split('\n').filter(Boolean) : []);

describe.runIf(toolchainReady())('FX-MALICIOUS through the engine', () => {
  it('AT-01: a full scan runs no git on the repository, fires no trap, and keeps no secret; the static checks find what they should', async () => {
    const { projectId } = await addProject(engine, repo);
    // AT-16's optional checks for its defects: the static analysis (public audience by default) and the history.
    ok(await engine.invoke('profile.update', { projectId, patch: { checks: { 'sec.sast@.': { included: true }, 'sec.secrets.history@.': { included: true } } } }));
    await approveAll(engine, projectId);
    const p = await plan(engine, projectId, { kind: 'full' });
    const d: RunDetail = await waitRun(engine, (await startRun(engine, p.id)).runId, 300_000);
    const page = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId: d.run.runId, includeExcluded: true } }));

    // The expected results of plan 20, by check, place, rule and proof.
    const rows = expectations('FX-MALICIOUS', 'default').expectations.map((e) => compare('FX-MALICIOUS', 'default', e, `${e.check}@.`, d.checks.find((c) => c.instance === `${e.check}@.`), page.findings, null));
    expect(rows.filter((r) => !r.ok).map((r) => `${r.instance}: ${r.notes.join('; ')}`)).toEqual([]);

    // No trap fired; no git on the repository, by its folder or its arguments.
    expect(readdirSync(manifest.markers_dir)).toEqual([]);
    const onRepo = calls().filter((c) => c.includes(repo));
    expect(onRepo).toEqual([]);
    // Semgrep's own calls went to E-10's stand-in, from AYAR's neutral folder, and are kept as evidence.
    const sast = execOf(d, 'sec.sast@.');
    const nogit = sast.evidence.find((e) => e.relPath.endsWith('nogit-calls.log'));
    if (nogit) {
      const text = readFileSync(join(dataDir(), 'evidence', nogit.relPath), 'utf8');
      expect(text.split('\n').filter((l) => l.includes(repo))).toEqual([]);
    }
    expect(sast.raw?.steps?.length).toBeGreaterThanOrEqual(1);

    // The three fake secrets are nowhere in the data folder (the history one is in the repository's objects only).
    for (const [name, value] of Object.entries(manifest.fake_secrets)) expect(filesContaining(dataDir(), value), name).toEqual([]);
  }, 300_000);

  it('AT-42: the history scan finds the old secret by commit and file through the shadow repository, also in «مشروع غير موثوق»', async () => {
    const projects = ok<{ projects: { id: string; rootPath: string }[] }>(await engine.invoke('project.list', {})).projects;
    const projectId = projects.find((x) => x.rootPath === repo)!.id;
    ok(await engine.invoke('project.setTrust', { projectId, trusted: false }));
    await approveAll(engine, projectId);
    const before = calls().length;
    const p = await plan(engine, projectId, { kind: 'check', instance: 'sec.secrets.history@.' });
    const d = await waitRun(engine, (await startRun(engine, p.id)).runId, 300_000);
    const c = execOf(d, 'sec.secrets.history@.');
    expect(c).toMatchObject({ outcome: 'failed', origin: 'project' });
    const page = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId: d.run.runId } }));
    const f = page.findings.find((x) => x.checkId === 'sec.secrets.history')!;
    expect(f).toMatchObject({ ruleId: 'secret.detected', toolRuleId: 'generic-api-key', proof: 'proven', location: { path: 'config/old-credentials.js' } });
    expect(manifest.first_commit.startsWith(f.location!.commit!.slice(0, 7)) || f.location!.commit!.startsWith(manifest.first_commit.slice(0, 7))).toBe(true);
    // The scanner's git ran on the shadow repository in AYAR's temporary folder, never on the repository.
    const now = calls().slice(before);
    expect(now.length).toBeGreaterThan(0);
    expect(now.filter((l) => l.includes(repo))).toEqual([]);
    expect(now.every((l) => l.includes('shadow.git') || l.includes(join(dataDir(), 'tmp')))).toBe(true);
    expect(readdirSync(manifest.markers_dir)).toEqual([]);
    expect(filesContaining(dataDir(), manifest.fake_secrets.history!)).toEqual([]);
  }, 300_000);
});
