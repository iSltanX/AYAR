// AT-30 (part), NFR-07: the lint rule that keeps electron out of packages/** fails on a violating file.
// Each probe is written into a real package source folder, linted with the repository's own configuration
// (eslint.config.js, type-aware), and removed. A clean probe is the negative control.
import { ESLint } from 'eslint';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
let eslint: ESLint;
const written: string[] = [];

async function lintProbe(pkg: string, source: string): Promise<string[]> {
  const file = join(repo, 'packages', pkg, 'src', `__lint_probe_${process.pid}_${written.length}.ts`);
  written.push(file);
  writeFileSync(file, source);
  try {
    const [result] = await eslint.lintFiles([file]);
    if (!result) throw new Error('no lint result');
    const fatal = result.messages.filter((m) => m.fatal);
    if (fatal.length) throw new Error(`lint could not parse the probe: ${fatal.map((m) => m.message).join('; ')}`);
    return result.messages.map((m) => m.ruleId ?? 'fatal');
  } finally {
    rmSync(file, { force: true });
  }
}

beforeAll(() => {
  eslint = new ESLint({ cwd: repo });
});
afterAll(() => {
  for (const f of written) rmSync(f, { force: true });
});

const violations: [string, string, string][] = [
  ['a named import', "import { app } from 'electron';\nexport const name = app.getName();\n", 'no-restricted-imports'],
  ['a default import', "import electron from 'electron';\nexport default electron;\n", 'no-restricted-imports'],
  ['a subpath import', "import { app } from 'electron/main';\nexport default app;\n", 'no-restricted-imports'],
  ['a re-export', "export { app } from 'electron';\n", 'no-restricted-imports'],
  ['an @electron package', "import { flipFuses } from '@electron/fuses';\nexport default flipFuses;\n", 'no-restricted-imports'],
  ['require()', "declare const require: (id: string) => unknown;\nexport const e = require('electron');\n", 'no-restricted-syntax'],
  ['a dynamic import()', "export const load = () => import('electron');\n", 'no-restricted-syntax'],
];

describe('no electron in packages/** (D-19, NFR-07)', () => {
  it.each(violations)('fails the engine on %s', async (_label, source, rule) => {
    expect(await lintProbe('engine', source)).toContain(rule);
  });

  it.each(['protocol', 'i18n'])('fails the sibling package %s too', async (pkg) => {
    expect(await lintProbe(pkg, "import { app } from 'electron';\nexport default app;\n")).toContain('no-restricted-imports');
  });

  it('negative control: a clean engine file passes', async () => {
    const rules = await lintProbe('engine', "import { join } from 'node:path';\nexport const p = join('a', 'b');\n");
    expect(rules).toEqual([]);
  });

  it('the renderer-facing packages are Node-free as well', async () => {
    expect(await lintProbe('protocol', "import { readFileSync } from 'node:fs';\nexport default readFileSync;\n")).toContain('no-restricted-imports');
    expect(await lintProbe('i18n', "import { join } from 'node:path';\nexport default join;\n")).toContain('no-restricted-imports');
  });
});
