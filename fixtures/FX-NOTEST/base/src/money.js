/** مبالغ بأصغر وحدة (هللة/سنت) لتجنب أخطاء الفاصلة العائمة. */

export function toMinor(amount, decimals = 2) {
  return Math.round(amount * 10 ** decimals);
}

export function fromMinor(minor, decimals = 2) {
  return minor / 10 ** decimals;
}

export function splitEvenly(totalMinor, parts) {
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError('parts must be a positive integer');
  const base = Math.floor(totalMinor / parts);
  const remainder = totalMinor - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}
