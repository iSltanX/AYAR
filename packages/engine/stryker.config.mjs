// Q-05 (plan 19 «قوة الاختبار»): mutation testing of AYAR's four components whose tests must prove they would catch a
// wrong change — the classifier (C-16), the purity index (C-19), the redaction (C-18) and the planner (C-10) —
// with StrykerJS (its command runner over Vitest). Run from the repository root:
//   node node_modules/@stryker-mutator/core/bin/stryker.js run packages/engine/stryker.config.mjs
// Its sandbox, its reports and its incremental file live outside the repository (~/.cache/ayar-stryker/), so a run
// leaves nothing in the working tree. The threshold `break` is the owner's decision (Q-05), applied here once taken.
import { homedir } from 'node:os';
import { join } from 'node:path';

const out = process.env.AYAR_STRYKER_OUT ?? join(homedir(), '.cache', 'ayar-stryker');

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  // The command runner: Stryker's Vitest runner 10 does not switch mutants under Vitest 5 (a first trial killed
  // under 1%: a mutant `else if (true)` in the classifier survived its own test). Each mutant runs the four
  // components' tests in a Vitest process with __STRYKER_ACTIVE_MUTANT__ set, which the instrumented code reads.
  testRunner: 'command',
  commandRunner: { command: `${JSON.stringify(process.execPath)} node_modules/vitest/vitest.mjs run --config packages/engine/vitest.stryker.config.ts` },
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
  jsonReporter: { fileName: join(out, 'mutation.json') },
  thresholds: { high: 80, low: 60, break: null },
};
