/** نسب مئوية. */

export function percentOf(part, whole) {
  return whole === 0 ? 0 : (part / whole) * 100;
}

export function applyPercent(value, percent) {
  return value * (1 + percent / 100);
}

export function formatPercent(ratio, digits = 1) {
  return `${(ratio * 100).toFixed(digits)}%`;
}
