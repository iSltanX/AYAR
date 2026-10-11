// @ayar/analyzers (C-13): AYAR's own checks, by catalog runner id, and the inventory of tests and gaps (C-20). One
// line per module (docs/waves/README.md 6).
import { complexityAnalyzer, sizeAnalyzer } from './code.ts';
import type { Analyzer } from './common.ts';
import { fontsAnalyzer, rtlAnalyzer, tokensAnalyzer } from './design.ts';
import { manifestAnalyzer, permissionsAnalyzer } from './manifest.ts';
import { refsAnalyzer } from './refs.ts';

export * from './common.ts';
export * from './manifest.ts';
export * from './refs.ts';
export * from './design.ts';
export * from './code.ts';
export * from './gaps.ts';

/** C-13's table: sec.ext.manifest, sec.ext.permissions, code.refs.local, design.tokens.static, design.fonts.static, design.rtl.static, code.size, code.complexity. */
export const ANALYZERS: readonly Analyzer[] = [manifestAnalyzer, permissionsAnalyzer, refsAnalyzer, tokensAnalyzer, fontsAnalyzer, rtlAnalyzer, sizeAnalyzer, complexityAnalyzer];

const byId = new Map(ANALYZERS.map((a) => [a.id, a]));

export function analyzerById(id: string): Analyzer | undefined {
  return byId.get(id);
}

/** The version of the analyzers as a whole (kept with the evidence, 11.9). */
export const ANALYZERS_VERSION = '1.0.0';
