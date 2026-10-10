// Test project of ayar.js.function-constructor.
export function build(body) {
  // ruleid: ayar.js.function-constructor
  const f = new Function('a', body);
  // ruleid: ayar.js.function-constructor
  const g = Function(body);
  return [f, g];
}

export function constant() {
  // ok: ayar.js.function-constructor
  return new Function('a', 'return a + 1');
}
