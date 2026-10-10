/** وحدة أساسية: حساب مجاميع ومتوسطات. */

export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

export function average(values) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}
