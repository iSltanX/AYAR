// NFR-04 in code: every pair of the approved contrast tables, recomputed from the generated tokens.css in both
// modes: DES-1 (102 pairs per mode), DES-2 status components (148 per mode) and DES-3 components (the pairs
// Figma exported from the 62 component sets; the required ones). Text 4.5:1, other UI 3:1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrast, tokensFromCss } from './colour.ts';
import { cssName, type Mode } from './design-source.ts';

const doc = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../docs/design/${p}`, import.meta.url)), 'utf8')) as unknown;

interface Pair { table: string; mode: Mode; fg: string; bg: string; min: number }
const pairs: Pair[] = [];
for (const r of (doc('DES-1/tokens.json') as { alternatives: { A: { contrast: [Mode, string, string, string, string, string, number, number, boolean][] } } }).alternatives.A.contrast) {
  pairs.push({ table: 'DES-1', mode: r[0], fg: r[2], bg: r[3], min: r[7] });
}
for (const r of (doc('DES-2/checks.json') as { pairs: [Mode, string, string, string, string, string, number, number, boolean][] }).pairs) {
  pairs.push({ table: 'DES-2', mode: r[0], fg: r[2], bg: r[3], min: r[7] });
}
for (const r of (doc('DES-3/checks.json') as { rowsDetail: { mode: Mode; fg: string; bg: string; min: number; required: boolean }[] }).rowsDetail) {
  if (r.required) pairs.push({ table: 'DES-3', mode: r.mode, fg: r.fg, bg: r.bg, min: r.min });
}

describe('contrast of the approved pairs (NFR-04)', () => {
  const css = { light: tokensFromCss('light'), dark: tokensFromCss('dark') };

  it('covers the three approved tables in both modes', () => {
    const count = (t: string) => pairs.filter((p) => p.table === t).length;
    expect([count('DES-1'), count('DES-2'), count('DES-3')]).toEqual([204, 296, 198]);
  });

  it('meets 4.5:1 for text and 3:1 for other UI, every pair, both modes', () => {
    const failures: string[] = [];
    for (const p of pairs) {
      const fg = css[p.mode].get(cssName(p.fg.split(" ")[0]!));
      const bg = css[p.mode].get(cssName(p.bg.split(" ")[0]!));
      if (!fg || !bg) throw new Error(`${p.table} ${p.mode}: ${p.fg} or ${p.bg} is not in tokens.css`);
      const ratio = contrast(fg, bg);
      if (ratio + 1e-9 < p.min) failures.push(`${p.table} ${p.mode} ${p.fg} on ${p.bg}: ${ratio.toFixed(2)} < ${p.min}`);
    }
    expect(failures).toEqual([]);
    console.log(`contrast: ${pairs.length} pairs checked (DES-1 204, DES-2 296, DES-3 198 required), 0 below the minimum`);
  });
});
