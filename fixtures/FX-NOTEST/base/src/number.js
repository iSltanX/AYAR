/** أدوات أعداد. */

export function clamp(value, min, max) {
  if (min > max) throw new RangeError('min must not exceed max');
  return Math.min(Math.max(value, min), max);
}

export function roundTo(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
