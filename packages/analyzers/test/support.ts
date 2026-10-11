// Test support: a fixture variant materialized in a temp folder (G-09: never run in fixtures/), and an analyzer
// input over it read from the disk the way the engine's worker reads it (bounded, no link followed).
import type { Fact, JsonValue } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import type { AnalyzerInput } from '../src/index.ts';

export const FIXTURES = new URL('../../../fixtures/', import.meta.url).pathname;

export function materialize(project: string, variant: string): { root: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-6-analyzers-')));
  const root = execFileSync(process.execPath, [join(FIXTURES, 'tools/materialize.mjs'), project, variant, join(dir, 'p')], { encoding: 'utf8' }).trim().split('\n').pop()!;
  return { root, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const SKIP = new Set(['node_modules', '.git', 'dist', '.venv']);

export function inventory(root: string, dir = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...inventory(root, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

export function input(root: string, o: { checkId: string; component?: string; facts?: Fact[]; references?: Record<string, JsonValue>; thresholds?: Record<string, unknown> | null }): AnalyzerInput {
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
    component: o.component ?? '.',
    checkId: o.checkId,
    files: inventory(root),
    read: (rel) => (isFile(rel) ? readFileSync(abs(rel), 'utf8') : null),
    exists: (rel) => existsSync(abs(rel)),
    size: (rel) => (isFile(rel) ? lstatSync(abs(rel)).size : null),
    listDir: (rel) => {
      if (!existsSync(abs(rel))) return null;
      const walk = (d: string): string[] => readdirSync(abs(d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(posix.join(d, e.name)) : e.isFile() ? [posix.join(d, e.name)] : []));
      return walk(rel);
    },
    gzipSize: (rel) => (isFile(rel) ? gzipSync(readFileSync(abs(rel))).length : null),
    references: o.references ?? {},
    thresholds: o.thresholds ?? null,
    facts: o.facts ?? [],
    cancelled: () => false,
  };
}

export function fact(key: string, value: JsonValue, component = '.'): Fact {
  return { key, component, value, source: null, proof: 'declared', detector: 'test@1' };
}
