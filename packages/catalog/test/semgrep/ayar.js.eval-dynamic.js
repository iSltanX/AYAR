// Test project of ayar.js.eval-dynamic (semgrep --test): a match on each `ruleid:` line, none on `ok:` lines.
export function run(userInput) {
  // ruleid: ayar.js.eval-dynamic
  return eval(userInput);
}

export function viaWindow(code) {
  // ruleid: ayar.js.eval-dynamic
  window.eval(code);
  // ruleid: ayar.js.eval-dynamic
  globalThis.eval(`${code}`);
}

export function constant() {
  // ok: ayar.js.eval-dynamic
  return eval("1 + 1");
}

export function notEval(x) {
  // ok: ayar.js.eval-dynamic
  return evaluate(x);
}
