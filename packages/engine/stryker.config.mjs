// Q-05 (plan 19 «قوة الاختبار»): mutation testing of AYAR's four components whose tests must prove they would catch a
// wrong change — the classifier (C-16), the purity index (C-19), the redaction (C-18) and the planner (C-10) —
// with StrykerJS (its command runner over Vitest). Run from the repository root:
//   node node_modules/@stryker-mutator/core/bin/stryker.js run packages/engine/stryker.config.mjs
// Its sandbox, its reports and the tests' temp folders live outside the repository (~/.cache/ayar-stryker/, or
// AYAR_STRYKER_OUT), so a run leaves nothing in the working tree. Q-05 (decisions.md, 2026-10-11): 70% for each of
// the four components on its own, checked after the run by stryker-gate.mjs on mutation.json (`break` 70 on the whole
// follows from it); high 80 and low 60 are for display. `npm run test:mutation` runs both; about half an hour, so not
// in `npm run verify`: when one of the four changes, and at the release gate (DEV-13).
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const out = process.env.AYAR_STRYKER_OUT ?? join(homedir(), '.cache', 'ayar-stryker');
// The tests' own temp folders go under the output too: a mutant ended by its timeout is killed before its test removes
// them, and they would stay in the system's temp folder (seven planner folders did in the first run). stryker-gate.mjs
// empties it after the run.
export const tmp = join(out, 'tmp');
/** The JSON report stryker-gate.mjs reads. */
export const reportFile = join(out, 'mutation.json');
mkdirSync(tmp, { recursive: true });

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  // The command runner: Stryker's Vitest runner 10 does not switch mutants under Vitest 5 (a first trial killed
  // under 1%: a mutant `else if (true)` in the classifier survived its own test). Each mutant runs the four
  // components' tests in a Vitest process with __STRYKER_ACTIVE_MUTANT__ set, which the instrumented code reads.
  testRunner: 'command',
  commandRunner: { command: `TMPDIR=${JSON.stringify(tmp)} ${JSON.stringify(process.execPath)} node_modules/vitest/vitest.mjs run --config packages/engine/vitest.stryker.config.ts` },
  mutate: ['packages/engine/src/classifier/classify.ts', 'packages/engine/src/purity/compute.ts', 'packages/engine/src/redaction/redactor.ts', 'packages/engine/src/redaction/names.ts', 'packages/engine/src/planner/plan.ts'],
  // The planner's tests discover fixture projects (materialized in a temp folder from fixtures/).
  ignorePatterns: ['/apps', '/docs', '/spikes', '/tools', '/packages/adapters', '/packages/analyzers', '/.claude'],
  coverageAnalysis: 'off',
  concurrency: 4,
  timeoutMS: 20_000,
  tempDirName: join(out, 'sandbox'),
  cleanTempDir: 'always',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: join(out, 'mutation.html') },
  jsonReporter: { fileName: reportFile },
  thresholds: { high: 80, low: 60, break: 70 },
};
