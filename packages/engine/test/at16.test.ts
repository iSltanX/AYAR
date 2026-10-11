// AT-16 (FR-31, FR-32), the part outside the probe: every check proves it finds the defect planted for it, at its
// place, by its rule and with its proof, and invents none in the clean variants. Every variant of plan 20's
// projects (FX-ADAPTERS is AT-14's, at14.test.ts) is scanned by the engine with the checks its expectations name,
// the optional ones included as AT-16 says; the report compares every expectation with the result, and any
// difference in either direction fails. What a later phase owns is listed apart, never counted as a pass: the
// probe's checks (DEV-7), the integrity checks and the guard's effect on an outcome (DEV-9).
//
// About twenty minutes with the real tools: AYAR_AT16=1 (one project: AYAR_AT16_ONLY=FX-PY).
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { report, type Row } from './support/conformance.ts';
import { engineFor, LOGIN_PATH, ok, tempDir, toolchainReady, type EngineConnection, type Expectation } from './support/scan.ts';
import { installOsvMiniDb, runVariant, systemBin, variantsOf, type VariantOptions } from './support/variants.ts';

const FULL = process.env.AYAR_AT16 === '1';
const ONLY = process.env.AYAR_AT16_ONLY?.split(',') ?? null;

/** The guard's effect on an outcome (7.3 rule 8) is DEV-9's: the integrity variants' «يحتاج مراجعة». */
const guardEffect = (variant: string, e: Expectation) => (variant.startsWith('integrity-') && e.result === 'يحتاج مراجعة' ? 'DEV-9' : null);

/** FX-PROC's variants with AT-12's settings (D-DEV5-10): a minute's timeout, a 20 s idle limit, how long they run. */
const procPatch = (variant: string): Record<string, unknown> | undefined => {
  switch (variant) {
    case 'hanging-test':
    case 'sigterm-grandchild':
      return { checks: { 'beh.unit@.': { timeoutMin: 1 } } };
    case 'idle-silent':
      return { checks: { 'beh.unit@.': { idleTimeoutSec: 20, explicitEnv: { FX_PROC_SECONDS: '120' } } } };
    case 'busy-silent':
      return { checks: { 'beh.unit@.': { idleTimeoutSec: 20, explicitEnv: { FX_PROC_SECONDS: '35' } } } };
    default:
      return undefined;
  }
};

const PROJECTS: Record<string, VariantOptions> = {
  'FX-EXT': { later: guardEffect, timeoutMs: 600_000 },
  'FX-PY': {},
  'FX-MONO': {},
  'FX-NOISY': { acceptVersions: true },
  // code.complexity has no threshold of its own (10.3): the one FX-NOTEST's defect names, ESLint's 10.
  'FX-NOTEST': { patch: () => ({ checks: { 'code.complexity@.': { thresholds: { complexity: 10 } } } }) },
  'FX-PROC': { patch: procPatch },
  'FX-MALICIOUS': {},
  'FX-WEB-DESIGN': {},
};

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
beforeAll(async () => {
  if (!FULL || !toolchainReady()) return;
  ({ dir: root, cleanup } = tempDir('ayar-DEV-6-at16-'));
  engine = await engineFor(root, { path: `${systemBin(root)}:${LOGIN_PATH}` });
  ok(await engine.invoke('settings.set', { key: 'run.allowNetwork', value: false }));
  installOsvMiniDb(join(root, 'AYAR'));
}, 60_000);
afterAll(async () => {
  await engine?.close();
  cleanup?.();
});

describe('AT-16 (outside the probe): planted defects found, none invented', () => {
  it.runIf(FULL && toolchainReady())('compares every expectation of every variant with what the engine found', async () => {
    const rows: Row[] = [];
    for (const [project, o] of Object.entries(PROJECTS)) {
      if (ONLY && !ONLY.includes(project)) continue;
      for (const v of variantsOf(project)) rows.push(...(await runVariant(engine, root, project, v, o)));
    }
    console.log(report(rows));
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  }, 3 * 60 * 60_000);
});
