// The project the DEV-11 journey drives (AT-04, AT-08, AT-09, AT-29, AT-43, AT-45): a plain node:test package, so
// it needs nothing installed beyond Node, made in a temporary folder at test time. Its tests pass, fail, take
// their time (the live rows), print terminal colours, bidi controls, markup and a GitHub-shaped token built at run
// time (the profile refuses a secret written in it, C-18), and one line long enough to test that nothing freezes.
// Two custom checks join it: one that fails at once (a final «أخفق» while the run is still «جارٍ») and a slow one.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The folder's name: Arabic with a decomposed letter (آ as ا + U+0653), the NFD spelling (FR-03). */
export const NFD_NAME = 'مشروع-آمن'.normalize('NFD');

export function makeJourneyProject(root: string): string {
  const dir = join(root, NFD_NAME);
  mkdirSync(join(dir, 'test'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'ayar-journey', version: '1.0.0', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2)}\n`);
  writeFileSync(join(dir, 'src', 'add.js'), 'export const add = (a, b) => a + b;\n');
  writeFileSync(
    join(dir, 'test', 'a-fast.test.js'),
    [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      "import { add } from '../src/add.js';",
      '',
      "test('adds two numbers', () => assert.equal(add(2, 3), 5));",
      "test('rejects an expired token', () => {",
      // Built at run time: the profile and the fixture never hold a secret (C-18).
      "  const token = ['gh', 'p_', 'A1b2C3d4E5'.repeat(3), 'abcdef'].join('');",
      "  console.log('GITHUB_TOKEN=' + token);",
      "  console.log('\\u001b[31mred text\\u001b[39m and a bidi override \\u202Egnp.exe\\u202C here');",
      "  console.log('<img src=x onerror=\"window.__ayarXss=1\"> <b>bold</b>');",
      "  console.log('x'.repeat(300000));",
      "  assert.equal(add(2, 2), 5, 'expired token ' + token + ' was accepted');",
      '});',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(dir, 'test', 'b-slow.test.js'),
    [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      "import { add } from '../src/add.js';",
      '',
      'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));',
      'for (let i = 1; i <= 14; i++) {',
      '  test(`waits step ${i}`, async () => {',
      '    await sleep(1000);',
      '    assert.equal(add(i, 0), i);',
      '  });',
      '}',
      '',
    ].join('\n'),
  );
  return dir;
}

/** The two custom checks, as a profile patch (profile.update). */
export const CUSTOM_CHECKS = {
  failfast: { argv: ['sh', '-c', 'echo "fails at once"; exit 1'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } },
  slow: { argv: ['sh', '-c', 'for i in $(seq 1 12); do echo "slow step $i"; sleep 1; done'], cwd: '.', timeoutMin: 2, success: { exitCode: 0 } },
};

/**
 * A login shell for the engine (the `environment.shell` setting, C-07): it exports a PATH with the Node that runs
 * the tests, then runs the command it is given — the developer's own shell files never reach the app.
 */
export function loginShell(root: string): string {
  const path = join(root, 'login-shell');
  writeFileSync(path, `#!/bin/sh\nexport PATH='${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin'\nexec /bin/sh -c "$2"\n`);
  chmodSync(path, 0o755);
  return path;
}
