// 28.3: the 55 rules as versioned code (G-37.5, D-DEV8-02). Conditions and weights are functions in the plan,
// so they are code here, tested; their description, reason and the items they may add are data in kb/1
// (rules.json), and a test checks that the two agree rule for rule. R16 is replaced by C-20 rule 5 (G-37.1).
// Each rule is transcribed from the archive expression kept in rules.json (`archiveCondition`, `adds`).
import { any, APPLIES_EXPECTED, has, type Effective } from './context.ts';

export const ADVISOR_RULES_VERSION = '1.0.0';

/** What a depth rule (D01–D04) reads besides the inputs: `x` in 28.3. */
export interface RuleContext {
  depth: string;
  levelIdx: number;
}

export type Weights = Readonly<Record<string, number>>;

export interface Rule {
  /** R01–R51, D01–D04, or C-20.5 (the replacement of R16). */
  id: string;
  /** The kb/1 rule record this implements (R16 for C-20.5). */
  kbRule: string;
  apply(e: Effective, x: RuleContext): Weights | null;
}

const SITS_R04 = ['new_feature', 'change_behavior', 'bugfix', 'new_project', 'refactor', 'shared_change'];
const r = (id: string, when: (e: Effective) => boolean, adds: Weights | ((e: Effective) => Weights)): Rule => ({
  id,
  kbRule: id,
  apply: (e) => (when(e) ? (typeof adds === 'function' ? adds(e) : adds) : null),
});
const d = (id: string, when: (e: Effective, x: RuleContext) => boolean, adds: Weights): Rule => ({
  id,
  kbRule: id,
  apply: (e, x) => (when(e, x) ? adds : null),
});

export const RULES: readonly Rule[] = [
  r('R01', (e) => e.situation !== 'cosmetic', { static_gate: 2 }),
  r('R02', (e) => has(e.factors, 'ai_generated'), { static_gate: 3, unit_logic: 1, exploratory_session: 1 }),
  r('R03', (e) => e.situation === 'bugfix', { confirm_bug: 6, regression_neighbors: 2 }),
  r('R04', (e) => has(e.areas, 'logic') && SITS_R04.includes(e.situation), { unit_logic: 3 }),
  r('R05', (e) => has(e.areas, 'logic') && has(e.factors, 'complex'), { property_logic: 2 }),
  r('R06', (e) => has(e.areas, 'logic') && has(e.areas, 'arabic'), { property_logic: 2 }),
  r('R07', (e) => has(e.platform, 'text') && has(e.areas, 'logic'), { property_logic: 1 }),
  r('R08', (e) => e.situation === 'refactor' && e.evidence !== 'good', { characterization: 6 }),
  r('R09', (e) => e.situation === 'refactor' && e.evidence === 'good', { regression_neighbors: 4 }),
  r('R10', (e) => (e.situation === 'change_behavior' || e.situation === 'shared_change') && e.evidence !== 'good', { characterization: 3 }),
  r('R11', (e) => e.situation === 'shared_change', { regression_full: 4, regression_neighbors: 2 }),
  r('R12', (e) => e.scope === 'wide', { regression_full: 3 }),
  r('R13', (e) => e.scope === 'module', { regression_neighbors: 3 }),
  r('R14', (e) => e.scope === 'local' && e.evidence !== 'none' && e.situation !== 'cosmetic', { regression_neighbors: 2 }),
  r('R15', (e) => has(e.areas, 'data'), { integration_boundary: 3, error_paths: 1 }),
  // R16 → C-20 rule 5: persistent data with a migration found or declared, or with a consequence of 3 or more and a
  // hard rollback, whatever the situation (bugfix included). The archive's weights stay: 6 at consequence 4, else 4.
  {
    id: 'C-20.5',
    kbRule: 'R16',
    apply: (e) => (has(e.areas, 'data') && (e.migrations || (e.impact >= 3 && e.reversibility === 'hard')) ? { migration_rehearsal: e.impact >= 4 ? 6 : 4 } : null),
  },
  r('R17', (e) => has(e.areas, 'external'), { integration_boundary: 3, contract_api: 2, error_paths: 3 }),
  r('R18', (e) => has(e.platform, 'api') && ['change_behavior', 'shared_change', 'deps_upgrade'].includes(e.situation), { contract_api: 3 }),
  r('R19', (e) => has(e.areas, 'auth'), (e) => ({ security_authz: e.audience === 'me' ? 2 : 5 })),
  r('R20', (e) => has(e.areas, 'input'), (e) => ({ security_input: e.audience === 'public' ? 5 : 3 })),
  r('R21', (e) => has(e.areas, 'input') && has(e.factors, 'ai_generated'), { security_input: 2 }),
  r('R22', (e) => e.situation === 'deps_upgrade', { security_deps: 3, build_config: 3, compat_matrix: 3, regression_full: 4 }),
  r('R23', (e) => e.situation === 'release', { regression_full: 4, smoke_release: 5, exploratory_session: 3, risk_inventory: 2 }),
  r('R24', (e) => e.situation === 'release' && e.audience !== 'me', { security_deps: 3, e2e_critical: 4 }),
  r('R25', (e) => e.situation === 'release' && e.audience !== 'me' && (has(e.areas, 'ui') || any(e.platform, ['web', 'mobile', 'desktop', 'theme'])), { a11y_check: 2, compat_matrix: 2 }),
  r('R26', (e) => has(e.areas, 'ui') && ['new_feature', 'change_behavior', 'shared_change', 'new_project'].includes(e.situation), { component_ui: 3 }),
  r('R27', (e) => has(e.areas, 'ui'), (e): Weights => (e.situation !== 'cosmetic' ? { visual_check: 2, exploratory_session: 1 } : { visual_check: 2 })),
  r('R28', (e) => has(e.areas, 'ui') && e.audience !== 'me' && e.situation !== 'cosmetic', (e) => ({ a11y_check: e.audience === 'public' ? 4 : 3 })),
  r('R29', (e) => has(e.areas, 'arabic'), (e) => ({ arabic_rtl: e.situation === 'cosmetic' ? 2 : 5 })),
  r('R30', (e) => has(e.areas, 'ui') && has(e.areas, 'arabic'), { visual_check: 1 }),
  r('R31', (e) => has(e.areas, 'perf'), { perf_budget: 4 }),
  r('R32', (e) => has(e.areas, 'perf') && has(e.platform, 'api') && e.audience === 'public', { load_test: 3 }),
  r('R33', (e) => has(e.areas, 'config'), { build_config: 4, smoke_release: 2 }),
  r('R34', (e) => has(e.areas, 'compat'), { compat_matrix: 4 }),
  r('R35', (e) => any(e.platform, ['plugin', 'theme']) && (e.situation === 'deps_upgrade' || e.situation === 'release'), { compat_matrix: 2 }),
  r('R36', (e) => e.impact >= 3 && has(e.areas, 'ui'), { e2e_critical: 3 }),
  r('R37', (e) => e.impact >= 3 && ['new_feature', 'change_behavior', 'shared_change', 'release'].includes(e.situation), { exploratory_session: 2 }),
  r('R38', (e) => APPLIES_EXPECTED.includes(e.situation), (e) => ({ acceptance_examples: e.expected === 'vague' ? 6 : e.expected === 'clear' ? 2 : 4 })),
  r('R39', (e) => e.situation === 'new_project', { risk_inventory: 4, static_gate: 2, test_health: 3 }),
  r('R40', (e) => e.situation === 'legacy_assess', { risk_inventory: 6, characterization: 4, e2e_critical: 3, security_deps: 3, test_health: 3, exploratory_session: 3 }),
  r('R41', (e) => e.flaky, { test_health: 5 }),
  r('R42', (e) => (e.automation === 'none' || e.automation === 'manual') && e.frequency === 'frequent', { test_health: 3 }),
  r('R43', (e) => has(e.factors, 'defect_history'), (e): Weights => (has(e.areas, 'logic') ? { exploratory_session: 2, regression_neighbors: 1, property_logic: 1 } : { exploratory_session: 2, regression_neighbors: 1 })),
  r('R44', (e) => has(e.factors, 'async'), { error_paths: 2 }),
  r('R45', (e) => has(e.factors, 'unfamiliar'), (e): Weights => (e.situation !== 'new_feature' && e.situation !== 'new_project' ? { exploratory_session: 1, characterization: 1 } : { exploratory_session: 1 })),
  r('R46', (e) => e.situation === 'cosmetic', { visual_check: 2 }),
  r('R47', (e) => has(e.platform, 'theme') && e.situation !== 'cosmetic', { visual_check: 3, a11y_check: 1 }),
  r('R48', (e) => has(e.platform, 'mobile') && e.situation === 'release', { compat_matrix: 2, smoke_release: 1 }),
  r('R49', (e) => has(e.platform, 'library') && (e.situation === 'change_behavior' || e.situation === 'shared_change'), { regression_full: 2, acceptance_examples: 2 }),
  r('R50', (e) => !e.areas.length && !['legacy_assess', 'new_project', 'release', 'cosmetic'].includes(e.situation), { regression_neighbors: 2, exploratory_session: 2 }),
  r('R51', (e) => (e.stage === 'released' || e.stage === 'maintenance') && e.situation !== 'cosmetic', { regression_neighbors: 1 }),
  d('D01', (_e, x) => x.depth === 'comprehensive', { risk_inventory: 4, exploratory_session: 2, regression_full: 2, security_deps: 1 }),
  d('D02', (_e, x) => x.depth === 'expanded', { regression_full: 2, exploratory_session: 1 }),
  d('D04', (e, x) => x.depth === 'comprehensive' && (has(e.areas, 'ui') || any(e.platform, ['web', 'mobile', 'desktop', 'plugin', 'theme'])), { e2e_critical: 3 }),
  d('D03', (e, x) => x.levelIdx >= 2 && has(e.areas, 'ui'), { e2e_critical: 2 }),
];
