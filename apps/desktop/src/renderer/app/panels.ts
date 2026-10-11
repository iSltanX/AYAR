// The section panels' data (13.3 «لوحات خاصة بكل قسم», screens 10–15): for one instance's latest execution, its
// findings (results.query, excluded ones too: D-35 never hides them) and its unified report without its findings
// (check.report: counts, signals, the reader's facts, the outputs it wrote with their sizes). Read once per
// execution; the panels arrange them and never add a judgement of their own.
import type { CheckReport, Finding } from '@ayar/protocol';
import { attempt } from './client.ts';
import type { LatestExecution, SectionModel } from './sections.ts';

export interface CheckData {
  exec: LatestExecution;
  findings: Finding[];
  report: CheckReport | null;
}

export async function loadCheckData(projectId: string, exec: LatestExecution): Promise<CheckData> {
  const checkRunId = exec.check.checkRunId;
  const [q, r] = await Promise.all([attempt('results.query', { projectId, filters: { checkRunId, includeExcluded: true, limit: 1000 } }), attempt('check.report', { checkRunId })]);
  return { exec, findings: q.ok ? q.result.findings : [], report: r.ok ? r.result : null };
}

/** Every applicable instance of a check id in the section (one per component), with its latest data when it ran. */
export async function loadPanelData(projectId: string, model: SectionModel, checkIds: readonly string[]): Promise<Map<string, CheckData[]>> {
  const out = new Map<string, CheckData[]>();
  await Promise.all(
    checkIds.map(async (checkId) => {
      const execs = [...model.latest.values()].filter((e) => e.check.checkId === checkId);
      out.set(checkId, await Promise.all(execs.map((e) => loadCheckData(projectId, e))));
    }),
  );
  return out;
}

/** Groups items by a key, the groups in the order their first item appears. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return [...m.entries()];
}

/** The part of a tool's message before its first «: » (a function, a reference, a package), and the rest. */
export function messageParts(message: string): { head: string; rest: string } {
  const at = message.indexOf(': ');
  return at < 0 ? { head: message, rest: '' } : { head: message.slice(0, at), rest: message.slice(at + 2) };
}

/** A number from a finding's expected or actual value, or null. */
export function numberOf(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
