/** إحصاءات رقمية بسيطة. */

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort();
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
