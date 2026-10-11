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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { report, type Row } from './support/conformance.ts';
import { engineFor, LOGIN_PATH, NVM_NODE, ok, PNPM, scanVariant, tempDir, toolchainReady, type EngineConnection } from './support/scan.ts';
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
  }, 60 * 60_000);
});
