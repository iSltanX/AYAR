// Test support: fixture variants materialized in a temp folder (G-09), the analyzers' input over them, and a probe
// outcome built by hand for one judge at a time.
import type { Fact, JsonValue } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CellResult } from '../src/contract.ts';
import type { CellMeta, ProbeJudgeInput, ProbeOutcome } from '../src/index.ts';

export const FIXTURES = new URL('../../../fixtures/', import.meta.url).pathname;

export function materialize(project: string, variant: string): { root: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-7-probe-')));
  const root = execFileSync(process.execPath, [join(FIXTURES, 'tools/materialize.mjs'), project, variant, join(dir, 'p')], { encoding: 'utf8' }).trim().split('\n').pop()!;
  return { root, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const SKIP = new Set(['node_modules', '.git', 'dist', '.venv']);
function inventory(root: string, dir = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...inventory(root, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

export function meta(index: number, state: string, o: Partial<CellMeta> = {}): CellMeta {
  return { index, state, path: '/', viewport: 'desktop', theme: 'light', lang: 'ar', sensitive: false, ...o };
}

export function cell(index: number, key: string, o: Partial<CellResult> = {}): CellResult {
  return { index, key, url: 'http://127.0.0.1:1/', error: null, expectations: [], screenshot: null, console: [], blocked: [], allowed: [], failed: [], mocked: [], fonts: null, styles: null, rtl: null, axe: null, perf: null, durationMs: 1, ...o };
}

export function outcome(o: Partial<ProbeOutcome> = {}): ProbeOutcome {
  return {
    mode: 'pages',
    targetKind: 'static',
    targetDir: '.',
    cells: [],
    states: [],
    results: [],
    summary: { browserVersion: '156.0.8078.4', mode: 'headless', density: 1, platform: 'darwin-arm64', extension: null, servedAt: null, durationMs: 1 },
    failure: null,
    comparisons: [],
    conditions: { locale: 'en-US', timezone: 'UTC', reducedMotion: true, density: 1 },
    ...o,
  };
}

export function judgeInput(root: string, checkId: string, out: ProbeOutcome, o: { references?: Record<string, JsonValue>; facts?: Fact[] } = {}): ProbeJudgeInput {
  const abs = (rel: string) => join(root, rel);
  const isFile = (rel: string) => {
    try {
      return lstatSync(abs(rel)).isFile();
    } catch {
      return false;
    }
  };
  return {
    root,
    component: '.',
    checkId,
    files: inventory(root),
    read: (rel) => (isFile(rel) ? readFileSync(abs(rel), 'utf8') : null),
    exists: (rel) => existsSync(abs(rel)),
    size: (rel) => (isFile(rel) ? lstatSync(abs(rel)).size : null),
    listDir: () => null,
    gzipSize: () => null,
    references: o.references ?? {},
    thresholds: null,
    facts: o.facts ?? [],
    cancelled: () => false,
    outcome: out,
  };
}
