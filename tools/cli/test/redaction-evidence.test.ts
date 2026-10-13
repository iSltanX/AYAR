// AUD-01 and AUD-02 (the independent audit of 2026-10-12) end to end, through tools/cli and the engine's protocol: what
// a check prints is redacted before it is stored, and nothing of it leaves AYAR — not the evidence logs, the database,
// the two reports, nor any export (Markdown, HTML, JSON, the evidence bundle). The check prints a synthetic token
// inside a would-be marker (AUD-01), and the value of a sensitive variable of the login shell that spans two lines,
// raw (AUD-02). Every value is synthetic, and the token is assembled at run time, so none sits in the repository.
import type { ReportBuilt, ReportExported } from '@ayar/protocol';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { untar } from '../../../packages/engine/src/reports/tar.ts';
import { pathGrant } from '../src/grants.ts';
import { addProject, approveAll, check, connectEngine, filesContaining, filesUnder, loginShell, ok, plan, startRun, tempDir, waitRun } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-AUD-redaction-evidence-')));
afterEach(() => cleanup());

const TOKEN = ['gh', 'p_', 'Aa0Bb1Cc2Dd3Ee4Ff5Gg6Hh7Ii8Jj9Kk0Ll1'].join('');
const LINES = ['synthetic-first-line-4931', 'synthetic-second-line-8264'];
const NEEDLES = [TOKEN, ...LINES];

describe('AUD-01 and AUD-02: nothing a check prints leaves AYAR unredacted', () => {
  it('a token in a would-be marker and a two-line sensitive value: redacted in the evidence, the database, both reports and every export', async () => {
    const project = join(root, 'project');
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'aud-redaction', version: '1.0.0', type: 'module' }));
    // The script prints what the audit found to pass both guards, on stdout and stderr, in two chunks each.
    writeFileSync(
      join(project, 'print.mjs'),
      [
        `const forged = ${JSON.stringify(`tool output: ⟦redacted:${TOKEN}⟧`)};`,
        `const value = ${JSON.stringify(LINES.join('\n'))};`,
        'process.stdout.write(forged.slice(0, 20)); setTimeout(() => { process.stdout.write(forged.slice(20) + "\\n" + value.slice(0, 30));',
        '  setTimeout(() => { process.stdout.write(value.slice(30) + "\\n"); process.stderr.write("err: " + value + "\\n" + forged + "\\n"); process.exitCode = 3; }, 50); }, 50);',
        '',
      ].join('\n'),
    );
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin', exports: { AUD_API_TOKEN: LINES.join('\n') } }) } });
    const out = join(root, 'out');
    mkdirSync(out);
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, project);
      ok(await engine.invoke('profile.update', { projectId, patch: { custom: { print: { argv: ['node', 'print.mjs'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } }));
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'check', instance: 'custom.print@.' });
      const d = await waitRun(engine, (await startRun(engine, p.id)).runId);
      const c = check(d, 'custom.print@.');
      expect(c).toMatchObject({ outcome: 'failed' });
      // The evidence logs: kept, redacted, and still saying what happened.
      const logs = Object.fromEntries(['stdout.log', 'stderr.log'].map((n) => [n, readFileSync(join(dataDir, 'evidence', c.evidence.find((e) => e.relPath.endsWith(`/${n}`))!.relPath), 'utf8')]));
      expect(logs['stdout.log']).toBe('tool output: ⟦redacted:⟦redacted:github-token⟧⟧\n⟦redacted:env:AUD_API_TOKEN⟧\n');
      expect(logs['stderr.log']).toBe('err: ⟦redacted:env:AUD_API_TOKEN⟧\ntool output: ⟦redacted:⟦redacted:github-token⟧⟧\n');

      const target = { kind: 'run' as const, runId: d.run.runId };
      for (const lang of ['ar', 'en'] as const) {
        const b = ok<ReportBuilt>(await engine.invoke('report.build', { target, options: { lang, scope: 'wholeRun' } }));
        expect(b.blocked, lang).toBeNull();
        for (const text of [b.human.text, b.model.text, JSON.stringify(b.report)]) for (const n of NEEDLES) expect(text, `${lang}: ${n}`).not.toContain(n);
        for (const format of ['markdown', 'html', 'json', 'evidence-bundle'] as const) {
          const dest = join(out, `report.${lang}.${format}`);
          const g = pathGrant('destination', dest);
          ok<ReportExported>(await engine.invoke('report.export', { target, format, lang, destinationToken: g.token }, g.grants));
          const texts = format === 'evidence-bundle' ? untar(gunzipSync(readFileSync(dest))).map((x) => new TextDecoder().decode(x.data)) : [readFileSync(dest, 'utf8')];
          expect(texts.length, format).toBeGreaterThan(0);
          for (const text of texts) for (const n of NEEDLES) expect(text, `${lang} ${format}: ${n}`).not.toContain(n);
        }
      }
    } finally {
      await engine.close();
    }
    // Nothing in AYAR's data folder (the database and its journal, the evidence, the logs) or in the exports holds them.
    expect(filesUnder(dataDir).length).toBeGreaterThan(0);
    for (const n of NEEDLES) {
      expect(filesContaining(dataDir, n), n).toEqual([]);
      expect(filesContaining(out, n), n).toEqual([]);
    }
  }, 120_000);
});
