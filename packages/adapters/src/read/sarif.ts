// C-15 «قارئ لمجموعة جزئية من SARIF 2.1.0»: the runs, each with its tool's name (without it, results cannot be
// attributed: «تعذّر»), and their results — rule id, level, message, and the first physical location (artifact URI
// and region). Fingerprints in SARIF are ignored (S-42: absent or restricted in some tools); AYAR computes its own.
import { arr, problem, readJson, rec, str, type Read } from './guards.ts';

export interface SarifResult {
  tool: string;
  ruleId: string;
  level: 'error' | 'warning' | 'note' | 'none';
  message: string;
  uri: string | null;
  line: number | null;
  column: number | null;
  endLine: number | null;
}

const LEVELS = ['error', 'warning', 'note', 'none'] as const;

export function readSarif(text: string, file: string): Read<{ results: SarifResult[]; tools: string[] }> {
  const j = readJson(text, file);
  if (!j.ok) return j;
  const root = rec(j.value);
  if (str(root.version) !== '2.1.0') return problem('unsupported', file, `SARIF version ${str(root.version, 'missing')}; AYAR reads 2.1.0`);
  if (!Array.isArray(root.runs)) return problem('incomplete', file, 'runs is missing');
  const results: SarifResult[] = [];
  const tools: string[] = [];
  for (const [n, run] of arr(root.runs).entries()) {
    const tool = str(rec(rec(rec(run).tool).driver).name);
    if (!tool) return problem('incomplete', file, `runs[${n}].tool.driver.name is missing: the results cannot be attributed to a tool`);
    tools.push(tool);
    for (const r of arr(rec(run).results)) {
      const res = rec(r);
      const loc = rec(rec(arr(res.locations)[0]).physicalLocation);
      const region = rec(loc.region);
      const level = str(res.level, 'warning');
      const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);
      results.push({
        tool,
        ruleId: str(res.ruleId, str(rec(res.rule).id)),
        level: (LEVELS as readonly string[]).includes(level) ? (level as SarifResult['level']) : 'warning',
        message: str(rec(res.message).text),
        uri: str(rec(loc.artifactLocation).uri) || null,
        line: int(region.startLine),
        column: int(region.startColumn),
        endLine: int(region.endLine),
      });
    }
  }
  return { ok: true, value: { results, tools } };
}
