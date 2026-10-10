// D-13 and task 5: AYAR's Semgrep rules package, each rule against its test project (fixtures/semgrep-rules), run by
// the real Semgrep 1.180.0 the way the adapter runs it: from a neutral folder with the rules file in it, explicit
// absolute targets, no git ignore, no metrics. Every `ruleid:` line has a match on the line after it, no `ok:` line
// has one, and nothing else matches. Semgrep is looked for in the fixtures toolbox (fixtures/tools/toolchain.json)
// or AYAR_TEST_SEMGREP; without it the test says so and is skipped (it runs in the phase's gate).
import { loadCatalog } from '@ayar/catalog';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { semgrepRuleId } from '../src/index.ts';

const RULES = new URL('../../../fixtures/semgrep-rules/', import.meta.url).pathname;
const SEMGREP = process.env.AYAR_TEST_SEMGREP ?? join(homedir(), '.cache/ayar-fixtures-toolchain/py/bin/semgrep');
const available = existsSync(SEMGREP);
const { catalog } = loadCatalog(undefined, { now: new Date('2026-10-11T00:00:00Z') });

describe.skipIf(!available)('AYAR\'s Semgrep rules on their test projects (real Semgrep)', () => {
  it('match every ruleid line and no ok line', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-6-semgrep-')));
    try {
      mkdirSync(join(dir, 'home'));
      writeFileSync(join(dir, 'ayar-rules.yml'), catalog.semgrep.configText());
      const files = readdirSync(RULES).map((f) => join(RULES, f));
      const out = execFileSync(SEMGREP, ['scan', '--no-git-ignore', '--config', join(dir, 'ayar-rules.yml'), '--metrics=off', '--disable-version-check', '--json', '--quiet', ...files], { cwd: dir, env: { PATH: `${join(SEMGREP, '..')}:/usr/bin:/bin`, HOME: join(dir, 'home'), SEMGREP_SEND_METRICS: 'off' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const j = JSON.parse(out) as { results: { check_id: string; path: string; start: { line: number } }[]; errors: unknown[]; version: string };
      expect(j.version).toBe('1.180.0');
      expect(j.errors).toEqual([]);
      const got = new Set(j.results.map((r) => `${r.path.split('/').pop()}:${r.start.line}:${semgrepRuleId(r.check_id, dir).id}`));
      const expected = new Set<string>();
      for (const f of readdirSync(RULES)) {
        readFileSync(join(RULES, f), 'utf8').split('\n').forEach((line, i) => {
          const m = /^\s*(?:\/\/|#)\s*(ruleid|ok):\s*(\S+)\s*$/.exec(line);
          if (!m) return;
          const key = `${f}:${i + 2}:${m[2]}`;
          if (m[1] === 'ruleid') {
            expected.add(key);
            expect(got.has(key), `${key} should match`).toBe(true);
          } else expect(got.has(key), `${key} should not match`).toBe(false);
        });
      }
      expect([...got].filter((g) => !expected.has(g))).toEqual([]);
      expect(new Set([...expected].map((k) => k.split(':')[2]))).toEqual(new Set(catalog.semgrep.ids));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
