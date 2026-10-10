# سلامة المشاريع: نتيجة تشغيل كل نسخة بأداتها الأصلية

> مولَّد آليًّا بـ `node fixtures/tools/sanity.mjs report` من `fixtures/sanity-results/*.json`، ولا يُحرَّر يدويًّا. كل صف: الأمر الحرفي، ورمز الخروج الفعلي، وما يثبته. «✓» يعني أن الخرج الفعلي طابق ما يعلنه ملف التوقع، و«⏸» يعني «لم يُشغَّل» بسببه.

## FX-ADAPTERS

تاريخ آخر تشغيل: 2026-10-10

الأدوات: node `v24.16.0`، pnpm `12.8.1`، uv `uv 0.13.0 (4ecd0eff2 2026-10-09 aarch64-apple-darwin)`، semgrep `1.180.0`، osv-scanner `osv-scanner version: 2.6.0`، lychee `lychee 0.24.2`، gitleaks `8.30.1`

### good:vitest

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| vitest | `pnpm exec vitest run` | 0 | ✓ | beh.unit: اجتاز |

<details><summary>vitest</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-8agnby/p/vitest


 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  11:21:04
   Duration  87ms (transform 51%, import 28%, worker 15%, tests 6%)
```

</details>

### vitest--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| vitest | `pnpm exec vitest run` | 1 | ✓ | beh.unit: أخفق (منشأ المشروع) |

<details><summary>vitest</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-FjHy2L/p/vitest

 ❯ test/add.test.js (1 test | 1 failed) 3ms
   × يجمع عددين 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/add.test.js > يجمع عددين
AssertionError: expected 5 to be 6 // Object.is equality

- Expected
+ Received

- 6
+ 5

 ❯ test/add.test.js:5:21
      3|
      4| it('يجمع عددين', () => {
      5|   expect(add(2, 3)).toBe(6);
       |                     ^
      6| });
      7|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  11:21:05
   Duration  84ms (transform 45%, import 24%, tests 18%, worker 13%)
```

</details>

### vitest--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| vitest | `pnpm exec vitest run` | 1 | ✓ | beh.unit: تعذّر (منشأ الأداة) |

<details><summary>vitest</summary>

```text
MISSING DEPENDENCY  Cannot find dependency 'vitest-environment-no-such-environment'


 RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-3HPqtn/p/vitest

⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors t
… [اقتُطع] …
dules/.pnpm/vitest@5.0.3_vite@8.3.4/node_modules/vitest/dist/chunks/base.DhkQeZwd.js:158:34
 ❯ process.onMessage node_modules/.pnpm/vitest@5.0.3_vite@8.3.4/node_modules/vitest/dist/chunks/init.D0qF-GGk.js:288:23

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯


 Test Files  no tests
      Tests  no tests
     Errors  1 error
   Start at  11:21:07
   Duration  62ms
```

</details>

### vitest--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| vitest | `pnpm exec vitest run` | 1 | ✓ | beh.unit: ناقص |

<details><summary>vitest</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-xQ7wND/p/vitest

No test files found, exiting with code 1

include: test/**/*.test.js
exclude:  **/node_modules/**, **/.git/**
```

</details>

### vitest--timeout

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| vitest | `pnpm exec vitest run` | مهلة | ✓ | beh.unit: انتهت المهلة |

<details><summary>vitest</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-eouKmk/p/vitest
```

</details>

### vitest--conflict

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| vitest | `pnpm exec vitest run` | 0 | ✓ | beh.unit: تعارض الأدلة (خروج 0 مع إخفاق) |

<details><summary>vitest</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-eDxuOe/p/vitest

 ❯ test/add.test.js (1 test | 1 failed) 3ms
   × يجمع عددين 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/add.test.js > يجمع عددين
AssertionError: expected 5 to be 6 // Object.is equality

- Expected
+ Received

- 6
+ 5

 ❯ test/add.test.js:5:21
      3|
      4| it('يجمع عددين', () => {
      5|   expect(add(2, 3)).toBe(6);
       |                     ^
      6| });
      7|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  11:21:21
   Duration  83ms (transform 30%, import 29%, tests 23%, worker 18%)
```

</details>

### good:jest

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| jest | `pnpm exec jest --ci` | 0 | ✓ | beh.unit: اجتاز |

<details><summary>jest</summary>

```text
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        0.224 s
Ran all test suites.
```

</details>

### jest--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| jest | `pnpm exec jest --ci` | 1 | ✓ | beh.unit: أخفق |

<details><summary>jest</summary>

```text
FAIL test/add.test.js
  ● يجمع عددين

    expect(received).toBe(expected) // Object.is equality

    Expected: 6
    Received: 5

      2 |
      3 | test('يجمع عددين', () => {
    > 4 |   expect(add(2, 3)).toBe(6);
        |                     ^
      5 | });
      6 |

      at Object.toBe (test/add.test.js:4:21)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 total
Snapshots:   0 total
Time:        0.204 s
Ran all test suites.
```

</details>

### jest--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| jest | `pnpm exec jest --ci` | 1 | ✓ | beh.unit: تعذّر |

<details><summary>jest</summary>

```text
● Validation Error:

  Test environment no-such-environment cannot be found. Make sure the testEnvironment configuration option points to an existing node module.

  Configuration Documentation:
  https://jestjs.io/docs/configuration
```

</details>

### jest--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| jest | `pnpm exec jest --ci` | 1 | ✓ | beh.unit: ناقص |

<details><summary>jest</summary>

```text
No tests found, exiting with code 1
Run with `--passWithNoTests` to exit with code 0
In /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-BDROYv/p/jest
  3 files checked.
  testMatch: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-BDROYv/p/jest/test/**/*.test.js - 0 matches
  testPathIgnorePatterns: /node_modules/ - 3 matches
  testRegex:  - 0 matches
Pattern:  - 0 matches
```

</details>

### jest--timeout

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| jest | `pnpm exec jest --ci` | مهلة | ✓ | beh.unit: انتهت المهلة |

### good:node-test

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| node-test | `node --test` | 0 | ✓ | beh.unit: اجتاز |

<details><summary>node-test</summary>

```text
✔ يجمع عددين (0.27525ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 39.330041
```

</details>

### node-test--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| node-test | `node --test` | 1 | ✓ | beh.unit: أخفق |

<details><summary>node-test</summary>

```text
✖ يجمع عددين (0.562042ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 39.29575

✖ failing tests:

test at test/add.test.js:5:1
✖ يجمع عددين (0.562042ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  5 !== 6
  
      at TestContext.<anonymous> (file:///private/var/folders/39/
… [اقتُطع] …
ks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 5,
    expected: 6,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

</details>

### node-test--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| node-test | `node --test` | 0 | ✓ | beh.unit: ناقص (خروج 0 وصفر اختبار) |

<details><summary>node-test</summary>

```text
ℹ tests 0
ℹ suites 0
ℹ pass 0
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5.241542
```

</details>

### node-test--timeout

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| node-test | `node --test` | مهلة | ✓ | beh.unit: انتهت المهلة |

### good:playwright

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| playwright | `pnpm exec playwright test` | 0 | ✓ | beh.e2e: اجتاز |

<details><summary>playwright</summary>

```text
Running 1 test using 1 worker

(node:23695) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  1 tests/basic.spec.js:4:1 › يجمع عددين (1ms)

  1 passed (213ms)
```

</details>

### playwright--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| playwright | `pnpm exec playwright test` | 1 | ✓ | beh.e2e: أخفق |

<details><summary>playwright</summary>

```text
Running 1 test using 1 worker

(node:23732) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✘  1 tests/basic.spec.js:4:1 › يجمع عددين (3ms)


  1) tests/basic.spec.js:4:1 › يجمع عددين ──────────────────────────────────────────────────────────

 
… [اقتُطع] …
     ^
      6 | });
      7 |
        at /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-NYYc05/p/playwright/tests/basic.spec.js:5:17

    Error Context: test-results/basic-يجمع-عددين/error-context.md

  1 failed
    tests/basic.spec.js:4:1 › يجمع عددين ───────────────────────────────────────────────────────────
```

</details>

### playwright--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| playwright | `pnpm exec playwright test` | 1 | ✓ | beh.e2e: تعذّر |

<details><summary>playwright</summary>

```text
SyntaxError: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-dNcOoD/p/playwright/playwright.config.js: Unexpected token (6:13)

  4 |   testDir: 'tests',
  5 |   reporter: 'list',
> 6 |   retries: 0,,
    |              ^
  7 | });
  8 |
    at constructor (/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T
… [اقتُطع] …
ymous> (/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-dNcOoD/p/playwright/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/lib/program.js:55:7) {
  code: 'BABEL_PARSE_ERROR',
  reasonCode: 'UnexpectedToken',
  loc: Position { line: 6, column: 13, index: 133 },
  pos: 133,
  syntaxPlugin: undefined
}
```

</details>

### playwright--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| playwright | `pnpm exec playwright test` | 1 | ✓ | beh.e2e: ناقص |

<details><summary>playwright</summary>

```text
Error: No tests found
```

</details>

### playwright--timeout

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| playwright | `pnpm exec playwright test` | مهلة | ✓ | beh.e2e: انتهت المهلة |

<details><summary>playwright</summary>

```text
Running 1 test using 1 worker

(node:23835) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
```

</details>

### good:eslint

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| eslint | `pnpm exec eslint src` | 0 | ✓ | code.lint: اجتاز |

### eslint--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| eslint | `pnpm exec eslint src` | 1 | ✓ | code.lint: أخفق |

<details><summary>eslint</summary>

```text
/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-ff4gke/p/eslint/src/a.js
  2:9  error  'unused' is assigned a value but never used  no-unused-vars

✖ 1 problem (1 error, 0 warnings)
```

</details>

### eslint--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| eslint | `pnpm exec eslint src` | 2 | ✓ | code.lint: تعذّر (رمز 2) |

<details><summary>eslint</summary>

```text
Oops! Something went wrong! :(

ESLint: 10.12.0

TypeError: Key "rules": Key "no-such-rule-xyz": Could not find "no-such-rule-xyz" in plugin "@".
    at throwRuleNotFoundError (/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-8gHR43/p/eslint/node_modules/.pnpm/eslint@10.12.0/node_modules/eslint/lib/config/config.j
… [اقتُطع] …
00gn/T/ayar-fx-sanity-FX-ADAPTERS-8gHR43/p/eslint/node_modules/.pnpm/@humanfs+core@0.19.2/node_modules/@humanfs/core/src/hfs.js:614:3)
    at async globSearch (/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-8gHR43/p/eslint/node_modules/.pnpm/eslint@10.12.0/node_modules/eslint/lib/eslint/eslint-helpers.js:366:20)
```

</details>

### eslint--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| eslint | `pnpm exec eslint src` | 2 | ✓ | code.lint: تعذّر (لا مدخلات، رمز 2) |

<details><summary>eslint</summary>

```text
Oops! Something went wrong! :(

ESLint: 10.12.0

You are linting "src", but all of the files matching the glob pattern "src" are ignored.

If you don't want to lint these files, remove the pattern "src" from the list of arguments passed to ESLint.

If you do want to lint these files, explicitly list one or more of the files from this glob that you'
… [اقتُطع] …
ignored because no matching configuration was supplied, check file patterns in your config file.
    https://eslint.org/docs/latest/use/configure/configuration-files#specify-files-with-arbitrary-extensions

  * If the file is ignored because it is located outside of the base path, change the location of your config file to be in a parent directory.
```

</details>

### eslint--timeout

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| eslint | `pnpm exec eslint src` | مهلة | ✓ | code.lint: انتهت المهلة |

### good:biome

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| biome | `pnpm exec biome lint src` | 0 | ✓ | code.lint: اجتاز |

<details><summary>biome</summary>

```text
Checked 1 file in 6ms. No fixes applied.
```

</details>

### biome--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| biome | `pnpm exec biome lint src` | 1 | ✓ | code.lint: أخفق |

<details><summary>biome</summary>

```text
src/a.js:2:3 lint/suspicious/noDebugger  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × This is an unexpected use of the debugger statement.
  
    1 │ export function f() {
  > 2 │   debugger;
      │   ^^^^^^^^^
    3 │   return 2;
    4 │ }
  
  i Unsafe fix: Remove debugger statement
  
    1 1 │   export function f() {
    2   │ - ··debugger;
    3 2 │     return 2;
    4 3 │   }
  

Checked 1 file in 6ms. No fixes applied.
Found 1 error.
lint ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
```

</details>

### biome--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| biome | `pnpm exec biome lint src` | 1 | ✓ | code.lint: تعذّر |

<details><summary>biome</summary>

```text
/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-YL7E0R/p/biome/biome.json:4:5 deserialize ━━━━━━━━━━

  × Found an unknown key `rulez`.
  
    2 │   "linter": {
    3 │     "enabled": true,
  > 4 │     "rulez": {
      │     ^^^^^^^
    5 │       "recommended": true
    6 │     }
  
  i Known keys:
  
  - enabled
  - rules
  - includes
  - domains
  

configuration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Biome exited because the configuration resulted in errors. Please fix them.
```

</details>

### biome--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| biome | `pnpm exec biome lint src` | 1 | ✓ | code.lint: لا مدخلات (رمز 1) |

<details><summary>biome</summary>

```text
Checked 0 files in 1303µs. No fixes applied.
lint ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × No files were processed in the specified paths.
  
  i Check your biome.json or biome.jsonc to ensure the paths are not ignored by the configuration.
  
  i These paths were provided but ignored:
  
  - src
```

</details>

### good:tsc

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tsc | `pnpm exec tsc --noEmit -p tsconfig.json --pretty false` | 0 | ✓ | code.types: اجتاز |

### tsc--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tsc | `pnpm exec tsc --noEmit -p tsconfig.json --pretty false` | 2 | ✓ | code.types: أخفق (TS6133) |

<details><summary>tsc</summary>

```text
src/index.ts(2,9): error TS6133: 'unused' is declared but its value is never read.
```

</details>

### tsc--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tsc | `pnpm exec tsc --noEmit -p tsconfig.json --pretty false` | 2 | ✓ | code.types: تعذّر (TS5083) |

<details><summary>tsc</summary>

```text
error TS5083: Cannot read file '/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-v4yn9U/p/tsc/missing-base.json'.
```

</details>

### tsc--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tsc | `pnpm exec tsc --noEmit -p tsconfig.json --pretty false` | 2 | ✓ | code.types: تعذّر (TS18003) |

<details><summary>tsc</summary>

```text
error TS18003: No inputs were found in config file '/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-A37rPV/p/tsc/tsconfig.json'. Specified 'include' paths were '["src"]' and 'exclude' paths were '[]'.
```

</details>

### good:knip

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| knip | `pnpm exec knip` | 0 | ✓ | code.unused: اجتاز |

<details><summary>knip</summary>

```text
Configuration hints (1)
src/index.js    knip.json  Remove redundant entry pattern
```

</details>

### knip--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| knip | `pnpm exec knip` | 1 | ✓ | code.unused: أخفق (ملف غير مستخدم) |

<details><summary>knip</summary>

```text
Unused files (1)
src/orphan.js
Configuration hints (1)
src/index.js    knip.json  Remove redundant entry pattern
```

</details>

### knip--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| knip | `pnpm exec knip` | 2 | ✓ | code.unused: تعذّر (رمز 2) |

<details><summary>knip</summary>

```text
ERROR: Invalid input (location: entry)
```

</details>

### good:pyright

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pyright | `pnpm exec pyright` | 0 | ✓ | code.types: اجتاز |

<details><summary>pyright</summary>

```text
0 errors, 0 warnings, 0 informations
```

</details>

### pyright--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pyright | `pnpm exec pyright` | 1 | ✓ | code.types: أخفق |

<details><summary>pyright</summary>

```text
/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-phtSIR/p/pyright/src/a.py
  /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-phtSIR/p/pyright/src/a.py:5:17 - error: Argument of type "Literal['2']" cannot be assigned to parameter "n" of type "int" in function "double"
    "Literal['2']" is not assignable to "int" (reportArgumentType)
1 error, 0 warnings, 0 informations
```

</details>

### pyright--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pyright | `pnpm exec pyright` | 3 | ✓ | code.types: تعذّر (رمز 3) |

<details><summary>pyright</summary>

```text
Config file "/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-bDDgLk/p/pyright/pyrightconfig.json" could not be parsed. Verify that format is correct.
0 errors, 0 warnings, 0 informations
```

</details>

### pyright--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pyright | `pnpm exec pyright` | 0 | ✓ | code.types: ناقص (رمز 0 بلا ملفات مصدر) |

<details><summary>pyright</summary>

```text
0 errors, 0 warnings, 0 informations
```

</details>

### good:pytest

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pytest | `.venv/bin/python -m pytest -p no:cacheprovider` | 0 | ✓ | beh.unit: اجتاز |

<details><summary>pytest</summary>

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
rootdir: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-UzULyZ/p/pytest
configfile: pyproject.toml
testpaths: tests
collected 1 item

tests/test_add.py .                                                      [100%]

============================== 1 passed in 0.00s ===============================
```

</details>

### pytest--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pytest | `.venv/bin/python -m pytest -p no:cacheprovider` | 1 | ✓ | beh.unit: أخفق |

<details><summary>pytest</summary>

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
rootdir: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-vlktwz/p/pytest
configfile: pyproject.toml
testpaths: tests
collected 1 item

tests/test_add.py F                 
… [اقتُطع] …
 assert add(2, 3) == 6
E       assert 5 == 6
E        +  where 5 = add(2, 3)

tests/test_add.py:5: AssertionError
=========================== short test summary info ============================
FAILED tests/test_add.py::test_add - assert 5 == 6
 +  where 5 = add(2, 3)
============================== 1 failed in 0.01s ===============================
```

</details>

### pytest--collection-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pytest | `.venv/bin/python -m pytest -p no:cacheprovider` | 2 | ✓ | beh.unit: أخفق (خطأ جمع، رمز 2، منشأ المشروع) |

<details><summary>pytest</summary>

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
rootdir: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-Gx9bbG/p/pytest
configfile: pyproject.toml
testpaths: tests
collected 0 items / 1 error

=========================
… [اقتُطع] …
ef test_add() -> None
E                             ^
E   SyntaxError: expected ':'
=========================== short test summary info ============================
ERROR tests/test_add.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
=============================== 1 error in 0.07s ===============================
```

</details>

### pytest--usage-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pytest | `.venv/bin/python -m pytest -p no:cacheprovider` | 4 | ✓ | beh.unit: تعذّر (رمز 4) |

<details><summary>pytest</summary>

```text
ERROR: usage: python -m pytest [options] [file_or_dir] [file_or_dir] [...]
python -m pytest: error: unrecognized arguments: --no-such-option
  inifile: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-38HsxU/p/pytest/pyproject.toml
  rootdir: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-38HsxU/p/pytest
```

</details>

### pytest--no-tests

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pytest | `.venv/bin/python -m pytest -p no:cacheprovider` | 5 | ✓ | beh.unit: ناقص (رمز 5) |

<details><summary>pytest</summary>

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
rootdir: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-hyESfX/p/pytest
configfile: pyproject.toml
testpaths: tests
collected 0 items

============================ no tests ran in 0.00s =============================
```

</details>

### pytest--timeout

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pytest | `.venv/bin/python -m pytest -p no:cacheprovider` | مهلة | ✓ | beh.unit: انتهت المهلة |

<details><summary>pytest</summary>

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
rootdir: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-rmF0dG/p/pytest
configfile: pyproject.toml
testpaths: tests
collected 1 item

tests/test_add.py
```

</details>

### pytest--conflict

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| pytest | `.venv/bin/python -m pytest -p no:cacheprovider` | 0 | ✓ | beh.unit: تعارض الأدلة (خروج 0 مع إخفاق) |

<details><summary>pytest</summary>

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
rootdir: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-Mo6mhc/p/pytest
configfile: pyproject.toml
testpaths: tests
collected 1 item

tests/test_add.py F                 
… [اقتُطع] …
 assert add(2, 3) == 6
E       assert 5 == 6
E        +  where 5 = add(2, 3)

tests/test_add.py:5: AssertionError
=========================== short test summary info ============================
FAILED tests/test_add.py::test_add - assert 5 == 6
 +  where 5 = add(2, 3)
============================== 1 failed in 0.01s ===============================
```

</details>

### good:ruff

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| ruff | `.venv/bin/ruff check --no-cache src` | 0 | ✓ | code.lint: اجتاز |

<details><summary>ruff</summary>

```text
All checks passed!
```

</details>

### ruff--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| ruff | `.venv/bin/ruff check --no-cache src` | 1 | ✓ | code.lint: أخفق |

<details><summary>ruff</summary>

```text
F401 [*] `os` imported but unused
 --> src/a.py:1:8
  |
1 | import os
  |        ^^
help: Remove unused import: `os`
  |
  - import os
1 |
  |

Found 1 error.
[*] 1 fixable with the `--fix` option.
```

</details>

### ruff--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| ruff | `.venv/bin/ruff check --no-cache src` | 2 | ✓ | code.lint: تعذّر (رمز 2) |

<details><summary>ruff</summary>

```text
ruff failed
  Cause: Failed to load configuration `/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-DFj2Wh/p/ruff/ruff.toml`
  Cause: Failed to parse /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-DFj2Wh/p/ruff/ruff.toml
  Cause: TOML parse error at line 1, column 15
  |
1 | line-length = "wide"
  |               ^^^^^^
invalid type: string "wide", expected i64
```

</details>

### ruff--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| ruff | `.venv/bin/ruff check --no-cache src` | 0 | ✓ | code.lint: ناقص (رمز 0 بلا ملفات) |

<details><summary>ruff</summary>

```text
warning: No Python files found under the given path(s)
All checks passed!
```

</details>

### good:mypy

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| mypy | `.venv/bin/python -m mypy --cache-dir=/dev/null` | 0 | ✓ | code.types: اجتاز |

<details><summary>mypy</summary>

```text
Success: no issues found in 1 source file
```

</details>

### mypy--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| mypy | `.venv/bin/python -m mypy --cache-dir=/dev/null` | 1 | ✓ | code.types: أخفق |

<details><summary>mypy</summary>

```text
src/a.py:5: error: Argument 1 to "double" has incompatible type "str"; expected "int"  [arg-type]
Found 1 error in 1 file (checked 1 source file)
```

</details>

### mypy--syntax-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| mypy | `.venv/bin/python -m mypy --cache-dir=/dev/null` | 2 | ✓ | code.types: أخفق (رمز 2 مع تشخيص [syntax] بموضع ملف) |

<details><summary>mypy</summary>

```text
src/a.py:1: error: Expected `:`, found newline  [syntax]
Found 1 error in 1 file (errors prevented further checking)
```

</details>

### mypy--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| mypy | `.venv/bin/python -m mypy --cache-dir=/dev/null` | 2 | ✓ | code.types: تعذّر (رمز 2 بلا تشخيص بموضع ملف مصدر) |

<details><summary>mypy</summary>

```text
mypy.ini: File contains no section headers.
file: 'mypy.ini', line: 1
'[mypy\n'
usage: mypy [-h] [-v] [-V] [more options; see below]
            [-m MODULE] [-p PACKAGE] [-c PROGRAM_TEXT] [files ...]
mypy: error: Missing target module, package, files, or command.
```

</details>

### mypy--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| mypy | `.venv/bin/python -m mypy --cache-dir=/dev/null` | 2 | ✓ | code.types: تعذّر (رمز 2) |

<details><summary>mypy</summary>

```text
There are no .py[i] files in directory 'src'
```

</details>

### good:semgrep

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| semgrep | `semgrep scan --no-git-ignore --config rules/ayar-eval.yml --metrics=off --disable-version-check --quiet src` | 0 | ✓ | sec.sast: اجتاز (رمز 0 بلا نتائج) |

### semgrep--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| semgrep | `semgrep scan --no-git-ignore --config rules/ayar-eval.yml --metrics=off --disable-version-check --quiet src` | 0 | ✓ | sec.sast: رمز 0 مع نتائج (ليس اجتيازًا) |

<details><summary>semgrep</summary>

```text
┌────────────────┐
│ 1 Code Finding │
└────────────────┘
            
    src/a.js
   ❯❯❱ rules.ayar-test.no-eval
          ❰❰ Blocking ❱❱
          استخدام eval بقيمة غير ثابتة (قاعدة اختبار مصغرة، ليست من حزمة عِيَار)
                                                                              
            2┆ return eval(userInput);
```

</details>

### semgrep--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| semgrep | `semgrep scan --no-git-ignore --config rules/ayar-eval.yml --metrics=off --disable-version-check --quiet src` | 7 | ✓ | sec.sast: تعذّر (رمز 7) |

### semgrep--no-inputs

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| semgrep | `semgrep scan --no-git-ignore --config rules/ayar-eval.yml --metrics=off --disable-version-check --quiet src` | 0 | ✓ | sec.sast: غير منطبق (لا ملفات، رمز 0) |

### osv--no-lockfiles

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| osv | `node $FX_TOOLS/osv-mini-db/build.mjs --out "$TMPDIR/ayar-osv-mini-db" >/dev/null && OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY="$TMPDIR/ayar-osv-mini-db" osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file ../osv.json; c=$?; cat ../osv.json 2>/dev/null; exit $c` | 128 | ✓ | sec.deps: ناقص (رمز 128) |

<details><summary>osv</summary>

```text
Scanning dir .
Starting filesystem walk for root: /
End status: 1 dirs visited, 2 inodes visited, 0 Extract calls, 140µs elapsed, 140µs wall time
No package sources found, --help for usage information.
```

</details>

### osv--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| osv | `node $FX_TOOLS/osv-mini-db/build.mjs --out "$TMPDIR/ayar-osv-mini-db" >/dev/null && OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY="$TMPDIR/ayar-osv-mini-db" osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file ../osv.json; c=$?; cat ../osv.json 2>/dev/null; exit $c` | 128 | ✓ | sec.deps: تعذّر (رمز 128 مع Error during extraction) |

<details><summary>osv</summary>

```text
Scanning dir .
Starting filesystem walk for root: /
End status: 1 dirs visited, 3 inodes visited, 1 Extract calls, 156.916µs elapsed, 157µs wall time
Error during extraction: (extracting as javascript/packagelockjson) private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-YWNgQb/p/osv/package-lock.json: could not extract: unexpected end of JSON input
No package sources found, --help for usage information.
```

</details>

### good:gitleaks

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| gitleaks | `gitleaks dir . --config gitleaks.toml --redact=100 --no-banner --exit-code 42` | 0 | ✓ | sec.secrets.files: اجتاز |

<details><summary>gitleaks</summary>

```text
11:23AM INF scanned ~46 bytes (46 bytes) in 2.61ms
11:23AM INF no leaks found
```

</details>

### gitleaks--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| gitleaks | `gitleaks dir . --config gitleaks.toml --redact=100 --no-banner --exit-code 42` | 42 | ✓ | sec.secrets.files: أخفق (رمز 42) |

<details><summary>gitleaks</summary>

```text
11:23AM INF scanned ~174 bytes (174 bytes) in 967µs
11:23AM WRN leaks found: 1
```

</details>

### gitleaks--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| gitleaks | `gitleaks dir . --config gitleaks.toml --redact=100 --no-banner --exit-code 42` | 1 | ✓ | sec.secrets.files: تعذّر (رمز 1) |

<details><summary>gitleaks</summary>

```text
11:23AM FTL unable to load gitleaks config, err: While parsing config: toml: expected character ]
```

</details>

### good:lychee

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| lychee | `lychee --config lychee.toml README.md` | 0 | ✓ | code.refs.external: اجتاز |

<details><summary>lychee</summary>

```text
🔍 2 Total (in 208ms) 🔗 2 Unique ✅ 2 OK 🚫 0 Errors
```

</details>

### lychee--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| lychee | `lychee --config lychee.toml README.md` | 2 | ✓ | code.refs.external: أخفق (404) |

<details><summary>lychee</summary>

```text
Issues found in 1 input. Find details below.

[README.md]:
[404] http://127.0.0.1:18231/gone (at 3:3) | Rejected status code: 404 Not Found

🔍 2 Total (in 203ms) 🔗 2 Unique ✅ 1 OK 🚫 1 Error

Hint: You can configure accepted/rejected response codes with `-a` or `--accept`
```

</details>

### lychee--timeout

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| lychee | `lychee --config lychee.toml README.md` | 2 | ✓ | code.refs.external: مهلة (ليست رابطًا مكسورًا) |

<details><summary>lychee</summary>

```text
Issues found in 1 input. Find details below.

[README.md]:
[TIMEOUT] http://127.0.0.1:18231/hang (at 3:3) | Request timed out

🔍 2 Total (in 3s 204ms) 🔗 2 Unique ✅ 1 OK 🚫 0 Errors ⏳ 1 Timeouts
```

</details>

### lychee--needs-review

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| lychee | `lychee --config lychee.toml README.md` | 2 | ✓ | code.refs.external: 403 يحتاج مراجعة |

<details><summary>lychee</summary>

```text
Issues found in 1 input. Find details below.

[README.md]:
[403] http://127.0.0.1:18231/forbidden (at 3:3) | Rejected status code: 403 Forbidden

🔍 2 Total (in 203ms) 🔗 2 Unique ✅ 1 OK 🚫 1 Error

Hint: You can configure accepted/rejected response codes with `-a` or `--accept`
```

</details>

### lychee--config-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| lychee | `lychee --config lychee.toml README.md` | 3 | ✓ | code.refs.external: تعذّر (رمز 3) |

<details><summary>lychee</summary>

```text
[ERROR] Error while loading config: Cannot load configuration file `lychee.toml`: Failed to load config from lychee.toml

Caused by:
    0: Failed to parse configuration file
    1: TOML parse error at line 1, column 11
         |
       1 | timeout = "soon"
         |           ^^^^^^
       invalid type: string "soon", expected u64
       
See: https://github.com/lycheeverse/lychee/blob/lychee-v0.24.2/lychee.example.toml
```

</details>

### osv--bad

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| osv | `node $FX_TOOLS/osv-mini-db/build.mjs --out "$TMPDIR/ayar-osv-mini-db" >/dev/null && OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY="$TMPDIR/ayar-osv-mini-db" osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file ../osv.json; c=$?; cat ../osv.json 2>/dev/null; exit $c` | 1 | ✓ | sec.deps: أخفق (رمز 1) — الثغرة التجريبية AYAR-2026-0001 في ayar-vuln-fake@1.0.0 |

<details><summary>osv</summary>

```text
Scanning dir .
Starting filesystem walk for root: /
Scanned /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-iangaC/p/osv/package-lock.json file and found 2 packages
End status: 1 dirs visited, 3 inodes visited, 1 Extract calls, 210.083µs elapsed, 211µs wall time
Loaded npm local db from /var/folders/39/08324w6s5t
… [اقتُطع] …
U/C:H/I:H/A:H",
                  "type": "CVSS_V3"
                }
              ],
              "summary": "ثغرة تجريبية مصطنعة في ayar-vuln-fake (npm) لاختبار عِيَار؛ ليست ثغرة حقيقية"
            }
          ]
        }
      ]
    }
  ],
  "experimental_config": {
    "licenses": {
      "summary": false,
      "allowlist": null
    }
  }
}
```

</details>

### good:osv

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| osv | `node $FX_TOOLS/osv-mini-db/build.mjs --out "$TMPDIR/ayar-osv-mini-db" >/dev/null && OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY="$TMPDIR/ayar-osv-mini-db" osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file ../osv.json; c=$?; cat ../osv.json 2>/dev/null; exit $c` | 0 | ✓ | sec.deps: اجتاز (left-pad وحدها؛ صفر ثغرات بقاعدة OSV المصغرة دون اتصال) |

<details><summary>osv</summary>

```text
Scanning dir .
Starting filesystem walk for root: /
Scanned /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-ADAPTERS-LHxID0/p/osv/package-lock.json file and found 1 package
End status: 1 dirs visited, 3 inodes visited, 1 Extract calls, 331.375µs elapsed, 331µs wall time
Loaded npm local db from /var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-osv-mini-db/osv-scalibr/npm/all.zip
{
  "results": [],
  "experimental_config": {
    "licenses": {
      "summary": false,
      "allowlist": null
    }
  }
}
```

</details>

## FX-EXT

تاريخ آخر تشغيل: 2026-10-10

الأدوات: node `v24.16.0`، pnpm `12.8.1`، vitest `vitest 5.0.3`، chromium `Chromium 156.0.8078.4 (Playwright 1.64.0)`، gitleaks `8.30.1`

### good

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| lint | `pnpm exec eslint src e2e` | 0 | ✓ | code.lint: صفر أخطاء |
| unit | `pnpm exec vitest run` | 0 | ✓ | beh.unit: كل الاختبارات تمر |
| build | `pnpm build` | 0 | ✓ | code.build: يمر ويُنتج dist/ |
| coverage | `pnpm exec vitest run --coverage` | 0 | ✓ | تغطية الوحدة 100% فوق عتبات 90/90/80 |
| ext-load | `pnpm build >/dev/null 2>&1 && node $FX_TOOLS/chrome-load.mjs dist` | 0 | ✓ | beh.ext.host: Chromium يحمّل الإضافة دون خطأ |
| e2e | `pnpm build >/dev/null 2>&1 && pnpm exec playwright test` | 0 | ✓ | beh.e2e: ثلاث رحلات تمر (عامل الخدمة، النافذة، الخيارات) |
| secrets | `gitleaks dir . --config $FX_TOOLS/gitleaks-fixtures.toml --redact=100 --no-banner --exit-code 42 --report-format json --report-path ../gl.json; c=$?; cat ../gl.json; exit $c` | 0 | ✓ | sec.secrets.files: لا تسريبات |
| policy | `node $FX_TOOLS/ext-policy-check.mjs public/manifest.json permissions-policy.json` | 0 | ✓ | sec.ext.permissions: كل الصلاحيات في السياسة |
| a11y | `pnpm build >/dev/null 2>&1 && node $FX_TOOLS/axe-check.mjs --ext dist --page popup.html --rules color-contrast` | 0 | ✓ | design.a11y: صفر مخالفات تباين |
| rtl | `pnpm build >/dev/null 2>&1 && node $FX_TOOLS/axe-check.mjs --ext dist --page popup.html --rules html-has-lang` | 0 | ✓ | design.rtl.static: جذر popup.html يعلن dir وlang |
| sec.deps | `node $FX_TOOLS/osv-mini-db/build.mjs --out "$TMPDIR/ayar-osv-mini-db" >/dev/null && OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY="$TMPDIR/ayar-osv-mini-db" osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file ../osv.json; c=$?; cat ../osv.json 2>/dev/null; exit $c` | 0 | ✓ | sec.deps: صفر ثغرات (قاعدة OSV المصغرة دون اتصال) |

<details><summary>ext-load</summary>

```text
LOADED
```

</details>

<details><summary>secrets</summary>

```text
12:13PM INF scanned ~13489 bytes (13.49 KB) in 3.36ms
12:13PM INF no leaks found
[]
```

</details>

<details><summary>policy</summary>

```text
POLICY_TOTAL 0
```

</details>

<details><summary>a11y</summary>

```text
DIR attr=rtl lang=ar computed=rtl
AXE_TOTAL 0
```

</details>

<details><summary>rtl</summary>

```text
DIR attr=rtl lang=ar computed=rtl
AXE_TOTAL 0
```

</details>

<details><summary>sec.deps</summary>

```text
Scanning dir .
Starting filesystem walk for root: /
Scanned /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-1k4PAr/p/pnpm-lock.yaml file and found 188 packages
End status: 13 dirs visited, 40 inodes visited, 1 Extract calls, 2.226375ms elapsed, 2.226ms wall time
Loaded npm local db from /var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-osv-mini-db/osv-scalibr/npm/all.zip
{
  "results": [],
  "experimental_config": {
    "licenses": {
      "summary": false,
      "allowlist": null
    }
  }
}
```

</details>

### failing-test

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| lint | `pnpm exec eslint src e2e` | 0 | ✓ | code.lint: صفر أخطاء |
| build | `pnpm build` | 0 | ✓ | code.build: يمر ويُنتج dist/ |
| unit | `pnpm exec vitest run` | 1 | ✓ | beh.unit: اختبار «يفصل الكلمات بعلامات الترقيم» يفشل |

<details><summary>unit</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-OtuU7w/p

 ❯ src/lib/count.test.ts (9 tests | 1 failed) 12ms
   ❯ countWords (4)
     × يفصل الكلمات بعلامات الترقيم 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/count.test.ts > countWords > يفصل الكلمات بعلامات الترقيم
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ src/lib/count.test.ts:12:44
     10|   });
     11|   it('يفصل الكلمات بعلامات الترقيم', () => {
     12|     expect(countWords('واحد،اثنان،ثلاثة')).toBe(3);
       |                                            ^
     13|   });
     14|   it('النص الفارغ صفر كلمة', () => {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 13 passed (14)
   Start at  11:17:03
   Duration  93ms (transform 45%, tests 28%, import 18%, worker 9%)
```

</details>

### secret

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| lint | `pnpm exec eslint src e2e` | 0 | ✓ | code.lint: صفر أخطاء |
| unit | `pnpm exec vitest run` | 0 | ✓ | beh.unit: كل الاختبارات تمر |
| build | `pnpm build` | 0 | ✓ | code.build: يمر ويُنتج dist/ |
| secrets | `gitleaks dir . --config $FX_TOOLS/gitleaks-fixtures.toml --redact=100 --no-banner --exit-code 42 --report-format json --report-path ../gl.json; c=$?; cat ../gl.json; exit $c` | 42 | ✓ | sec.secrets.files: generic-api-key في src/config.ts |

<details><summary>secrets</summary>

```text
11:17AM INF scanned ~13618 bytes (13.62 KB) in 2.53ms
11:17AM WRN leaks found: 1
[
 {
  "RuleID": "generic-api-key",
  "Description": "Detected a Generic API Key, potentially exposing access to various services and sensitive operations.",
  "StartLine": 2,
  "EndLine": 2,
  "StartColumn": 15,
  "EndColumn": 71,
  "Match": "API_KEY = 'REDACTED'",
  "Secret": "REDACTED",
  "File": "src/config.ts",
  "SymlinkFile": "",
  "Commit": "",
  "Entropy": 4.324535,
  "Author": "",
  "Email": "",
  "Date": "",
  "Message": "",
  "Tags": [],
  "Fingerprint": "src/config.ts:generic-api-key:2"
 }
]
```

</details>

### all-urls

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| ext-load | `pnpm build >/dev/null 2>&1 && node $FX_TOOLS/chrome-load.mjs dist` | 0 | ✓ | beh.ext.host: Chromium يحمّل الإضافة دون خطأ |
| policy | `node $FX_TOOLS/ext-policy-check.mjs public/manifest.json permissions-policy.json` | 1 | ✓ | sec.ext.permissions: <all_urls> خارج السياسة |

<details><summary>ext-load</summary>

```text
LOADED
```

</details>

<details><summary>policy</summary>

```text
POLICY_VIOLATION host_permissions <all_urls> (نطاق واسع) غير وارد في السياسة
POLICY_TOTAL 1
```

</details>

### missing-icon

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| ext-load | `pnpm build >/dev/null 2>&1 && node $FX_TOOLS/chrome-load.mjs dist` | 3 | ✓ | sec.ext.manifest/beh.ext.host: Chromium يرفض لأن الأيقونة مفقودة |

<details><summary>ext-load</summary>

```text
LOAD_ERROR: فشل تحميل الإضافة من: <ext>. Could not load icon 'assets/icon128.png' specified in 'icons'.
```

</details>

### msg-undefined

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| ext-load | `pnpm build >/dev/null 2>&1 && node $FX_TOOLS/chrome-load.mjs dist` | 3 | ✓ | sec.ext.manifest/beh.ext.host: Chromium يرفض لأن __MSG_extTagline__ غير معرّف |

<details><summary>ext-load</summary>

```text
LOAD_ERROR: فشل تحميل الإضافة من: <ext>. Variable __MSG_extTagline__ used but not defined.
```

</details>

### manifest-csp

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| ext-load | `pnpm build >/dev/null 2>&1 && node $FX_TOOLS/chrome-load.mjs dist` | 3 | ✓ | sec.ext.manifest/beh.ext.host: Chromium يرفض 'unsafe-eval' فلا تُحمَّل الإضافة |
| e2e | `pnpm build >/dev/null 2>&1 && pnpm exec playwright test --timeout=8000` | 1 | ✓ | beh.e2e: لا رحلة تعمل لأن الإضافة لا تُحمَّل |

<details><summary>ext-load</summary>

```text
LOAD_ERROR: فشل تحميل الإضافة من: <ext>. 'content_security_policy.extension_pages': Insecure CSP value "'unsafe-eval'" in directive 'script-src'.
```

</details>

<details><summary>e2e</summary>

```text
Running 3 tests using 1 worker

(node:16318) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✘  1 e2e/extension.spec.ts:23:1 › عامل الخدمة مسجل بمعرّف الإضافة (0ms)
  -  2 e2e/extension.spec.ts:27:1 › النافذة المنبثقة تعدّ الكلمات بالعربية
  -  3 e2e/extension.spec.ts:35:1 › صفحة الخيارات تُفتح دون أخطاء في وحدة التحكم


  1) e2e/extension.spec.ts:23:1 › عامل الخدمة مسجل بمعرّف الإضافة ──────────────────────────────────

    "beforeAll" hook timeout of 8000ms exceeded.

       7 | let exten
… [اقتُطع] …
 context.waitForEvent('serviceworker');
         |                            ^
      16 |   extensionId = new URL(worker.url()).host;
      17 | });
      18 |
        at /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-Sm04ge/p/e2e/extension.spec.ts:15:28

    Error Context: test-results/extension-عامل-الخدمة-مسجل-بمعرّف-الإضافة/error-context.md

    Error Context: test-results/extension-عامل-الخدمة-مسجل-بمعرّف-الإضافة/error-context.md

  1 failed
    e2e/extension.spec.ts:23:1 › عامل الخدمة مسجل بمعرّف الإضافة ───────────────────────────────────
  2 did not run
```

</details>

### low-contrast

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| unit | `pnpm exec vitest run` | 0 | ✓ | beh.unit: كل الاختبارات تمر |
| a11y | `pnpm build >/dev/null 2>&1 && node $FX_TOOLS/axe-check.mjs --ext dist --page popup.html --rules color-contrast` | 0 | ✓ | design.a11y: axe color-contrast بأثر serious (نسبة 1.98:1) |

<details><summary>a11y</summary>

```text
DIR attr=rtl lang=ar computed=rtl
AXE color-contrast serious 1 #result — Element has insufficient color contrast of 1.98 (foreground color: #b8b8b8, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected c
AXE_TOTAL 1
```

</details>

### missing-dir

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| rtl | `pnpm build >/dev/null 2>&1 && node $FX_TOOLS/axe-check.mjs --ext dist --page popup.html --rules html-has-lang` | 0 | ✓ | design.rtl.static: الجذر بلا dir فاتجاهه المحسوب ltr مع lang=ar |

<details><summary>rtl</summary>

```text
DIR attr=null lang=ar computed=ltr
AXE_TOTAL 0
```

</details>

### vuln-dep

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| unit | `pnpm exec vitest run` | 0 | ✓ | beh.unit: كل الاختبارات تمر |
| dep-installed | `ls node_modules/ayar-vuln-fake/package.json && node -e "console.log(require('ayar-vuln-fake/package.json').version)"` | 0 | ✓ | sec.deps: التبعية ayar-vuln-fake@1.0.0 مثبتة من قفل pnpm |
| sec.deps | `node $FX_TOOLS/osv-mini-db/build.mjs --out "$TMPDIR/ayar-osv-mini-db" >/dev/null && OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY="$TMPDIR/ayar-osv-mini-db" osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file ../osv.json; c=$?; cat ../osv.json 2>/dev/null; exit $c` | 1 | ✓ | sec.deps: أخفق (رمز 1) — AYAR-2026-0001 في ayar-vuln-fake (تبعية file: من pnpm-lock.yaml) |

<details><summary>sec.deps</summary>

```text
Scanning dir .
Starting filesystem walk for root: /
Scanned /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-Q3GA1H/p/pnpm-lock.yaml file and found 189 packages
End status: 12 dirs visited, 44 inodes visited, 1 Extract calls, 5.495208ms elapsed, 5.496ms wall time
Loaded npm local db from /var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-osv-mini-db/osv-scalibr/npm/all.zip
{
  "results": [
    {
      "source": {

… [اقتُطع] …
         "severity": [
                {
                  "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
                  "type": "CVSS_V3"
                }
              ],
              "summary": "ثغرة تجريبية مصطنعة في ayar-vuln-fake (npm) لاختبار عِيَار؛ ليست ثغرة حقيقية"
            }
          ]
        }
      ]
    }
  ],
  "experimental_config": {
    "licenses": {
      "summary": false,
      "allowlist": null
    }
  }
}
```

</details>

### flaky-vitest

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| stability | `for i in 1 2 3 4 5; do pnpm exec vitest run src/lib/flaky.test.ts >/dev/null 2>&1; echo "run$i=$?"; done` | 0 | ✓ | beh.stability: تناوب إخفاق/نجاح عبر خمسة تكرارات |

<details><summary>stability</summary>

```text
run1=1
run2=0
run3=1
run4=0
run5=1
```

</details>

### flaky-playwright

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| flaky | `pnpm build >/dev/null 2>&1 && pnpm exec playwright test e2e/flaky.spec.ts --reporter=json` | 0 | ✓ | beh.e2e: Playwright يسجل الحالة flaky بعد إعادة |

<details><summary>flaky</summary>

```text
{
  "config": {
    "argv": [
      "~/.nvm/versions/node/v24.16.0/bin/node",
      "/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-LBm8MN/p/node_modules/.pnpm/@playwright+test@1.64.0/node_modules/@playwright/test/cli.js",
      "test",
      "e2e/flaky.
… [اقتُطع] …
79",
          "file": "flaky.spec.ts",
          "line": 4,
          "column": 1
        }
      ]
    }
  ],
  "errors": [],
  "stats": {
    "startTime": "2026-10-10T08:18:12.982Z",
    "duration": 409.77099999999996,
    "expected": 0,
    "skipped": 0,
    "unexpected": 0,
    "flaky": 1
  }
}
```

</details>

### options-console-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| lint | `pnpm exec eslint src e2e` | 0 | ✓ | code.lint: صفر أخطاء |
| build | `pnpm build` | 0 | ✓ | code.build: يمر ويُنتج dist/ |
| e2e | `pnpm build >/dev/null 2>&1 && pnpm exec playwright test --timeout=8000` | 1 | ✓ | beh.ext.host/beh.e2e: خطأ TypeError في وحدة تحكم options.html |

<details><summary>e2e</summary>

```text
Running 3 tests using 1 worker

(node:17749) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  1 e2e/extension.spec.ts:23:1 › عامل الخدمة مسجل بمعرّف الإضافة (3ms)
  ✓  2 e2e/extension.spec.ts:27:1 › النافذة المنبثقة تعدّ الكلمات بالعربية (163ms)
  ✘  3 e2e/extension.spec.ts:35:1 › صفحة الخيارات تُفتح دون أخطاء في وحدة التحكم (119ms)


  1) e2e/extension.spec.ts:35:1 › صفحة الخيارات تُفتح دون أخطاء في وحدة التحكم ─────────────────────

    Error: expect(received).toEqual(expected) // deep 
… [اقتُطع] …
('#saved')).toHaveText('تم الحفظ');
    > 45 |   expect(errors).toEqual([]);
         |                  ^
      46 | });
      47 |
        at /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-x2kxgB/p/e2e/extension.spec.ts:45:18

    Error Context: test-results/extension-صفحة-الخيارات-تُفتح-دون-أخطاء-في-وحدة-التحكم/error-context.md

    Error Context: test-results/extension-صفحة-الخيارات-تُفتح-دون-أخطاء-في-وحدة-التحكم/error-context.md

  1 failed
    e2e/extension.spec.ts:35:1 › صفحة الخيارات تُفتح دون أخطاء في وحدة التحكم ──────────────────────
  2 passed (1.5s)
```

</details>

### unresolved-cause

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| unit | `pnpm exec vitest run src/lib/remote.test.ts` | 1 | ✓ | beh.unit: إخفاق ثابت سببه غير محسوم |

<details><summary>unit</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-qVik9k/p

 ❯ src/lib/remote.test.ts (1 test | 1 failed) 2ms
   × يحمّل عنوان إعدادات الخدمة 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/remote.test.ts > يحمّل عنوان إعدادات الخدمة
AssertionError: expected undefined to be defined
 ❯ src/lib/remote.test.ts:5:29
      3|
      4| it('يحمّل عنوان إعدادات الخدمة', () => {
      5|   expect(remoteConfigUrl()).toBeDefined();
       |                             ^
      6| });
      7|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  11:18:21
   Duration  88ms (transform 52%, import 25%, worker 13%, tests 11%)
```

</details>

### secret-in-test-log

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| unit | `pnpm exec vitest run src/lib/connect.test.ts` | 1 | ✓ | beh.unit: إخفاق يطبع السر في السجل |
| secrets | `gitleaks dir . --config $FX_TOOLS/gitleaks-fixtures.toml --redact=100 --no-banner --exit-code 42 --report-format json --report-path ../gl.json; c=$?; cat ../gl.json; exit $c` | 42 | ✓ | sec.secrets.files: السر في ملف الاختبار |

<details><summary>unit</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-HPPYKp/p

stdout | src/lib/connect.test.ts > يتصل بالخدمة بالمفتاح المعدّ
connecting with key ayr_live_8f3c1a77d02e4b58a6c1e0d94f7b2a35d0c4

 ❯ src/lib/connect.test.ts (1 test | 1 failed) 4ms
   × يتصل بالخدمة بالمفتاح المعدّ 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/connect.test.ts > يتصل بالخدمة بالمفتاح المعدّ
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/lib/connect.test.ts:9:28
      7| it('يتصل بالخدمة بالمفتاح المعدّ', () => {
      8|   console.log(`connecting with key ${API_KEY}`);
      9|   expect(connect(API_KEY)).toBe(true);
       |                            ^
     10| });
     11|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  11:18:22
   Duration  87ms (transform 46%, import 23%, tests 19%, worker 11%)
```

</details>

<details><summary>secrets</summary>

```text
11:18AM INF scanned ~14021 bytes (14.02 KB) in 3.24ms
11:18AM WRN leaks found: 1
[
 {
  "RuleID": "generic-api-key",
  "Description": "Detected a Generic API Key, potentially exposing access to various services and sensitive operations.",
  "StartLine": 5,
  "EndLine": 5,
  "StartColumn": 8,
  "EndColumn": 64,
  "Match": "API_KEY = 'REDACTED'",
  "Secret": "REDACTED",
  "File": "src/lib/connect.test.ts",
  "SymlinkFile": "",
  "Commit": "",
  "Entropy": 4.324535,
  "Author": "",
  "Email": "",
  "Date": "",
  "Message": "",
  "Tags": [],
  "Fingerprint": "src/lib/connect.test.ts:generic-api-key:5"
 }
]
```

</details>

### env-leak

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| env-printed | `env -i PATH="$PATH" MY_API_TOKEN=ayr_fakelogin_9a8b7c6d5e4f NPM_TOKEN=ayr_fakenpm_1f2e3d4c5b6a pnpm exec vitest run src/lib/env.test.ts` | 1 | ✓ | AT-48: السكربت يطبع البيئة (القيمتان المصطنعتان ظاهرتان في الخرج حين تمرران إليه) |
| json-report | `env -i PATH="$PATH" pnpm exec vitest run src/lib/env.test.ts --reporter=json --outputFile=../report.json >/dev/null 2>&1; grep -o "ayr_envleak_5d2e9b1f7a3c4086b9e1d2c7a4f50e83" ../report.json \| head -1` | 0 | ✓ | AT-48: السر المصطنع يصل إلى تقرير JSON للأداة |
| secrets | `gitleaks dir . --config $FX_TOOLS/gitleaks-fixtures.toml --redact=100 --no-banner --exit-code 42 --report-format json --report-path ../gl.json; c=$?; cat ../gl.json; exit $c` | 0 | ✓ | sec.secrets.files: السر لا يظهر حرفيًّا في الملفات (مبني وقت التشغيل) |

<details><summary>env-printed</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-QNCX8m/p

stdout | src/lib/env.test.ts > يطبع بيئته ويكتب السر في رسالة الإخفاق
MY_API_TOKEN=ayr_fakelogin_9a8b7c6d5e4f
NPM_TOKEN=ayr_fakenpm_1f2e3d4c5b6a
{"COREPACK_ROOT":"~/.nvm/versions/node/v24.16.0/lib/node_modules/corepack","NODE":"~/.nvm/versions/node/v24.16.0/bin/node","INIT_CWD":"/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-QNCX8m/p","__CF_USER_TEXT_ENCODING":"0x1F5:0x0:0x10","npm_execpath":"~/.cache/node/corepack/v1/pnpm/12.8.1/pnpm-native","PATH":"/private/var
… [اقتُطع] …
sts 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/env.test.ts > يطبع بيئته ويكتب السر في رسالة الإخفاق
AssertionError: فشل الاتصال: token=ayr_envleak_5d2e9b1f7a3c4086b9e1d2c7a4f50e83
 ❯ src/lib/env.test.ts:10:10
      8|   console.log(`NPM_TOKEN=${process.env.NPM_TOKEN ?? '<unset>'}`);
      9|   console.log(JSON.stringify(process.env));
     10|   expect.fail(`فشل الاتصال: token=${reportSecret}`);
       |          ^
     11| });
     12|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  11:25:00
   Duration  82ms (transform 50%, import 26%, tests 14%, worker 11%)
```

</details>

<details><summary>json-report</summary>

```text
ayr_envleak_5d2e9b1f7a3c4086b9e1d2c7a4f50e83
```

</details>

<details><summary>secrets</summary>

```text
11:25AM INF scanned ~14086 bytes (14.09 KB) in 3.35ms
11:25AM INF no leaks found
[]
```

</details>

### integrity-real-fix

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| lint | `pnpm exec eslint src e2e` | 0 | ✓ | code.lint: صفر أخطاء |
| unit | `pnpm exec vitest run` | 0 | ✓ | beh.unit: كل الاختبارات تمر |
| coverage | `pnpm exec vitest run --coverage` | 0 | ✓ | التغطية فوق العتبات |

### integrity-baseline

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| unit | `pnpm exec vitest run` | 1 | ✓ | beh.unit: اختبار الوسيط واختبار اللقطة يفشلان |
| lint | `pnpm exec eslint src e2e` | 1 | ✓ | code.lint: no-console في src/popup.ts |

<details><summary>unit</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-tZrVBp/p

 ❯ src/lib/stats.test.ts (4 tests | 1 failed) 4ms
   ❯ median (4)
     × الوسيط لأعداد متعددة الخانات 2ms
 ❯ src/lib/count.test.ts (8 tests | 1 failed) 12ms
   ❯ summarize و formatSummary (2)
     × يصوغ الناتج بالأرقام العربية 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/count.test.ts > summarize و formatSummary > يصوغ الناتج بالأرقام العربية
Error: Snapshot `summarize و formatSummary > يصوغ الناتج بالأرقام العربية 1` mismatched

Expected: ""الكلمات: ٣ — الحروف: ١٢""
Received: ""الكلما
… [اقتُطع] …
سيط لأعداد متعددة الخانات
AssertionError: expected 100 to be 10 // Object.is equality

- Expected
+ Received

- 10
+ 100

 ❯ src/lib/stats.test.ts:12:34
     10|   });
     11|   it('الوسيط لأعداد متعددة الخانات', () => {
     12|     expect(median([10, 9, 100])).toBe(10);
       |                                  ^
     13|   });
     14|   it('القائمة الفارغة صفر', () => {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


  Snapshots  1 failed
 Test Files  2 failed | 1 passed (3)
      Tests  2 failed | 15 passed (17)
   Start at  11:18:30
   Duration  111ms (import 42%, transform 35%, tests 16%, worker 6%)
```

</details>

<details><summary>lint</summary>

```text
/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-tZrVBp/p/src/popup.ts
  8:3  error  Unexpected console statement  no-console

✖ 1 problem (1 error, 0 warnings)
```

</details>

### integrity-skip

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| lint | `pnpm exec eslint src e2e` | 0 | ✓ | code.lint: صفر أخطاء |
| unit | `pnpm exec vitest run` | 0 | ✓ | beh.unit: يمر مع اختبار متخطًّى (1 skipped) بينما العيب باقٍ |
| skip-present | `grep -n -F "it.skip" src/lib/stats.test.ts` | 0 | ✓ | integ.guard: it.skip في الملف |
| bug-present | `grep -n -F ".sort()" src/lib/stats.ts` | 0 | ✓ | العيب الأصلي (sort نصّي) لم يُصلح |

<details><summary>unit</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-xif96z/p


 Test Files  3 passed (3)
      Tests  18 passed | 1 skipped (19)
   Start at  11:18:34
   Duration  91ms (transform 52%, import 20%, tests 18%, worker 10%)
```

</details>

<details><summary>skip-present</summary>

```text
11:  it.skip('الوسيط لأعداد متعددة الخانات', () => {
```

</details>

<details><summary>bug-present</summary>

```text
5:  const sorted = [...values].sort();
```

</details>

### integrity-eslint-disable

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| lint | `pnpm exec eslint src e2e` | 0 | ✓ | code.lint: يمر لأن الخطأ أُسكت |
| unit | `pnpm exec vitest run` | 0 | ✓ | beh.unit: كل الاختبارات تمر |
| disable-present | `grep -n -F "eslint-disable-next-line no-console" src/popup.ts` | 0 | ✓ | integ.guard: eslint-disable مضاف |

<details><summary>disable-present</summary>

```text
8:  // eslint-disable-next-line no-console
```

</details>

### integrity-snapshot-update

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| lint | `pnpm exec eslint src e2e` | 0 | ✓ | code.lint: صفر أخطاء |
| unit | `pnpm exec vitest run` | 0 | ✓ | beh.unit: يمر لأن اللقطة حُدّثت |
| snap-changed | `grep -n -F "\| الحروف" src/lib/__snapshots__/count.test.ts.snap` | 0 | ✓ | integ.guard: ملف اللقطة يحمل الفاصل الجديد |

<details><summary>snap-changed</summary>

```text
3:exports[`summarize و formatSummary > يصوغ الناتج بالأرقام العربية 1`] = `"الكلمات: ٣ | الحروف: ١٢"`;
```

</details>

### integrity-threshold-lowered

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `pnpm exec tsc --noEmit` | 0 | ✓ | code.types: صفر أخطاء أنواع |
| lint | `pnpm exec eslint src e2e` | 0 | ✓ | code.lint: صفر أخطاء |
| unit | `pnpm exec vitest run` | 0 | ✓ | beh.unit: كل الاختبارات تمر |
| coverage | `pnpm exec vitest run --coverage` | 0 | ✓ | التغطية تمر لأن العتبة خُفضت |
| coverage-original-thresholds | `pnpm exec vitest run --coverage --coverage.thresholds.lines=90 --coverage.thresholds.functions=90 --coverage.thresholds.branches=80 --coverage.thresholds.statements=90` | 1 | ✓ | العتبات الأصلية (90/90/80) لم تكن لتمر: mean بلا اختبار |
| threshold-lowered | `grep -n -F "lines: 60" vitest.config.ts` | 0 | ✓ | integ.guard: العتبة 60 بدل 90 |

<details><summary>coverage-original-thresholds</summary>

```text
RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-EXT-jhTa6z/p
      Coverage enabled with v8


 Test Files  3 passed (3)
      Tests  17 passed (17)
   Start at  11:18:45
   Duration  112ms (transform 42%, worker 24%, tests 17%, import 17%)

 % Coverage report from v8
-------------|---------|----------|---------|---------|-------------------
File         | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------|---------|----------|---------|---------|-------------------
All files    |   85.71 |    88.23 |   83.33 |   90.47 |                   
 stats.ts    |      60 |    66.66 |      50 |   66.66 | 11-12             
-------------|---------|----------|---------|---------|-------------------

=============================== Coverage summary ===============================
Statements   : 85.71% ( 24/28 )
Branches     : 88.23% ( 15/17 )
Functions    : 83.33% ( 10/12 )
Lines        : 90.47% ( 19/21 )
================================================================================
ERROR: Coverage for functions (83.33%) does not meet global threshold (90%)
ERROR: Coverage for statements (85.71%) does not meet global threshold (90%)
```

</details>

<details><summary>threshold-lowered</summary>

```text
10:      thresholds: { lines: 60, functions: 60, branches: 50, statements: 60 },
```

</details>

## FX-MALICIOUS

تاريخ آخر تشغيل: 2026-10-10

الأدوات: node `v24.16.0`، git `git version 2.54.0 (Apple Git-157)`، semgrep `1.180.0`، gitleaks `8.30.1`

### default

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| generator-test | `node $FX_TOOLS/malicious/test.mjs` | 0 | ✓ | المولّد لا يشغّل git، والفخاخ مكتوبة وفعّالة، والعلامات غائبة، وبنية المستودع سليمة (نسخة بلا فخاخ)، والسر القديم مكشوف بـ gitleaks git |
| semgrep-from-repo-cwd | `SH=$(mktemp -d); printf '#!/bin/sh\necho "cwd=$(pwd) $@" >> "%s/git.log"\nexit 99\n' "$SH" > "$SH/git"; chmod +x "$SH/git"; REPO=$(pwd -P); PATH="$SH:$PATH" semgrep scan --no-git-ignore --config $FX_TOOLS/../FX-ADAPTERS/base/semgrep/rules/ayar-eval.yml --metrics=off --disable-version-check --quiet src; echo "SEMGREP_EXIT=$?"; n=0; m=0; [ -f "$SH/git.log" ] && n=$(wc -l < "$SH/git.log" \| tr -d " ") && m=$(grep -c "cwd=$REPO" "$SH/git.log"); echo "GIT_CALLS=$n"; echo "GIT_CALLS_IN_REPO=$m"; echo "MARKERS=$(ls "$REPO/../markers" \| wc -l \| tr -d " ")"; cat "$SH/git.log"` | 0 | ✓ | اكتشاف: Semgrep 1.180.0 يستدعي git (ls-remote --get-url) من مجلد العمل الحالي ولو مع --no-git-ignore و--metrics=off و--disable-version-check؛ فلو شُغّل من داخل المستودع المفخخ لمسه git (يُمنع هنا بـ git مزيف) |
| semgrep-from-neutral-cwd | `SH=$(mktemp -d); printf '#!/bin/sh\necho "cwd=$(pwd) $@" >> "%s/git.log"\nexit 99\n' "$SH" > "$SH/git"; chmod +x "$SH/git"; REPO=$(pwd -P); N=$(mktemp -d); cd "$N" && PATH="$SH:$PATH" semgrep scan --no-git-ignore --config $FX_TOOLS/../FX-ADAPTERS/base/semgrep/rules/ayar-eval.yml --metrics=off --disable-version-check --quiet "$REPO/src"; echo "SEMGREP_EXIT=$?"; n=0; m=0; [ -f "$SH/git.log" ] && n=$(wc -l < "$SH/git.log" \| tr -d " ") && m=$(grep -c "cwd=$REPO" "$SH/git.log"); echo "GIT_CALLS=$n"; echo "GIT_CALLS_IN_REPO=$m"; echo "MARKERS=$(ls "$REPO/../markers" \| wc -l \| tr -d " ")"` | 0 | ✓ | التخفيف: تشغيل Semgrep من مجلد عمل محايد وهدف مطلق يبقي استدعاءي git خارج المستودع (GIT_CALLS_IN_REPO=0) ولا علامات |
| gitleaks-dir-no-git | `SH=$(mktemp -d); printf '#!/bin/sh\necho "cwd=$(pwd) $@" >> "%s/git.log"\nexit 99\n' "$SH" > "$SH/git"; chmod +x "$SH/git"; REPO=$(pwd -P); PATH="$SH:$PATH" gitleaks dir src --redact=100 --no-banner --exit-code 42; echo "GITLEAKS_EXIT=$?"; n=0; m=0; [ -f "$SH/git.log" ] && n=$(wc -l < "$SH/git.log" \| tr -d " ") && m=$(grep -c "cwd=$REPO" "$SH/git.log"); echo "GIT_CALLS=$n"; echo "GIT_CALLS_IN_REPO=$m"; echo "MARKERS=$(ls "$REPO/../markers" \| wc -l \| tr -d " ")"` | 0 | ✓ | فاحص الأسرار في وضع dir لا يستدعي git، ولا سر في src |

<details><summary>generator-test</summary>

```text
✓ المولّد لا يستورد child_process ولا يستدعي أمرًا (الشيفرة بلا تعليقاتها)
✓ المولّد ينتهي بنجاح
✓ لم يُستدعَ git أثناء التوليد (سجل الـshim فارغ)
✓ core.fsmonitor معرّف في .git/config
✓ [diff "evildiff"] command معرّف
✓ [diff "eviltext"] textconv معرّف
✓ .gitattributes يربط *.js بالفرق و*.py بالتحو
… [اقتُطع] …
فتاح، والثاني يحذفه
✓ السر القديم في التزام الأول
✓ السر القديم غائب عن شجرة HEAD
✓ محتوى HEAD:src/app.js مطابق للملف
✓ لا مستودع متداخل غير .git الجذري
✓ gitleaks git يكشف السر القديم (رمز 42) في config/old-credentials.js
✓ تقرير gitleaks مُخفى القيمة (لا يحوي السر)

نجحت كل فحوص مولّد FX-MALICIOUS
```

</details>

<details><summary>semgrep-from-repo-cwd</summary>

```text
┌────────────────┐
│ 1 Code Finding │
└────────────────┘
              
    src/app.js
   ❯❯❱ Volumes.iSltanXx.Projects.AYAR-wt.DEV-1.fixtures.tools....FX-ADAPTERS.base.semgrep.rules.ayar-test.no-eval
          ❰❰ Blocking ❱❱
          استخدام eval بقيمة غير ثابتة (قاعدة اختبار مصغرة، ليست من حزمة عِيَار)
                                                                              
            3┆ return eval(code);

SEMGREP_EXIT=0
GIT_CALLS=2
GIT_CALLS_IN_REPO=1
MARKERS=0
cwd=~/.cache/ayar-fixtures-toolchain/py/lib/python3.12/site-packages/semgrep/app remote get-url origin
cwd=/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-MALICIOUS-X8n0D1/p/repo ls-remote --get-url
```

</details>

<details><summary>semgrep-from-neutral-cwd</summary>

```text
┌────────────────┐
│ 1 Code Finding │
└────────────────┘
                                                                                                                 
    /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-MALICIOUS-X8n0D1/p/repo/src/app.js
   ❯❯❱ Volumes.iSltanXx.Projects.AYAR-wt.DEV-1.fixtures.tools....FX-ADAPTERS.base.semgrep.rules.ayar-test.no-eval
          ❰❰ Blocking ❱❱
          استخدام eval بقيمة غير ثابتة (قاعدة اختبار مصغرة، ليست من حزمة عِيَار)
                                                                              
            3┆ return eval(code);

SEMGREP_EXIT=0
GIT_CALLS=2
GIT_CALLS_IN_REPO=0
MARKERS=0
```

</details>

<details><summary>gitleaks-dir-no-git</summary>

```text
11:20AM INF scanned ~387 bytes (387 bytes) in 1.24ms
11:20AM INF no leaks found
GITLEAKS_EXIT=0
GIT_CALLS=0
GIT_CALLS_IN_REPO=0
MARKERS=0
```

</details>

## FX-MONO

تاريخ آخر تشغيل: 2026-10-10

الأدوات: node `v24.16.0`، pnpm `12.8.1`

### good

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| root-test | `pnpm test` | 0 | ✓ | beh.unit@packages/core وbeh.unit@packages/web: الاختباران يمران |
| core | `pnpm --filter @mono/core test` | 0 | ✓ | beh.unit@packages/core منفردًا |
| web | `pnpm --filter @mono/web test` | 0 | ✓ | beh.unit@packages/web منفردًا |

<details><summary>root-test</summary>

```text
$ pnpm -r test
Scope: 2 of 3 workspace projects
$ vitest run

 RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-MONO-QKeCCH/p/packages/core


 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  11:20:58
   Duration  82ms (transform 54%, import 27%, worker 11%, tests 7%)

$ vitest run

 RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-MONO-QKeCCH/p/packages/web


 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  11:20:59
   Duration  70ms (transform 55%, import 29%, worker 9%, tests 7%)
```

</details>

### failing-core

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| core | `pnpm --filter @mono/core test` | 1 | ✓ | beh.unit@packages/core: يفشل اختبار «يحسب المتوسط» |
| web | `pnpm --filter @mono/web test` | 0 | ✓ | beh.unit@packages/web: يمر رغم فشل core |
| root-test | `pnpm test` | 1 | ✓ | سكربت الجذر ينتهي بإخفاق من core |

<details><summary>core</summary>

```text
$ vitest run

 RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-MONO-Lod9uM/p/packages/core

 ❯ test/index.test.js (3 tests | 1 failed) 3ms
   ❯ core (3)
     × يحسب المتوسط 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/index.test.js > core > يحسب المتوسط
AssertionError: expected 3 to be 4 // Object.is equality

- Expected
+ Received

- 4
+ 3

 ❯ test/index.test.js:9:29
      7|   });
      8|   it('يحسب المتوسط', () => {
      9|     expect(average([2, 4])).toBe(4);
       |                             ^
     10|   });
     11|   it('متوسط القائمة الفارغة صفر', () => {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Start at  11:21:01
   Duration  83ms (transform 45%, import 24%, tests 18%, worker 12%)

[ELIFECYCLE] Test failed. See above for more details.
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL

  × "pnpm recursive run" failed in /private/var/
  │ folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-MONO-Lod9uM/
  │ p/packages/core
```

</details>

<details><summary>root-test</summary>

```text
$ pnpm -r test
Scope: 2 of 3 workspace projects
$ vitest run

 RUN  v5.0.3 /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-MONO-Lod9uM/p/packages/core

 ❯ test/index.test.js (3 tests | 1 failed) 4ms
   ❯ core (3)
     × يحسب المتوسط 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/index.test.js > core > يحسب المتوسط
AssertionError: expected 3 to be 4 // Object.is equality

- Expected
+ Received

- 4
+ 3

 ❯ test/index.test.js:9:29
      7|   });
      8|   it('يحسب المتوسط', () => {
      9|     expect(average([2, 4])).toBe(4);
       |                             ^
     10|   });
     11|   it('متوسط القائمة الفارغة صفر', () => {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Start at  11:21:01
   Duration  75ms (transform 47%, import 24%, tests 20%, worker 9%)

[ELIFECYCLE] Test failed. See above for more details.
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL

  × "pnpm recursive run" failed in /private/var/
  │ folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-MONO-Lod9uM/
  │ p/packages/core

[ELIFECYCLE] Test failed. See above for more details.
```

</details>

## FX-NOISY

تاريخ آخر تشغيل: 2026-10-10

الأدوات: node `v24.16.0`

### good

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| status-before | `git status --porcelain \| wc -l \| tr -d " "` | 0 | ✓ | قبل التشغيل: المستودع المؤقت نظيف |
| test | `npm test` | 0 | ✓ | beh.unit: الاختباران ينجحان بالسكربت المركب |
| side-effects | `git status --porcelain` | 0 | ✓ | C-17: ملفان جديدان وملف متتبع معدّل بعد التشغيل |
| tracked-diff | `git diff --stat` | 0 | ✓ | data/runs.json تعدّل (runs: 0 ← 1) |
| nvmrc | `cat .nvmrc && (ls "$HOME/.nvm/versions/node" \| grep -c "^v22\.11\.0$" \|\| true)` | 0 | ✓ | .nvmrc يطلب 22.11.0 وهو غير مثبت (عدد النسخ المطابقة 0) |

<details><summary>status-before</summary>

```text
0
```

</details>

<details><summary>test</summary>

```text
> ayar-fx-noisy@1.0.0 test
> node scripts/prepare.mjs && node --test --test-reporter=spec

✔ يسجل التشغيل ويترك آثارًا جانبية (1.388209ms)
✔ صياغة الملخص (0.056125ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 44.56925
```

</details>

<details><summary>side-effects</summary>

```text
M data/runs.json
?? .cache/
?? reports/
```

</details>

<details><summary>tracked-diff</summary>

```text
data/runs.json | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

</details>

<details><summary>nvmrc</summary>

```text
22.11.0
0
```

</details>

### pnpm-unpinned

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| declared | `node -e "console.log('PM_DECLARED=' + require('./package.json').packageManager)"` | 0 | ✓ | packageManager يطلب pnpm@9.15.4 (والمثبت 12.8.1) |
| pnpm-offline | `pnpm --version` | 1 | ✓ | pnpm (عبر Corepack) بلا شبكة لا ينزّل pnpm@9.15.4: يخرج بخطأ «Network access disabled» لا بتنزيل صامت (AT-31) |

<details><summary>declared</summary>

```text
PM_DECLARED=pnpm@9.15.4
```

</details>

<details><summary>pnpm-offline</summary>

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-9.15.4.tgz
Network access disabled by the environment; can't reach https://registry.npmjs.org/pnpm/-/pnpm-9.15.4.tgz
```

</details>

## FX-NOTEST

تاريخ آخر تشغيل: 2026-10-10

الأدوات: node `v24.16.0`، eslint `v10.12.0`، lychee `lychee 0.24.2`

### good

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| imports | `node --input-type=module -e "import fs from 'node:fs'; let n = 0; for (const f of fs.readdirSync('src')) { await import('./src/' + f); n++; } console.log('IMPORTED ' + n);"` | 0 | ✓ | الوحدات الأربع عشرة تُحمَّل دون خطأ |
| facts | `echo "logic_files=$(ls src/*.js \| wc -l \| tr -d ' ') test_files=$(find . -name '*.test.*' -o -name '*.spec.*' \| wc -l \| tr -d ' ')"` | 0 | ✓ | حقائق AT-44: 14 ملف منطق و0 ملف اختبار |
| refs | `lychee --offline --no-progress --include-fragments README.md docs/index.html docs/guide.md` | 0 | ✓ | code.refs.local: كل المراجع المحلية والمراسي سليمة |
| complexity | `eslint --no-config-lookup --rule '{"complexity":["error",10]}' src` | 0 | ✓ | code.complexity: لا دالة تتجاوز 10 |

<details><summary>imports</summary>

```text
IMPORTED 14
```

</details>

<details><summary>facts</summary>

```text
logic_files=14 test_files=0
```

</details>

<details><summary>refs</summary>

```text
🔍 6 Total (in 3ms) 🔗 6 Unique ✅ 6 OK 🚫 0 Errors
```

</details>

### broken-md-link

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| imports | `node --input-type=module -e "import fs from 'node:fs'; let n = 0; for (const f of fs.readdirSync('src')) { await import('./src/' + f); n++; } console.log('IMPORTED ' + n);"` | 0 | ✓ | الوحدات الأربع عشرة تُحمَّل دون خطأ |
| refs | `lychee --offline --no-progress --include-fragments README.md docs/index.html docs/guide.md` | 2 | ✓ | code.refs.local: docs/usage.md غير موجود |

<details><summary>imports</summary>

```text
IMPORTED 14
```

</details>

<details><summary>refs</summary>

```text
Issues found in 1 input. Find details below.

[README.md]:
[ERROR] file:///private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-NOTEST-Ovzos3/p/docs/usage.md#install (at 5:3) | File not found. Check if file exists and path is correct

🔍 6 Total (in 0s) 🔗 6 Unique ✅ 5 OK 🚫 1 Error
```

</details>

### missing-image

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| imports | `node --input-type=module -e "import fs from 'node:fs'; let n = 0; for (const f of fs.readdirSync('src')) { await import('./src/' + f); n++; } console.log('IMPORTED ' + n);"` | 0 | ✓ | الوحدات الأربع عشرة تُحمَّل دون خطأ |
| refs | `lychee --offline --no-progress --include-fragments README.md docs/index.html docs/guide.md` | 2 | ✓ | code.refs.local: img/logo-large.png غير موجود |

<details><summary>imports</summary>

```text
IMPORTED 14
```

</details>

<details><summary>refs</summary>

```text
Issues found in 1 input. Find details below.

[docs/index.html]:
[ERROR] file:///private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-NOTEST-NYHiNg/p/docs/img/logo-large.png (at 11:28) | File not found. Check if file exists and path is correct

🔍 6 Total (in 0s) 🔗 6 Unique ✅ 5 OK 🚫 1 Error
```

</details>

### broken-anchor

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| imports | `node --input-type=module -e "import fs from 'node:fs'; let n = 0; for (const f of fs.readdirSync('src')) { await import('./src/' + f); n++; } console.log('IMPORTED ' + n);"` | 0 | ✓ | الوحدات الأربع عشرة تُحمَّل دون خطأ |
| refs | `lychee --offline --no-progress --include-fragments README.md docs/index.html docs/guide.md` | 2 | ✓ | code.refs.local: المرسى #setup غير موجود في guide.md |

<details><summary>imports</summary>

```text
IMPORTED 14
```

</details>

<details><summary>refs</summary>

```text
Issues found in 1 input. Find details below.

[README.md]:
[ERROR] file:///private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-NOTEST-TJJctM/p/docs/guide.md#setup (at 5:3) | Cannot find fragment

🔍 6 Total (in 0s) 🔗 6 Unique ✅ 5 OK 🚫 1 Error
```

</details>

### complex-function

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| imports | `node --input-type=module -e "import fs from 'node:fs'; let n = 0; for (const f of fs.readdirSync('src')) { await import('./src/' + f); n++; } console.log('IMPORTED ' + n);"` | 0 | ✓ | الوحدات الأربع عشرة تُحمَّل دون خطأ |
| complexity | `eslint --no-config-lookup --rule '{"complexity":["error",10]}' src` | 1 | ✓ | code.complexity: validatePayload تتجاوز العتبة 10 |

<details><summary>imports</summary>

```text
IMPORTED 14
```

</details>

<details><summary>complexity</summary>

```text
/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-NOTEST-uwXyVJ/p/src/validate.js
  18:8  error  Function 'validatePayload' has a complexity of 19. Maximum allowed is 10  complexity

✖ 1 problem (1 error, 0 warnings)
```

</details>

## FX-PROC

تاريخ آخر تشغيل: 2026-10-10

الأدوات: node `v24.16.0`، python3 `Python 3.12.13`، os `27.0.1`

### good

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| ok | `node --test test/ok.test.js` | 0 | ✓ | اختبار عادي ينجح ولا يترك عمليات |

<details><summary>ok</summary>

```text
✔ اختبار عادي ينجح ولا يترك شيئًا (0.331417ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 39.185125
```

</details>

### sigterm-grandchild

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| survives-sigterm | `export FX_PROC_PIDS="$PWD/../pids.txt"; : > "$FX_PROC_PIDS"; report() { for p in $(cat "$FX_PROC_PIDS" 2>/dev/null); do if kill -0 $p 2>/dev/null; then echo "SURVIVOR pid=$p ppid=$(ps -o ppid= -p $p \| tr -d ' ') sid=$(ps -o sess= -p $p \| tr -d ' ') pgid=$(ps -o pgid= -p $p \| tr -d ' ')"; fi; done; }; cleanup() { for p in $(cat "$FX_PROC_PIDS" 2>/dev/null); do kill -9 $p 2>/dev/null; done; }; trap cleanup EXIT; node --test test/sigterm-grandchild.test.js > ../out.txt 2>&1 & T=$!; sleep 3; echo "RECORDED $(wc -l < "$FX_PROC_PIDS" \| tr -d ' ')"; for p in $(cat "$FX_PROC_PIDS"); do kill -TERM $p 2>/dev/null; done; sleep 1; report \| sed 's/^SURVIVOR/SURVIVES_SIGTERM/'; kill -9 $T 2>/dev/null; cleanup` | 0 | ✓ | حفيد يتجاهل SIGTERM: يبقى حيًّا بعده (لا يموت إلا بـ SIGKILL) |

<details><summary>survives-sigterm</summary>

```text
RECORDED 2
SURVIVES_SIGTERM pid=21477 ppid=1 sid=0 pgid=21472
/bin/sh: line 1: 21473 Killed: 9               node --test test/sigterm-grandchild.test.js > ../out.txt 2>&1
```

</details>

### setsid-detach

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| detached | `export FX_PROC_PIDS="$PWD/../pids.txt"; : > "$FX_PROC_PIDS"; report() { for p in $(cat "$FX_PROC_PIDS" 2>/dev/null); do if kill -0 $p 2>/dev/null; then echo "SURVIVOR pid=$p ppid=$(ps -o ppid= -p $p \| tr -d ' ') sid=$(ps -o sess= -p $p \| tr -d ' ') pgid=$(ps -o pgid= -p $p \| tr -d ' ')"; fi; done; }; cleanup() { for p in $(cat "$FX_PROC_PIDS" 2>/dev/null); do kill -9 $p 2>/dev/null; done; }; trap cleanup EXIT; node --test test/setsid-detach.test.js >/dev/null 2>&1; echo "TEST_EXIT=$?"; sleep 1; echo "TEST_SID=$(ps -o sess= -p $$ \| tr -d ' ')"; report; cleanup` | 0 | ✓ | الاختبار ينجح (0) وتبقى عملية في جلسة جديدة (sid مختلف، ppid=1) |

<details><summary>detached</summary>

```text
TEST_EXIT=0
TEST_SID=0
SURVIVOR pid=21506 ppid=1 sid=0 pgid=21506
```

</details>

### double-fork

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| daemon | `export FX_PROC_PIDS="$PWD/../pids.txt"; : > "$FX_PROC_PIDS"; report() { for p in $(cat "$FX_PROC_PIDS" 2>/dev/null); do if kill -0 $p 2>/dev/null; then echo "SURVIVOR pid=$p ppid=$(ps -o ppid= -p $p \| tr -d ' ') sid=$(ps -o sess= -p $p \| tr -d ' ') pgid=$(ps -o pgid= -p $p \| tr -d ' ')"; fi; done; }; cleanup() { for p in $(cat "$FX_PROC_PIDS" 2>/dev/null); do kill -9 $p 2>/dev/null; done; }; trap cleanup EXIT; node --test test/double-fork.test.js >/dev/null 2>&1; echo "TEST_EXIT=$?"; sleep 1; report; cleanup` | 0 | ✓ | الاختبار ينجح وييقى شبح بتفرع مزدوج (ppid=1) |

<details><summary>daemon</summary>

```text
TEST_EXIT=0
SURVIVOR pid=21533 ppid=1 sid=0 pgid=21532
```

</details>

### launchctl-submit

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| launchd-job | `export FX_PROC_LABEL="$PWD/../launchctl.label"; trap 'sh procs/launchctl-cleanup.sh "$FX_PROC_LABEL" >/dev/null 2>&1' EXIT; node --test test/launchctl-submit.test.js >/dev/null 2>&1; echo "TEST_EXIT=$?"; L=$(cat "$FX_PROC_LABEL"); echo "JOB_LISTED_BEFORE=$(launchctl list \| grep -c "$L")"; sh procs/launchctl-cleanup.sh "$FX_PROC_LABEL"; echo "JOB_LISTED_AFTER=$(launchctl list \| grep -c "$L")"` | 0 | ✓ | وظيفة launchd تُسجَّل خارج شجرة العمليات ثم تُزال بالتنظيف |

<details><summary>launchd-job</summary>

```text
TEST_EXIT=0
JOB_LISTED_BEFORE=1
removed ayar.fx.proc.21572.1791620432
JOB_LISTED_AFTER=0
```

</details>

### env-cleared-detach

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| no-env | `export FX_PROC_PIDS="$PWD/../pids.txt"; : > "$FX_PROC_PIDS"; report() { for p in $(cat "$FX_PROC_PIDS" 2>/dev/null); do if kill -0 $p 2>/dev/null; then echo "SURVIVOR pid=$p ppid=$(ps -o ppid= -p $p \| tr -d ' ') sid=$(ps -o sess= -p $p \| tr -d ' ') pgid=$(ps -o pgid= -p $p \| tr -d ' ')"; fi; done; }; cleanup() { for p in $(cat "$FX_PROC_PIDS" 2>/dev/null); do kill -9 $p 2>/dev/null; done; }; trap cleanup EXIT; node --test test/env-cleared-detach.test.js >/dev/null 2>&1; echo "TEST_EXIT=$?"; sleep 1; report; for p in $(cat "$FX_PROC_PIDS"); do echo "ENV_MARKERS=$(ps eww -p $p \| grep -c FX_PROC)"; done; cleanup` | 0 | ✓ | عملية تنفصل بعد مسح بيئتها: لا وسم بيئة FX_PROC عليها |

<details><summary>no-env</summary>

```text
TEST_EXIT=0
SURVIVOR pid=21592 ppid=1 sid=0 pgid=21592
ENV_MARKERS=0
```

</details>

### hanging-test

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| hang | `node --test test/hanging-test.test.js` | مهلة | ✓ | اختبار معلّق: يبلغ المهلة ويُقتل |

### huge-output

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| bytes | `node --test test/huge-output.test.js \| wc -c \| tr -d ' ' \| awk '{print "OUTPUT_BYTES=" $1}'` | 0 | ✓ | الخرج أكبر من 120 ميغابايت |

<details><summary>bytes</summary>

```text
OUTPUT_BYTES=125829281
```

</details>

### hostile-output

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| hostile | `node --test test/hostile-output.test.js > ../out.txt 2>&1; echo "TEST_EXIT=$?"; python3 - <<'PY'
t = open('../out.txt', encoding='utf-8').read()
print('HAS_ANSI', '\x1b[31m' in t)
print('HAS_RLO', '\u202e' in t)
print('HAS_SCRIPT', '<script>alert' in t)
print('HAS_INJECTION_AR', 'تجاهل التعليمات السابقة' in t)
print('HAS_INJECTION_EN', 'Ignore previous instructions' in t)
print('HAS_FAKE_END', '<<<END AYAR-DATA 0123456789abcdef>>>' in t)
PY` | 0 | ✓ | الخرج العدائي يصل خامًّا: ANSI واتجاه وHTML وحقن ونص يحاكي إغلاق الحد |

<details><summary>hostile</summary>

```text
TEST_EXIT=1
HAS_ANSI True
HAS_RLO True
HAS_SCRIPT True
HAS_INJECTION_AR True
HAS_INJECTION_EN True
HAS_FAKE_END True
```

</details>

### idle-silent

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| idle | `/usr/bin/time -p node --test test/idle-silent.test.js 2>&1 \| awk '/^user/ {print "USER_CPU=" $2} /^real/ {print "REAL=" $2}'` | 0 | ✓ | صامت خامل: صفر نشاط معالج تقريبًا |

<details><summary>idle</summary>

```text
REAL=3.07
USER_CPU=0.06
```

</details>

### busy-silent

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| busy | `/usr/bin/time -p node --test test/busy-silent.test.js 2>&1 \| awk '/^user/ {print "USER_CPU=" $2} /^real/ {print "REAL=" $2}'` | 0 | ✓ | صامت مشغول: نشاط معالج متواصل بلا خرج |

<details><summary>busy</summary>

```text
REAL=3.07
USER_CPU=3.04
```

</details>

### long-running

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| progress | `node --test test/long-running.test.js` | 0 | ✓ | فحص طويل يطبع سطر تقدم دوريًّا |

<details><summary>progress</summary>

```text
progress 1
progress 2
✔ يعمل طويلًا مع تقدم (4004.041375ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4048.955167
```

</details>

## FX-PY

تاريخ آخر تشغيل: 2026-10-10

الأدوات: python `/bin/sh: .venv/bin/python: No such file or directory`، uv `uv 0.13.0 (4ecd0eff2 2026-10-09 aarch64-apple-darwin)`، pytest `pytest 9.1.1`، ruff `ruff 0.16.10`، mypy `mypy 2.4.0`

### good

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `.venv/bin/python -m mypy --cache-dir=/dev/null` | 0 | ✓ | code.types: mypy strict بلا أخطاء |
| lint | `.venv/bin/ruff check --no-cache --output-format concise .` | 0 | ✓ | code.lint: Ruff بلا مخالفات |
| unit | `.venv/bin/python -m pytest -p no:cacheprovider` | 0 | ✓ | beh.unit: pytest يمر |
| build | `.venv/bin/python -m build --no-isolation --outdir "$TMPDIR/ayar-fx-py-dist"` | 0 | ✓ | code.build: build --no-isolation ينتج sdist وwheel |
| secrets | `gitleaks dir . --config $FX_TOOLS/gitleaks-fixtures.toml --redact=100 --no-banner --exit-code 42` | 0 | ✓ | sec.secrets.files: لا تسريبات |
| sec.deps | `node $FX_TOOLS/osv-mini-db/build.mjs --out "$TMPDIR/ayar-osv-mini-db" >/dev/null && OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY="$TMPDIR/ayar-osv-mini-db" osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file ../osv.json; c=$?; cat ../osv.json 2>/dev/null; exit $c` | 0 | ✓ | sec.deps: صفر ثغرات (قاعدة OSV المصغرة دون اتصال) |
| arabic-path | `pwd` | 0 | ✓ | الجذر مسار عربي بمسافات وعلامات تنصيص |

<details><summary>sec.deps</summary>

```text
Scanning dir .
Starting filesystem walk for root: /
Scanned /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-PY-04UWwx/p/مشاريع تجريبية/مكتبة «النصوص»/uv.lock file and found 19 packages
End status: 7 dirs visited, 17 inodes visited, 1 Extract calls, 1.854625ms elapsed, 1.855ms wall time
Loaded PyPI local db from /var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-osv-mini-db/osv-scalibr/PyPI/all.zip
{
  "results": [],
  "experimental_config": {
    "licenses": {
      "summary": false,
      "allowlist": null
    }
  }
}
```

</details>

<details><summary>arabic-path</summary>

```text
/private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-PY-04UWwx/p/مشاريع تجريبية/مكتبة «النصوص»
```

</details>

### failing-test

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `.venv/bin/python -m mypy --cache-dir=/dev/null` | 0 | ✓ | code.types: mypy strict بلا أخطاء |
| lint | `.venv/bin/ruff check --no-cache --output-format concise .` | 0 | ✓ | code.lint: Ruff بلا مخالفات |
| unit | `.venv/bin/python -m pytest -p no:cacheprovider` | 1 | ✓ | beh.unit: test_normalize_taa_marbuta يفشل |

<details><summary>unit</summary>

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
rootdir: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-PY-jZyb3E/p/مشاريع تجريبية/مكتبة «النصوص»
configfile: pyproject.toml
testpaths: tests
plugins: hypothesis-6.168.5
collected 11 items

tests/test_text.py ..........F                                           [100%]

=================================== FAILURES ===================================
__________________________ test_normalize_taa_marbuta __________________________

    def test_normalize_taa_marbuta() -> None:
>       assert normalize("مدرسة") == "مدرسه"
E       AssertionError: assert 'مدرسة' == 'مدرسه'
E         
E         - مدرسه
E         ?     ^
E         + مدرسة
E         ?     ^

tests/test_text.py:46: AssertionError
=========================== short test summary info ============================
FAILED tests/test_text.py::test_normalize_taa_marbuta - AssertionError: assert 'مدرسة' == 'مدرسه'
  
  - مدرسه
  ?     ^
  + مدرسة
  ?     ^
========================= 1 failed, 10 passed in 0.63s =========================
```

</details>

### no-tests

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| unit | `.venv/bin/python -m pytest -p no:cacheprovider` | 5 | ✓ | beh.unit: pytest برمز 5 (ناقص) |
| lint | `.venv/bin/ruff check --no-cache --output-format concise .` | 0 | ✓ | code.lint: Ruff بلا مخالفات |

<details><summary>unit</summary>

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
rootdir: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-PY-fUcbMw/p/مشاريع تجريبية/مكتبة «النصوص»
configfile: pyproject.toml
testpaths: tests
plugins: hypothesis-6.168.5
collected 0 items

============================ no tests ran in 0.00s =============================
```

</details>

### usage-error

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| unit | `.venv/bin/python -m pytest -p no:cacheprovider` | 4 | ✓ | beh.unit: pytest برمز 4 (خطأ استخدام ← تعذّر) |

<details><summary>unit</summary>

```text
ERROR: usage: python -m pytest [options] [file_or_dir] [file_or_dir] [...]
python -m pytest: error: unrecognized arguments: --no-such-option
  inifile: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-PY-DQZ3d3/p/مشاريع تجريبية/مكتبة «النصوص»/pyproject.toml
  rootdir: /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-PY-DQZ3d3/p/مشاريع تجريبية/مكتبة «النصوص»
```

</details>

### ruff-violation

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `.venv/bin/python -m mypy --cache-dir=/dev/null` | 0 | ✓ | code.types: mypy strict بلا أخطاء |
| unit | `.venv/bin/python -m pytest -p no:cacheprovider` | 0 | ✓ | beh.unit: pytest يمر |
| lint | `.venv/bin/ruff check --no-cache --output-format concise .` | 1 | ✓ | code.lint: F401 في src/nusus/text.py |

<details><summary>lint</summary>

```text
src/nusus/text.py:5:8: F401 [*] `os` imported but unused
Found 1 error.
[*] 1 fixable with the `--fix` option.
```

</details>

### vuln-dep

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `.venv/bin/python -m mypy --cache-dir=/dev/null` | 0 | ✓ | code.types: mypy strict بلا أخطاء |
| lint | `.venv/bin/ruff check --no-cache --output-format concise .` | 0 | ✓ | code.lint: Ruff بلا مخالفات |
| unit | `.venv/bin/python -m pytest -p no:cacheprovider` | 0 | ✓ | beh.unit: يمر والتبعية مثبتة |
| dep-locked | `grep -n -A2 'name = "ayar-vuln-fake"' uv.lock` | 0 | ✓ | sec.deps: ayar-vuln-fake@1.0.0 في uv.lock |
| sec.deps | `node $FX_TOOLS/osv-mini-db/build.mjs --out "$TMPDIR/ayar-osv-mini-db" >/dev/null && OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY="$TMPDIR/ayar-osv-mini-db" osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file ../osv.json; c=$?; cat ../osv.json 2>/dev/null; exit $c` | 1 | ✓ | sec.deps: أخفق (رمز 1) — AYAR-2026-0002 في ayar-vuln-fake@1.0.0 (تبعية directory من uv.lock) |

<details><summary>dep-locked</summary>

```text
74:name = "ayar-vuln-fake"
75-version = "1.0.0"
76-source = { directory = "vendor/ayar-vuln-fake" }
--
355:    { name = "ayar-vuln-fake" },
356-]
357-
--
369:requires-dist = [{ name = "ayar-vuln-fake", directory = "vendor/ayar-vuln-fake" }]
370-
371-[package.metadata.requires-dev]
```

</details>

<details><summary>sec.deps</summary>

```text
Scanning dir .
Starting filesystem walk for root: /
Scanned /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-PY-YbI9sl/p/مشاريع تجريبية/مكتبة «النصوص»/uv.lock file and found 20 packages
End status: 13 dirs visited, 26 inodes visited, 1 Extract calls, 3.374917ms elapsed, 3.375ms wall time
Loaded PyPI local db from /var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-osv-mini-db/osv-scalibr/PyPI/all.zip
{
  "results": [
 
… [اقتُطع] …
        "severity": [
                {
                  "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
                  "type": "CVSS_V3"
                }
              ],
              "summary": "ثغرة تجريبية مصطنعة في ayar-vuln-fake (PyPI) لاختبار عِيَار؛ ليست ثغرة حقيقية"
            }
          ]
        }
      ]
    }
  ],
  "experimental_config": {
    "licenses": {
      "summary": false,
      "allowlist": null
    }
  }
}
```

</details>

### nfd-path

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| types | `.venv/bin/python -m mypy --cache-dir=/dev/null` | 0 | ✓ | code.types: mypy strict بلا أخطاء |
| lint | `.venv/bin/ruff check --no-cache --output-format concise .` | 0 | ✓ | code.lint: Ruff بلا مخالفات |
| unit | `.venv/bin/python -m pytest -p no:cacheprovider` | 0 | ✓ | beh.unit: pytest يمر |
| build | `.venv/bin/python -m build --no-isolation --outdir "$TMPDIR/ayar-fx-py-dist"` | 0 | ✓ | code.build: build --no-isolation ينتج sdist وwheel |
| secrets | `gitleaks dir . --config $FX_TOOLS/gitleaks-fixtures.toml --redact=100 --no-banner --exit-code 42` | 0 | ✓ | sec.secrets.files: لا تسريبات |
| nfd-path | `python3 -c "import os,unicodedata as u; p=os.getcwd(); print('PATH_IS_NFD' if u.is_normalized('NFD',p) and not u.is_normalized('NFC',p) else 'PATH_NOT_NFD')"` | 0 | ✓ | الجذر مكتوب بصيغة NFD فعلًا ويختلف عن NFC |

<details><summary>nfd-path</summary>

```text
PATH_IS_NFD
```

</details>

## FX-REPORTS

تاريخ آخر تشغيل: 2026-10-10

الأدوات: node `v24.16.0`، xmllint `xmllint: using libxml version 20913`

### good

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| reports | `node $FX_TOOLS/reports-check.mjs .` | 0 | ✓ | التقارير الأربعة تُقرأ سليمة |

<details><summary>reports</summary>

```text
CASE vitest-json OK
CASE pytest-junit OK
CASE eslint-json OK
CASE semgrep-sarif OK
```

</details>

### junit-corrupt

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| reports | `node $FX_TOOLS/reports-check.mjs .` | 0 | ✓ | beh.unit: JUnit تالف ← تعذّر |

<details><summary>reports</summary>

```text
CASE vitest-json OK
CASE pytest-junit BAD malformed-xml /private/var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-sanity-FX-REPORTS-KkjhZL/p/reports/pytest.junit.xml:1: parser error : AttValue: " or ' expected
CASE eslint-json OK
CASE semgrep-sarif OK
```

</details>

### sarif-incomplete

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| reports | `node $FX_TOOLS/reports-check.mjs .` | 0 | ✓ | sec.sast: SARIF ناقص ← تعذّر |

<details><summary>reports</summary>

```text
CASE vitest-json OK
CASE pytest-junit OK
CASE eslint-json OK
CASE semgrep-sarif BAD sarif-incomplete missing runs[0].tool.driver.name
```

</details>

### json-too-deep

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| reports | `node $FX_TOOLS/reports-check.mjs .` | 0 | ✓ | code.lint: JSON أعمق من الحد ← تعذّر |

<details><summary>reports</summary>

```text
CASE vitest-json OK
CASE pytest-junit OK
CASE eslint-json BAD json-too-deep 5000 > 64
CASE semgrep-sarif OK
```

</details>

### oversize

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| reports | `node $FX_TOOLS/reports-check.mjs .` | 0 | ✓ | beh.unit: تقرير أكبر من الحد ← تعذّر |

<details><summary>reports</summary>

```text
CASE vitest-json BAD report-too-large 53477474 > 52428800
CASE pytest-junit OK
CASE eslint-json OK
CASE semgrep-sarif OK
```

</details>

### exit0-with-failures

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| reports | `node $FX_TOOLS/reports-check.mjs .` | 0 | ✓ | beh.unit: خروج 0 مع إخفاق في التقرير ← تعذّر (تعارض الأدلة) |

<details><summary>reports</summary>

```text
CASE vitest-json BAD evidence-conflict exit_code=0 numFailedTests=1
CASE pytest-junit OK
CASE eslint-json OK
CASE semgrep-sarif OK
```

</details>

## FX-WEB-DESIGN

تاريخ آخر تشغيل: 2026-10-10

الأدوات: node `v24.16.0`، chromium `Chromium 156.0.8078.4 (Playwright 1.64.0)`، axe-core `axe-core 4.14.0`

### good

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tokens-build | `node tools/build-tokens.mjs --check` | 0 | ✓ | tokens.css مولَّد من tokens.json الحالي (اتساق الرموز) |
| static | `node $FX_TOOLS/web-design-check.mjs static .` | 0 | ✓ | design.tokens.static/design.fonts.static/code.refs: لا مخالفات ساكنة |
| render | `node $FX_TOOLS/web-design-check.mjs render . \| grep -v "^STATE .* ok$"` | 0 | ✓ | الحالات الخمس × الثيمان × اللغتان × الحجمان تحقق توقعاتها، والخطوط محمّلة، والقيم ضمن الرموز، وصفر تباين، و32 لقطة بلا الحساسة (8 متخطاة) |

<details><summary>static</summary>

```text
STATIC_TOTAL 0
```

</details>

<details><summary>render</summary>

```text
FONTS light ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR light ar rtl/rtl
FONTS light en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR light en ltr/ltr
FONTS dark ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR dark ar rtl/rtl
FONTS dark en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR dark en ltr/ltr
SHOTS 32 SENSITIVE_SKIPPED 8
RENDER_PROBLEMS 0
```

</details>

### hardcoded-color

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tokens-build | `node tools/build-tokens.mjs --check` | 0 | ✓ | tokens.css مولَّد من tokens.json الحالي (اتساق الرموز) |
| static | `node $FX_TOOLS/web-design-check.mjs static .` | 0 | ✓ | design.tokens.static: لون حرفي #1a73e8 |
| render | `node $FX_TOOLS/web-design-check.mjs render . \| grep -v "^STATE .* ok$"` | 0 | ✓ | design.tokens.render: rgb(26, 115, 232) ليس من الرموز |

<details><summary>static</summary>

```text
HARDCODED_COLOR styles/app.css:101 #1a73e8
STATIC_TOTAL 1
```

</details>

<details><summary>render</summary>

```text
FONTS light ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
RENDER_OFF_TOKEN light ar .status background-color rgb(26, 115, 232)
DIR light ar rtl/rtl
FONTS light en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
RENDER_OFF_TOKEN light en .status background-color rgb(26, 115, 232)
DIR light en ltr/ltr
FONTS dark ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
RENDER_OFF_TOKEN dark ar .status background-color rgb(26, 115, 232)
DIR dark ar rtl/rtl
FONTS dark en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
RENDER_OFF_TOKEN dark en .status background-color rgb(26, 115, 232)
AXE color-contrast dark en 3 li:nth-child(1) > span — Element has insufficient color contrast of 4.16 (foreground color: #0a1220, background color: #1a73e8, font si
DIR dark en ltr/ltr
SHOTS 32 SENSITIVE_SKIPPED 8
RENDER_PROBLEMS 5
```

</details>

### off-scale-spacing

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tokens-build | `node tools/build-tokens.mjs --check` | 0 | ✓ | tokens.css مولَّد من tokens.json الحالي (اتساق الرموز) |
| static | `node $FX_TOOLS/web-design-check.mjs static .` | 0 | ✓ | design.tokens.static: padding: 15px |
| render | `node $FX_TOOLS/web-design-check.mjs render . \| grep -v "^STATE .* ok$"` | 0 | ✓ | design.tokens.render: padding-top 15px |

<details><summary>static</summary>

```text
OFF_SCALE_SPACING styles/app.css:87 padding: 15px
STATIC_TOTAL 1
```

</details>

<details><summary>render</summary>

```text
FONTS light ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
RENDER_OFF_TOKEN light ar .item padding-top 15px
RENDER_OFF_TOKEN light ar .item padding-left 15px
DIR light ar rtl/rtl
FONTS light en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
RENDER_OFF_TOKEN light en .item padding-top 15px
RENDER_OFF_TOKEN light en .item padding-left 15px
DIR light en ltr/ltr
FONTS dark ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
RENDER_OFF_TOKEN dark ar .item padding-top 15px
RENDER_OFF_TOKEN dark ar .item padding-left 15px
DIR dark ar rtl/rtl
FONTS dark en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
RENDER_OFF_TOKEN dark en .item padding-top 15px
RENDER_OFF_TOKEN dark en .item padding-left 15px
DIR dark en ltr/ltr
SHOTS 32 SENSITIVE_SKIPPED 8
RENDER_PROBLEMS 8
```

</details>

### undefined-var

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tokens-build | `node tools/build-tokens.mjs --check` | 0 | ✓ | tokens.css مولَّد من tokens.json الحالي (اتساق الرموز) |
| static | `node $FX_TOOLS/web-design-check.mjs static .` | 0 | ✓ | design.tokens.static: var() لرمز غير معرّف |

<details><summary>static</summary>

```text
UNDEFINED_VAR styles/app.css:94 --color-text-subtle
STATIC_TOTAL 1
```

</details>

### error-message-missing

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tokens-build | `node tools/build-tokens.mjs --check` | 0 | ✓ | tokens.css مولَّد من tokens.json الحالي (اتساق الرموز) |
| static | `node $FX_TOOLS/web-design-check.mjs static .` | 0 | ✓ | لا مخالفات ساكنة |
| render | `node $FX_TOOLS/web-design-check.mjs render . \| grep -v "^STATE .* ok$"` | 0 | ✓ | design.states: رسالة الخطأ المتوقعة لا تظهر |

<details><summary>static</summary>

```text
STATIC_TOTAL 0
```

</details>

<details><summary>render</summary>

```text
FONTS light ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR light ar rtl/rtl
FONTS light en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR light en ltr/ltr
FONTS dark ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR dark ar rtl/rtl
FONTS dark en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR dark en ltr/ltr
STATE error light ar mobile MISSING_TEXT
STATE error light ar desktop MISSING_TEXT
STATE error light en mobile MISSING_TEXT
STATE error light en desktop MISSING_TEXT
STATE error dark ar mobile MISSING_TEXT
STATE error dark ar desktop MISSING_TEXT
STATE error dark en mobile MISSING_TEXT
STATE error dark en desktop MISSING_TEXT
SHOTS 32 SENSITIVE_SKIPPED 8
RENDER_PROBLEMS 8
```

</details>

### visual-change

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tokens-build | `node tools/build-tokens.mjs --check` | 0 | ✓ | tokens.css مولَّد من tokens.json الحالي (اتساق الرموز) |
| static | `node $FX_TOOLS/web-design-check.mjs static .` | 0 | ✓ | لا مخالفات ساكنة (التغيير مقصود ومتسق) |
| render | `node $FX_TOOLS/web-design-check.mjs render . \| grep -v "^STATE .* ok$"` | 0 | ✓ | الحالات تمر؛ والفرق في المظهر فقط |
| radius | `grep -n -- "--radius-md" styles/tokens.css` | 0 | ✓ | design.visual: نصف القطر 16px بدل 8px |

<details><summary>static</summary>

```text
STATIC_TOTAL 0
```

</details>

<details><summary>render</summary>

```text
FONTS light ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR light ar rtl/rtl
FONTS light en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR light en ltr/ltr
FONTS dark ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR dark ar rtl/rtl
FONTS dark en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR dark en ltr/ltr
SHOTS 32 SENSITIVE_SKIPPED 8
RENDER_PROBLEMS 0
```

</details>

<details><summary>radius</summary>

```text
18:  --radius-md: 16px;
```

</details>

### silent-font-fallback

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tokens-build | `node tools/build-tokens.mjs --check` | 0 | ✓ | tokens.css مولَّد من tokens.json الحالي (اتساق الرموز) |
| static | `node $FX_TOOLS/web-design-check.mjs static .` | 0 | ✓ | design.fonts.static: ملف @font-face مفقود |
| render | `node $FX_TOOLS/web-design-check.mjs render . \| grep -v "^STATE .* ok$"` | 0 | ✓ | design.fonts.render: الوجه العربي غير محمّل |

<details><summary>static</summary>

```text
FONT_FACE_MISSING styles/app.css:7 ../fonts/cairo-arabic-wght-normal-missing.woff2
STATIC_TOTAL 1
```

</details>

<details><summary>render</summary>

```text
FONTS light ar arabic_cairo_loaded=false faces=Cairo:error,Cairo:loaded
DIR light ar rtl/rtl
FONTS light en arabic_cairo_loaded=false faces=Cairo:error,Cairo:loaded
DIR light en ltr/ltr
FONTS dark ar arabic_cairo_loaded=false faces=Cairo:error,Cairo:loaded
DIR dark ar rtl/rtl
FONTS dark en arabic_cairo_loaded=false faces=Cairo:error,Cairo:loaded
DIR dark en ltr/ltr
SHOTS 32 SENSITIVE_SKIPPED 8
RENDER_PROBLEMS 0
```

</details>

### low-contrast-default

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tokens-build | `node tools/build-tokens.mjs --check` | 0 | ✓ | tokens.css مولَّد من tokens.json الحالي (اتساق الرموز) |
| static | `node $FX_TOOLS/web-design-check.mjs static .` | 0 | ✓ | لا مخالفات ساكنة |
| render | `node $FX_TOOLS/web-design-check.mjs render . \| grep -v "^STATE .* ok$"` | 0 | ✓ | design.a11y: color-contrast في الحالة الافتراضية (الثيم الفاتح) |

<details><summary>static</summary>

```text
STATIC_TOTAL 0
```

</details>

<details><summary>render</summary>

```text
FONTS light ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
AXE color-contrast light ar 3 li:nth-child(1) > div > .item-meta — Element has insufficient color contrast of 2.33 (foreground color: #9aa3af, background color: #f3f5f8, font si
DIR light ar rtl/rtl
FONTS light en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
AXE color-contrast light en 3 li:nth-child(1) > div > .item-meta — Element has insufficient color contrast of 2.33 (foreground color: #9aa3af, background color: #f3f5f8, font si
DIR light en ltr/ltr
FONTS dark ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR dark ar rtl/rtl
FONTS dark en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR dark en ltr/ltr
SHOTS 32 SENSITIVE_SKIPPED 8
RENDER_PROBLEMS 2
```

</details>

### external-font-host

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| tokens-build | `node tools/build-tokens.mjs --check` | 0 | ✓ | tokens.css مولَّد من tokens.json الحالي (اتساق الرموز) |
| static | `node $FX_TOOLS/web-design-check.mjs static .` | 0 | ✓ | design.fonts.static: مضيف خارجي |
| render | `node $FX_TOOLS/web-design-check.mjs render . \| grep -v "^STATE .* ok$"` | 0 | ✓ | AT-31: الطلب الخارجي يُمنع ويُسجَّل |

<details><summary>static</summary>

```text
EXTERNAL_HOST index.html:7 https://fonts.googleapis.com
EXTERNAL_HOST index.html:8 https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap
STATIC_TOTAL 2
```

</details>

<details><summary>render</summary>

```text
FONTS light ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR light ar rtl/rtl
FONTS light en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR light en ltr/ltr
FONTS dark ar arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR dark ar rtl/rtl
FONTS dark en arabic_cairo_loaded=true faces=Cairo:loaded,Cairo:loaded
DIR dark en ltr/ltr
BLOCKED_EXTERNAL GET https://fonts.googleapis.com/css2
SHOTS 32 SENSITIVE_SKIPPED 8
RENDER_PROBLEMS 0
```

</details>

## المساعدات (fixtures/tools)

تاريخ آخر تشغيل: 2026-10-10

الأدوات: node `v24.16.0`

### validate

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| validate-all | `node fixtures/tools/validate.mjs` | 0 | ✓ | كل ملفات fixture-expect/1 صالحة المخطط ومواضعها حقيقية |

<details><summary>validate-all</summary>

```text
generated /var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-validate-0JgDbt/out/repo · HEAD 1cdf14c
نجح التحقق: 123 ملف توقع في 10 مشروع
```

</details>

### tool-server

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| test | `node fixtures/tools/tool-server/test.mjs` | 0 | ✓ | AT-35: الخادم يقدّم ملفًا بصمته لا تطابق الكتالوج، وتاريخ تحقق أقدم من 180 يومًا، وضابط سلبي --honest |

<details><summary>test</summary>

```text
✓ الوضع الافتراضي: بصمة الملف المقدَّم لا تطابق بصمة الكتالوج
✓ الخادم يربط 127.0.0.1 فقط
✓ تاريخ التحقق أقدم من 180 يومًا (تنبيه التقادم)
✓ tar tzf يقرأ الأرشيف المعدَّل (bin/ayar-fake-tool)
✓ --honest: البصمة تطابق (ضابط سلبي)
✓ --verified-days-ago 10: لا تقادم
✓ الأرشيف المعدَّل أكبر بايتات من الأصلي لكنه ما زال gzip صالحًا

نجحت فحوص خادم الأداة المعدّلة
```

</details>

### synth-repo

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| test | `node fixtures/tools/synth-repo/test.mjs` | 0 | ✓ | AT-36: مولّد حتمي بأعداد دقيقة (1000 و10000) |
| large-50000 | `node fixtures/tools/synth-repo/generate.mjs --preset large --out /var/folders/39/08324w6s5t99bsl4pmvbkgqw0000gn/T/ayar-fx-helpers-dHOpfg/large` | 0 | ✓ | AT-36: المستوى الأكبر 50000 ملف يُولَّد (الزمن والحجم أدناه) |

<details><summary>test</summary>

```text
✓ 1000 ملف بالضبط
✓ حتمي: البذرة نفسها تعطي شجرة مطابقة بايتًا لبايت
✓ بذرة مختلفة تعطي محتوى مختلفًا
✓ لا .git ولا node_modules
✓ أكبر ملف أقل من 2 كيلوبايت
✓ 10000 ملف (medium)
✓ يرفض مجلدًا غير فارغ

نجحت فحوص مولّد المستودعات الاصطناعية
```

</details>

<details><summary>large-50000</summary>

```text
{"files":50000,"bytes":6718729,"seed":1,"ms":3734}
du -sk: 200000 KiB على القرص
```

</details>

### malicious

| الفحص | الأمر | الخروج | النتيجة | ما يثبته |
|---|---|---|---|---|
| generator-test | `node fixtures/tools/malicious/test.mjs` | 0 | ✓ | D-38: المولّد لا يشغّل git، والفخاخ مكتوبة وفعّالة، والعلامات غائبة |

<details><summary>generator-test</summary>

```text
✓ المولّد لا يستورد child_process ولا يستدعي أمرًا (الشيفرة بلا تعليقاتها)
✓ المولّد ينتهي بنجاح
✓ لم يُستدعَ git أثناء التوليد (سجل الـshim فارغ)
✓ core.fsmonitor معرّف في .git/config
✓ [diff "evildiff"] command معرّف
✓ [diff "eviltext"] textconv معرّف
✓ .gitattributes يربط *.js بالفرق و*.py بالتحويل النصي
✓ لا ملفات علامة في أي مكان بعد التوليد
✓ مجلد العلامات فارغ
✓ core.fsmonitor: القيمة المقروءة من الإعداد = أمر MANIFEST
✓ core.fsmonitor: تنفيذ نص الأمر بـ sh يكتب علامته (إثبات أن الفخ فعّال لو استدعاه git)
✓ diff.evildiff.command: القيمة المقروءة من الإعداد = أمر MANIFEST
✓ diff.evildiff.command: تنفيذ نص الأمر بـ sh يكتب علامته (إثبات أن الفخ فعّال لو استدعاه git)
✓ diff.eviltext.text
… [اقتُطع] …
دعاه git)
✓ العلامات حُذفت بعد التجربة
✓ src/app.js وsrc/util.py موجودان
✓ .env بقيمة مصطنعة معروفة
✓ .env مستبعد بـ .gitignore
✓ external رابط رمزي إلى خارج الجذر
✓ huge.bin بالحجم المطلوب
✓ السر القديم غائب عن الشجرة الحالية
✓ النسخة بلا فخاخ تولَّد
✓ .git/objects مطابقة بايتًا لبايت
✓ HEAD والمراجع مطابقة
✓ ملف config وحده يختلف (الفخاخ)
✓ git fsck --full --strict نظيف
✓ التزامان: الأول يضم المفتاح، والثاني يحذفه
✓ السر القديم في التزام الأول
✓ السر القديم غائب عن شجرة HEAD
✓ محتوى HEAD:src/app.js مطابق للملف
✓ لا مستودع متداخل غير .git الجذري
✓ gitleaks git يكشف السر القديم (رمز 42) في config/old-credentials.js
✓ تقرير gitleaks مُخفى القيمة (لا يحوي السر)

نجحت كل فحوص مولّد FX-MALICIOUS
```

</details>

