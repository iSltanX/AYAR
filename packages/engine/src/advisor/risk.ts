// 28.2-ب «تقدير الخطر» (assessRisk) and 28.2-ج «العمق» (decideDepth), with the plan's floor (C-20 rule 2) and
// the explanation lines built from the actual inputs (C-20 rule 4): every line names the value it used.
import type { Depth, Explanation, RiskLevel } from '@ayar/protocol';
import { DEPTHS, RISK_LEVELS } from '@ayar/protocol';
import type { KbManifest } from '@ayar/catalog';
import { has, sourceOf, type Effective } from './context.ts';

export interface Risk {
  level: RiskLevel;
  levelIdx: number;
  /** I and L after their adjustments, and R = I × L. */
  impact: number;
  likelihood: number;
  score: number;
  weakPoints: ('reversibility' | 'evidence')[];
  floorApplied: boolean;
  lines: { impact: Explanation[]; likelihood: Explanation[]; detection: Explanation[] };
}

const SCOPE_L = { local: 1, module: 2, wide: 3 } as const;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function assessRisk(e: Effective, algo: KbManifest['algorithm']): Risk {
  const lines: Risk['lines'] = { impact: [], likelihood: [], detection: [] };

  // 1. The consequence I.
  let I: number = e.impact;
  lines.impact.push({ code: 'advisor.line.impact', values: { impact: e.impact, source: sourceOf(e, 'impact') } });
  if (e.audience === 'me' && (I === 2 || I === 3)) {
    I -= 1;
    lines.impact.push({ code: 'advisor.line.impactAudienceMe', values: { audience: e.audience, to: I } });
  }
  if (has(e.areas, 'auth') && e.audience !== 'me' && I < 3) {
    I = 3;
    lines.impact.push({ code: 'advisor.line.impactAuth', values: { audience: e.audience, to: I } });
  }

  // 2. The likelihood L.
  let L: number = SCOPE_L[e.scope];
  lines.likelihood.push({ code: 'advisor.line.likelihoodScope', values: { scope: e.scope, source: sourceOf(e, 'scope'), to: L } });
  if ((e.situation === 'shared_change' || e.situation === 'legacy_assess') && L < 3) {
    L = 3;
    lines.likelihood.push({ code: 'advisor.line.likelihoodSituation', values: { situation: e.situation, to: L } });
  }
  if (e.situation === 'new_project' && L < 2) {
    L = 2;
    lines.likelihood.push({ code: 'advisor.line.likelihoodSituation', values: { situation: e.situation, to: L } });
  }
  if (e.factors.length) {
    const add = e.factors.length >= 3 ? 2 : 1;
    L += add;
    lines.likelihood.push({ code: 'advisor.line.likelihoodFactors', values: { count: e.factors.length, add } });
  }
  if (e.situation === 'cosmetic') {
    L -= 1;
    lines.likelihood.push({ code: 'advisor.line.likelihoodCosmetic', values: { situation: e.situation } });
  }
  L = clamp(L, 1, 4);
  lines.likelihood.push({ code: 'advisor.line.likelihoodFinal', values: { to: L } });

  // 3. Detection: weak points, then R and the level.
  const weakPoints: Risk['weakPoints'] = [];
  if (e.reversibility === 'hard') weakPoints.push('reversibility');
  if (e.evidence === 'none' || e.evidence === 'weak') weakPoints.push('evidence');
  lines.detection.push({ code: 'advisor.line.detectionReversibility', values: { reversibility: e.reversibility, source: sourceOf(e, 'reversibility') } });
  lines.detection.push({ code: 'advisor.line.detectionEvidence', values: { evidence: e.evidence, source: sourceOf(e, 'evidence') } });

  const R = I * L;
  const bands = algo.riskBands;
  let idx = R <= bands.low ? 0 : R <= bands.medium ? 1 : R <= bands.high ? 2 : 3;
  lines.detection.push({ code: 'advisor.line.score', values: { impactAdjusted: I, likelihood: L, score: R, level: RISK_LEVELS[idx]! } });
  if ((weakPoints.length === 2 && I >= 2) || (weakPoints.length === 1 && I >= 3)) {
    const before = idx;
    idx = Math.min(3, idx + 1);
    if (idx !== before) lines.detection.push({ code: 'advisor.line.raised', values: { count: weakPoints.length, impactAdjusted: I, level: RISK_LEVELS[idx]! } });
  }

  // 4. The plan's floor (C-20 rule 2): a consequence of 4 for an audience other than the developer is at least high.
  let floorApplied = false;
  if (e.impact === 4 && e.audience !== 'me' && idx < 2) {
    idx = 2;
    floorApplied = true;
    lines.detection.push({ code: 'advisor.line.floor', values: { impact: e.impact, audience: e.audience } });
  }
  return { level: RISK_LEVELS[idx]!, levelIdx: idx, impact: I, likelihood: L, score: R, weakPoints, floorApplied, lines };
}

export interface DepthDecision {
  id: Depth;
  rank: number;
  notes: Explanation[];
}

const rankOf = (d: Depth) => DEPTHS.indexOf(d);

export function decideDepth(e: Effective, risk: Risk, algo: KbManifest['algorithm']): DepthDecision {
  const notes: Explanation[] = [];
  let d = algo.baseDepth[risk.level] as Depth;
  notes.push({ code: 'advisor.depth.base', values: { level: risk.level, depth: d } });
  const atLeast = (min: Depth, code: string, values: Record<string, string | number>) => {
    if (rankOf(d) < rankOf(min)) {
      d = min;
      notes.push({ code, values: { ...values, depth: d } });
    }
  };
  if (e.situation === 'cosmetic' && risk.level === 'low') {
    d = 'none';
    notes.push({ code: 'advisor.depth.cosmeticNone', values: { situation: e.situation, level: risk.level, depth: d } });
  }
  if (e.situation === 'release') atLeast(e.audience === 'me' ? 'focused_reg' : 'expanded', 'advisor.depth.release', { audience: e.audience });
  if (e.situation === 'legacy_assess') atLeast(risk.impact >= 3 ? 'comprehensive' : 'expanded', 'advisor.depth.legacy', { impactAdjusted: risk.impact });
  if (e.situation === 'deps_upgrade' || e.situation === 'shared_change') atLeast('focused_reg', 'advisor.depth.sharedOrUpgrade', { situation: e.situation });
  if (e.stage === 'proto' && risk.impact !== 4 && rankOf(d) > rankOf('focused_reg')) {
    d = 'focused_reg';
    notes.push({ code: 'advisor.depth.protoCap', values: { stage: e.stage, impactAdjusted: risk.impact, depth: d } });
  }
  return { id: d, rank: rankOf(d), notes };
}
