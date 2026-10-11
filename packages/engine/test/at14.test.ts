// AT-14 (FR-31, FR-32, NFR-06), the engine part: every known exit and report is classified as 7.3 and the adapters'
// maps say, on the adapter projects with the pinned tool versions (FX-ADAPTERS, plan 19 and 20). Each component is
// a project of its own, scanned by the engine through the protocol: its approved command with the adapter's flags,
// its reports read in a worker thread, the classifier's outcome, the finding at its place with its rule and proof.
// The report of conformance — expectation against result, row by row — is printed, and any difference fails.
// The rows of the table that are reports rather than tool runs (a corrupt JUnit, a report over the limit, exit 0 with
// failures) are FX-REPORTS', in at39.test.ts; the adapters' readers on the reports' shapes are in packages/adapters.
//
// The whole matrix runs the real tools of the toolchain (~/.cache/ayar-fixtures-toolchain, D-DEV1-06) for about ten
// minutes: AYAR_AT14=1. Without it, the rows that need no dependencies (node:test) and the missing tool still run.
import { adapterById, type ParseContext } from '@ayar/adapters';
import type { ExitSignal, ParsedReport } from '@ayar/protocol';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { report, type Row } from './support/conformance.ts';
import { engineFor, LOGIN_PATH, materialize, NVM_NODE, ok, PNPM, scanVariant, tempDir, TOOLCHAIN, toolchainReady, type EngineConnection } from './support/scan.ts';
import { installOsvMiniDb, runVariant, systemBin, variantsOf } from './support/variants.ts';

const FULL = process.env.AYAR_AT14 === '1';
/** A subset while fixing (AYAR_AT14_ONLY=playwright|semgrep): a pattern over the variants' names. */
const ONLY = process.env.AYAR_AT14_ONLY ? new RegExp(process.env.AYAR_AT14_ONLY) : null;

/** What a variant of FX-ADAPTERS needs beyond its expectations: AYAR's timeout of a minute for the hanging ones. */
const patch = (variant: string) => {
  const m = /^(vitest|jest|node-test|playwright|pytest|eslint)--timeout$/.exec(variant);
  if (!m) return undefined;
  const check = { vitest: 'beh.unit', jest: 'beh.unit', 'node-test': 'beh.unit', playwright: 'beh.e2e', pytest: 'beh.unit', eslint: 'code.lint' }[m[1]!]!;
  return { checks: { [`${check}@.`]: { timeoutMin: 1 } } };
};
const background = (path: string) => (existsSync(join(path, 'server.mjs')) ? [join(NVM_NODE, 'node'), 'server.mjs'] : null);

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
beforeAll(async () => {
  ({ dir: root, cleanup } = tempDir('ayar-DEV-6-at14-'));
  engine = await engineFor(root, { path: `${systemBin(root)}:${LOGIN_PATH}` });
  ok(await engine.invoke('settings.set', { key: 'run.allowNetwork', value: true }));
  installOsvMiniDb(join(root, 'AYAR'));
}, 60_000);
afterAll(async () => {
  await engine?.close();
  cleanup?.();
});

describe('AT-14 (engine): exit codes and reports', () => {
  it.runIf(existsSync(PNPM))('node:test: a failure at its line, no test ran «ناقص», a pass; a missing tool «ناقص»', async () => {
    const rows: Row[] = [];
    for (const v of ['good', 'node-test--bad', 'node-test--no-inputs']) {
      rows.push(...(await runVariant(engine, root, 'FX-ADAPTERS', v, { perComponent: true, only: (e) => e.component === 'node-test' })));
    }
    console.log(report(rows));
    expect(rows.filter((r) => !r.ok)).toEqual([]);
    // «أداة غير موجودة»: the program is on no PATH: «ناقص» with why, never a run.
    const s = await scanVariant(engine, root, 'FX-ADAPTERS', 'good', { subdir: 'node-test', folder: 'enoent', install: false, patch: { custom: { gone: { argv: ['ayar-no-such-tool', '--version'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } }, selection: { kind: 'check', instance: 'custom.gone@.' } });
    expect(s.detail.checks.find((c) => c.instance === 'custom.gone@.')).toMatchObject({ outcome: 'missing', outcomeReason: { key: 'setup.reason.toolMissing', params: { tool: 'ayar-no-such-tool' } } });
  }, 300_000);

  it.runIf(FULL && toolchainReady())('every expectation of every FX-ADAPTERS variant, with the real tools', async () => {
    const rows: Row[] = [];
    for (const v of variantsOf('FX-ADAPTERS').filter((x) => !ONLY || ONLY.test(x))) rows.push(...(await runVariant(engine, root, 'FX-ADAPTERS', v, { perComponent: true, patch, background })));
    console.log(report(rows));
    expect(rows.filter((r) => !r.ok)).toEqual([]);
    // D-DEV6-17: the local server of every lychee project (on 127.0.0.1 and ::1) was knocked on by no check.
    const served = readdirSync(root).filter((d) => d.startsWith('FX-ADAPTERS-') && existsSync(join(root, d, 'lychee', 'server.mjs')));
    if (rows.some((r) => r.instance.startsWith('lychee:'))) expect(served.length).toBeGreaterThan(0);
    expect(served.filter((d) => existsSync(join(root, d, 'lychee', 'hits.log'))).map((d) => [d, readFileSync(join(root, d, 'lychee', 'hits.log'), 'utf8')])).toEqual([]);
  }, 60 * 60_000);
});

// lychee knocks on no local address (D-DEV6-17), so its rows that need a server — 404, 403, a timeout — cannot come
// through the engine on an offline machine. Here the real lychee runs the adapter's own command on the local server
// of FX-ADAPTERS with the two changes that let it reach it (the project's lychee.toml, no exclusion), and the adapter
// reads what it wrote: every row of 10.3 for links on the tool's real output. And the same server proves why
// --exclude-all-private alone is not enough, and that the adapter's whole command knocks on nothing.
const LYCHEE = join(TOOLCHAIN, 'bin', 'lychee');
describe.runIf(existsSync(LYCHEE))('AT-14: lychee on the real tool, read by its adapter', () => {
  const a = adapterById('lychee')!;
  const template = a.template({ checkId: 'code.refs.external', component: '.', section: 'quality', command: null, tool: { key: 'lychee', source: 'managed', runtime: null, path: null }, runner: { kind: 'adapter', ids: ['lychee'] }, thresholds: null, customSuccess: null, references: [], referenceValues: {} }, { configs: {} })!;
  async function lychee(variant: string, argvOf: (argv: string[]) => string[]): Promise<{ report: ParsedReport; exit: ExitSignal; hits: string[] }> {
    const dir = join(materialize('FX-ADAPTERS', variant, join(root, `lychee-${variant}-${Math.random().toString(36).slice(2, 8)}`)), 'lychee');
    const out = join(dir, '..', 'reports');
    mkdirSync(out);
    const server = spawn(join(NVM_NODE, 'node'), ['server.mjs'], { cwd: dir, stdio: 'ignore' });
    try {
      await new Promise((res) => setTimeout(res, 500));
      const argv = argvOf(template.argv).map((x) => x.replace('{tool}', LYCHEE).replace('{reports}', out)).flatMap((x) => (x === '{targets}' ? [join(dir, 'README.md')] : [x]));
      const r = spawnSync(argv[0]!, argv.slice(1), { cwd: dir, encoding: 'utf8', timeout: 60_000 });
      const text = existsSync(join(out, 'links.json')) ? readFileSync(join(out, 'links.json'), 'utf8') : null;
      const ctx: ParseContext = { root: dir, cwd: dir, component: '.', checkId: 'code.refs.external', files: text === null ? [] : [{ name: 'links.json', step: 1, text, size: text.length, truncated: false }], stdout: r.stdout, stderr: r.stderr, read: () => null, countFiles: () => 1, thresholds: null, outputs: [], exists: () => false, customSuccess: null, projectReport: () => ({ text: null, problem: 'missing', size: null }) };
      const exitInfo = { exitCode: r.status, signal: null, steps: [{ n: 1, exitCode: r.status, ended: 'exited' as const }] };
      const parsed = a.parseReports(ctx, exitInfo);
      const hits = existsSync(join(dir, 'hits.log')) ? readFileSync(join(dir, 'hits.log'), 'utf8').trim().split('\n') : [];
      return { report: parsed, exit: a.exitMap(exitInfo, parsed, ctx), hits };
    } finally {
      server.kill('SIGTERM');
    }
  }
  /** What reaches the server: the project's lychee.toml and no exclusion; and its timeout of 3 s without retries. */
  const reaching = (argv: string[]) => {
    const x = [...argv];
    x[x.indexOf('--timeout') + 1] = '3';
    x[x.indexOf('--max-retries') + 1] = '0';
    x.splice(x.indexOf('--exclude'), 2);
    x.splice(x.indexOf('--exclude-all-private'), 1);
    x[x.indexOf('/dev/null')] = 'lychee.toml';
    return x;
  };

  it('404 proven broken, 403 and a timeout for review, an invalid configuration the tool\'s (10.3)', async () => {
    const bad = await lychee('lychee--bad', reaching);
    expect([bad.exit, bad.report.findings.map((f) => [f.rule, f.toolRule, f.location?.path, f.location?.line])]).toEqual([{ kind: 'ok' }, [['link.broken', '404', 'README.md', 3]]]);
    const review = await lychee('lychee--needs-review', reaching);
    expect(review.report.findings.map((f) => [f.rule, f.toolRule, f.location?.line])).toEqual([['link.unverified', '403', 3]]);
    const hang = await lychee('lychee--timeout', reaching);
    expect(hang.report.findings.map((f) => [f.rule, f.toolRule, f.location?.line])).toEqual([['link.unverified', 'timeout', 3]]);
    const config = await lychee('lychee--config-error', reaching);
    expect(config.exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.configError', params: { tool: 'lychee', code: 3 } } });
  }, 120_000);

  it('knocks on no local address: --exclude-all-private alone lets four forms through, the adapter\'s command none', async () => {
    const alone = await lychee('good', (argv) => {
      const x = [...argv];
      x.splice(x.indexOf('--exclude'), 2);
      return x;
    });
    expect(alone.hits.map((h) => h.split(' ')[0]).sort()).toEqual(['0.0.0.0:18231', '[::]:18231', '[::ffff:7f00:1]:18231', 'localhost.:18231']);
    const ayar = await lychee('good', (argv) => argv);
    expect(ayar.hits).toEqual([]);
    expect(ayar.exit).toMatchObject({ kind: 'missing', reason: { key: 'adapter.reason.noLinksChecked', params: { links: 7, excluded: 7 } } });
  }, 120_000);
});
