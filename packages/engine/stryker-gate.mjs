// Q-05 (decisions.md, 2026-10-11): the mutation score of each of AYAR's four components on its own — the classifier
// (C-16), the purity index (C-19), the redaction (C-18) and the planner (C-10) — is at least 70%. A threshold on the
// whole would hide a weak component behind the others (62.29% in the first run, the planner at 31.98%), which is
// what AYAR forbids in its own purity index. Run after StrykerJS (`npm run test:mutation`):
//   node packages/engine/stryker-gate.mjs [mutation.json]
// Without an argument it reads the run's own report, then empties the tests' temp folder beside it.
// The score is Stryker's: detected (killed or timed out) over valid (detected, survived or not covered).
import { readFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BREAK = 70;

export const COMPONENTS = [
  { id: 'classifier', name: 'المصنّف (C-16)', files: ['packages/engine/src/classifier/classify.ts'] },
  { id: 'purity', name: 'النقاء (C-19)', files: ['packages/engine/src/purity/compute.ts'] },
  { id: 'redaction', name: 'الإخفاء (C-18)', files: ['packages/engine/src/redaction/redactor.ts', 'packages/engine/src/redaction/names.ts'] },
  { id: 'planner', name: 'المخطِّط (C-10)', files: ['packages/engine/src/planner/plan.ts'] },
];

const DETECTED = new Set(['Killed', 'Timeout']);
const VALID = new Set(['Killed', 'Timeout', 'Survived', 'NoCoverage']);

/** Each component's score from a mutation-testing-report-schema report; null when none of its files was measured. */
export function componentScores(report) {
  const files = Object.entries(report?.files ?? {});
  return COMPONENTS.map((c) => {
    let detected = 0;
    let valid = 0;
    let measured = 0;
    for (const [file, f] of files) {
      if (!c.files.some((x) => file === x || file.endsWith(`/${x}`))) continue;
      measured++;
      for (const m of f.mutants ?? []) {
        if (!VALID.has(m.status)) continue;
        valid++;
        if (DETECTED.has(m.status)) detected++;
      }
    }
    return { id: c.id, name: c.name, measured: measured === c.files.length, detected, valid, score: valid ? Math.floor((10_000 * detected) / valid) / 100 : null };
  });
}

/** Passes only when every component was measured whole and reaches the threshold. */
export function gate(report, threshold = BREAK) {
  const rows = componentScores(report);
  return { ok: rows.every((r) => r.measured && r.score !== null && r.score >= threshold), threshold, rows };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = process.argv[2] ? null : await import('./stryker.config.mjs');
  const file = process.argv[2] ?? config.reportFile;
  const g = gate(JSON.parse(readFileSync(file, 'utf8')));
  for (const r of g.rows) console.log(`${r.measured && r.score !== null && r.score >= g.threshold ? '✓' : '✗'} ${r.name}: ${r.score === null ? 'لم يُقس' : `${r.score.toFixed(2)}%`} (${r.detected}/${r.valid})${r.measured ? '' : ' — لم تُقس ملفاته كلها'}`);
  console.log(g.ok ? `كل مكوّن ${g.threshold}% أو أكثر (Q-05)` : `مكوّن دون ${g.threshold}% أو لم يُقس (Q-05)`);
  process.exitCode = g.ok ? 0 : 1;
  // The run is over: what the tests left in their temp folder (a mutant killed by its timeout) goes.
  if (config) rmSync(config.tmp, { recursive: true, force: true });
}
