// The driver against a real browser (Playwright's Chromium in the user's cache; skipped without it): a noisy page —
// more console lines and more answers from a simulated address than a cell keeps (200 each) — still gives a cell the
// contract accepts, the first ones kept and the job done; and its request to a host outside this machine is refused
// and logged by its place, never its query.
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FromProbe, type CellResult, type ProbeJob } from '../src/contract.ts';
import { runJob } from '../src/driver/run.ts';

const BROWSER = join(homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const READY = existsSync(BROWSER);
let dir: string;

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-7-driver-')));
  mkdirSync(join(dir, 'site'));
  mkdirSync(join(dir, 'out'));
  writeFileSync(
    join(dir, 'site', 'index.html'),
    `<!doctype html><html lang="en"><body><h1>Noisy</h1><script>
for (let i = 0; i < 300; i++) console.warn('noise ' + i);
fetch('https://example.org/font.css?token=secret').catch(() => null);
Promise.all(Array.from({ length: 250 }, (_, i) => fetch('/api/poll?i=' + i).then((r) => r.json()))).then(() => { document.body.dataset.done = '1'; });
</script></body></html>`,
  );
});
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('the driver with a real browser (C-14)', () => {
  it.runIf(READY)('keeps a noisy page within the contract: the first 200 console lines and simulated answers, the job done', async () => {
    const job: ProbeJob = {
      jobId: 'driver-test',
      mode: 'pages',
      browser: { executablePath: BROWSER, version: '156.0.8078.4' },
      target: { kind: 'static', root: join(dir, 'site'), entry: 'index.html' },
      cells: [
        {
          index: 0,
          state: 'default',
          path: '/',
          viewport: { name: 'desktop', width: 800, height: 600 },
          theme: { value: 'light', activation: { kind: 'none' } },
          lang: { value: 'en', activation: { kind: 'none' } },
          setup: [],
          mock: [{ url: '/api/poll', status: 200, body: { ok: true } }],
          expect: [{ visible: 'body[data-done="1"]' }],
          sensitive: false,
        },
      ],
      measure: { styles: false, fonts: false, rtl: false, axeTags: null, screenshots: false },
      perf: null,
      allowHosts: [],
      outDir: join(dir, 'out'),
      axePath: null,
      cellTimeoutMs: 60_000,
      locale: 'en-US',
      timezone: 'UTC',
    };
    const sent: unknown[] = [];
    // The driver points the process's temporary folder at the job (it is the probe's own process there).
    const tmp = process.env.TMPDIR;
    try {
      await runJob(job, { chromium, emit: (m) => sent.push(m), signal: new AbortController().signal });
    } finally {
      if (tmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = tmp;
    }
    const parsed = sent.map((m) => FromProbe.safeParse(m));
    expect(parsed.filter((p) => !p.success).map((p) => p.error?.issues[0]?.message)).toEqual([]);
    const types = parsed.map((p) => p.data!.type);
    expect(types).toEqual(['started', 'cell', 'done']);
    const cell = (parsed[1]!.data as { result: CellResult }).result;
    expect(cell.error).toBeNull();
    expect(cell.expectations.map((x) => x.ok)).toEqual([true]);
    expect(cell.console.length).toBe(200);
    expect(cell.console[0]?.text).toBe('noise 0');
    expect(cell.mocked.length).toBe(200);
    expect(cell.blocked).toEqual(['GET https://example.org/font.css']);
  }, 120_000);
});
