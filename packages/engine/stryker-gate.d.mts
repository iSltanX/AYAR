// Types of stryker-gate.mjs for its test (the gate itself runs as plain JavaScript after StrykerJS).
export interface ComponentScore {
  id: 'classifier' | 'purity' | 'redaction' | 'planner';
  name: string;
  /** Every file of the component is in the report. */
  measured: boolean;
  detected: number;
  valid: number;
  /** Detected over valid in percent, floored to two decimals; null with no valid mutant. */
  score: number | null;
}
export interface MutationReport {
  files?: Record<string, { mutants?: { status: string }[] }>;
}
export declare const BREAK: number;
export declare const COMPONENTS: readonly { id: ComponentScore['id']; name: string; files: string[] }[];
export declare function componentScores(report: MutationReport): ComponentScore[];
export declare function gate(report: MutationReport, threshold?: number): { ok: boolean; threshold: number; rows: ComponentScore[] };
