// A line diff for the export preview (FR-12 «بعد معاينة الفرق»): the longest common subsequence of lines, as
// kept (=), added (+) and removed (-) lines. Profiles are small; the table is bounded.
export interface DiffLine {
  op: '=' | '+' | '-';
  line: string;
}

const MAX_LINES = 4000;

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.length ? before.replace(/\n$/, '').split('\n') : [];
  const b = after.length ? after.replace(/\n$/, '').split('\n') : [];
  if (a.length > MAX_LINES || b.length > MAX_LINES) return [...a.map((line) => ({ op: '-' as const, line })), ...b.map((line) => ({ op: '+' as const, line }))];
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: '=', line: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ op: '-', line: a[i++]! });
    else out.push({ op: '+', line: b[j++]! });
  }
  while (i < n) out.push({ op: '-', line: a[i++]! });
  while (j < m) out.push({ op: '+', line: b[j++]! });
  return out;
}
