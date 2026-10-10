/** تحقق من مدخلات شائعة. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value) {
  return typeof value === 'string' && EMAIL.test(value);
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function inRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}
