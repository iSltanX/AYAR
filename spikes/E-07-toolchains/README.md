# E-07 — سلاسل الأدوات ومديرو الإصدارات وأعلام الأدوات ورموز خروجها

**المعيار (الخطة 22):** دعم ما هو موجود فعلًا أولًا، وتوثيق غيره دعمًا محدودًا.

**ما يُفحص:** جرد للقراءة مع `--version`، وتجربة shims في مجلد مؤقت، والتحقق من خيارات `uv run` التي تمنع المزامنة وسلوك `poetry run`، وتشغيل المحولات على مشاريع المحولات (FX-ADAPTERS) بنسخها السليمة والمعيبة وخطأ الإعداد، ومعه **رموز الخروج الفعلية** لكل أداة في جدول AT-14. ومعه ملاحظة G-35 (حجب المتغيرات الحساسة) وE-06/G-49 (دوال nvm).

## الملفات

| السكربت | ما يفعله | النتائج |
|---|---|---|
| `inventory.mjs` | جرد للقراءة: كل أداة في مجلدات PATH الاحتياطية (C-07 الخطوة 2) ومجلدات nvm مع `--version`، ومجلدات مديري الإصدارات (C-07 الخطوة 3) دون تشغيلها، و`whence -w` في صدفة المالك | `results/inventory.json` و`inventory.md` |
| `shims.mjs` | corepack وpnpm مع `packageManager` غير مثبت (FX-NOISY/pnpm-unpinned)، وnvm مع `.nvmrc` غير مثبت وقراءة `alias/default` من الملفات، وmise (منزَّل مثبت الإصدار) في مجلد مؤقت مع نسخة غير مثبتة | `results/shims.json` |
| `python-runners.mjs` | أعلام `uv run` على FX-PY بقفل قديم مع لقطة حالة لـ `.venv` و`uv.lock` قبل كل حالة وبعدها؛ و`poetry run` (Poetry 2.5.1) على مشروع مؤقت | `results/python-runners.json` |
| `adapters.mjs` | استدعاء كل محول كما في C-15 (بأعلام التقارير) على 72 نسخة من FX-ADAPTERS: رمز الخروج، والتقارير، والآثار في شجرة المشروع | `results/exit-codes.json` و**`exit-codes.md`** (مرجع DEV-6) |
| `node-test-reporters.mjs` | مراسل JUnit في `node --test` على Node 20.20.2 و24.14.0 و24.16.0 و24.18.1 | `results/node-test-reporters.json` |
| `env-mask.mjs` | أثر حجب المتغيرات بأنماط C-18 على الأدوات (G-35) | `results/env-mask.json` |

## الإعادة

```bash
cd <جذر المستودع>
N=~/.nvm/versions/node/v24.16.0/bin/node          # pnpm 12.8.1 في المجلد نفسه؛ ودوال nvm في صدفة Claude Code معطوبة (AGENTS.md 9)
$N spikes/E-07-toolchains/inventory.mjs
$N spikes/E-07-toolchains/shims.mjs               # يحتاج mise في ~/.cache/ayar-dev2/mise (انظر DEV-2-downloads.md)
$N spikes/E-07-toolchains/python-runners.mjs      # يحتاج Poetry في ~/.cache/ayar-dev2/poetry-venv
$N spikes/E-07-toolchains/adapters.mjs [أداة ...]  # نحو 4 دقائق للكل
$N spikes/E-07-toolchains/node-test-reporters.mjs
$N spikes/E-07-toolchains/env-mask.mjs
```

## النتائج (2026-10-10، جهاز المالك: macOS 27.0.1، arm64)

### 1. الجرد (`results/inventory.md`)

- **Node:** 24.18.1 (Homebrew، وهو ما في PATH) و24.16.0 و24.14.0 و20.20.2 (nvm). `~/.nvm/alias/default` = `24` ← يحلّها القارئ من الملفات إلى v24.16.0، وهي نسخة `node` في طرفية المالك (E-06).
- **مديرو الحزم:** npm 11.16.0 (Homebrew) و11.13.0/11.9.0/10.8.2 (nvm)؛ **pnpm 12.8.1 في nvm فقط** وهو **shim من corepack** (`corepack/dist/pnpm.js`)؛ yarn 1.22.22 (shim corepack)؛ bun 1.3.14؛ corepack 0.35.0.
- **Python:** 3.12.13 (Homebrew)، و3.9.6 (`/usr/bin/python3` النظام). ولا uv ولا poetry ولا pipx ولا pyenv على المستوى العام (uv في صندوق DEV-1 فقط).
- **مديرو الإصدارات:** nvm موجود؛ ولا fnm ولا mise ولا asdf ولا volta ولا pyenv ولا بايثونات uv.
- **أدوات الفحص على النظام:** gitleaks 8.30.1 (Homebrew) فقط. ولا semgrep ولا osv-scanner ولا lychee ولا betterleaks (كلها مُدارة في الصناديق).
- **المحررات:** Xcode 27.0 و`xed`. ولا `code` ولا `cursor` ولا `zed`.
- **صدفة المالك:** `node` و`npm` و`npx` و`pnpm` و`corepack` و`yarn` و`nvm` كلها **دوال** (nvm الكسول)، و`uv` غير معرّف، و`python3` ملف. والدوال تعمل في صدفته: `node --version` → v24.16.0 و`pnpm --version` → 12.8.1.

### 2. shims ومنع التثبيت التلقائي (`results/shims.json`)

| الحالة | النتيجة | الدليل |
|---|---|---|
| `corepack pnpm --version` في مشروع `packageManager: pnpm@9.15.4` مع `COREPACK_ENABLE_NETWORK=0` | **يفشل في 37 مللي ثانية** برسالة «Network access disabled by the environment; can't reach https://registry.npmjs.org/pnpm/-/pnpm-9.15.4.tgz»، ولا يُكتب شيء في `COREPACK_HOME` | `corepackHomeDiff.clean = true` |
| `pnpm --version` (ملف nvm) في المشروع نفسه | **هو corepack نفسه**: يطبع «Corepack is about to download …» ثم يفشل بالمتغير نفسه. و`manage-package-manager-versions=false` لا أثر له لأن الملف التنفيذي shim من corepack لا pnpm | الحالات الثلاث |
| الحالة نفسها **دون** `COREPACK_ENABLE_NETWORK=0` | **نزّل pnpm 9.15.4 صامتًا** في ثانية واحدة ثم ثبّت المشروع (ضابط إيجابي للخطر) | `pnpm install … --offline` → 0 مع «Corepack is about to download» |
| `nvm use` مع `.nvmrc = 22.11.0` غير مثبتة | «N/A: version "v22.11.0" is not yet installed» ورمز 3 دون شبكة | — |
| قراءة nvm من الملفات | `alias/default` = 24 → أعلى v24.x في `versions/node` = v24.16.0، مطابق لـ `nvm which 24` | — |
| mise v2026.10.7 في مجلد مؤقت مع `nodejs 99.99.99` و`MISE_AUTO_INSTALL=0 MISE_EXEC_AUTO_INSTALL=0 MISE_NOT_FOUND_AUTO_INSTALL=0 MISE_OFFLINE=1` | `mise exec -- node -v` يفشل في 54 مللي ثانية («auto-install is disabled, so mise looks for node on PATH») ولا تثبيت؛ و`mise which node` يفشل؛ ومجلد shims فارغ بعد `reshim` | `homeDiff` ملفا ذاكرة فقط |
| mise بالإعدادات الافتراضية مع `MISE_OFFLINE=1` وحده | **يحاول التثبيت** ويفشل «offline mode is enabled» | — |

**الخلاصة لـ C-07 (DEV-4):** فحوص الإصدار تجري دائمًا مع `COREPACK_ENABLE_NETWORK=0`، و`MISE_AUTO_INSTALL=0 MISE_EXEC_AUTO_INSTALL=0 MISE_NOT_FOUND_AUTO_INSTALL=0` (وasdf بـ `ASDF_…` المقابل حين يُدعم)، ويُميَّز «pnpm عبر corepack» من pnpm مستقل بقراءة الرابط الحقيقي للملف (`realpath` ينتهي بـ `corepack/dist/pnpm.js`). وإن اختلف `packageManager` عن المثبت فالجاهزية «يحتاج تجهيزًا» لا تنزيل (AT-31).

### 3. `uv run` و`poetry run` (`results/python-runners.json`)

FX-PY بعد `uv sync --frozen` ثم إضافة `six==1.17.0` إلى `pyproject.toml` دون تحديث القفل (قفل قديم):

| الأمر | الخروج | `uv.lock` | ملفات `.venv` المتغيرة | الملاحظة |
|---|---|---|---|---|
| `uv run --no-sync` | 0 | لم يتغير | **0** | يشغّل بالبيئة كما هي |
| `uv run --frozen` | 0 | لم يتغير | 3 (أعاد بناء حزمة المشروع القابلة للتحرير) | **يزامن** البيئة من القفل |
| `uv run --locked` | **1** | لم يتغير | 0 | «The lockfile at uv.lock needs to be updated, but --locked was provided» |
| `uv run --no-sync --offline` | 0 | لم يتغير | 0 | — |
| `uv run --frozen --offline` | 0 | لم يتغير | 0 | — |
| `UV_NO_SYNC=1 uv run` | 0 | لم يتغير | 0 | المكافئ بالبيئة |
| `uv run --no-sync --no-project` من مجلد فرعي | 0 | لم يتغير | 0 | تحذير: `--no-sync` بلا أثر مع `--no-project` |
| `uv run --offline` | 0 | **تغيّر** | 8 (ثبّت six من الذاكرة) | يعيد القفل والمزامنة |
| `uv run` (افتراضي) | 0 | **تغيّر** | 8 | يعيد القفل والمزامنة |

Poetry 2.5.1 في مشروع مؤقت بـ `POETRY_VIRTUALENVS_IN_PROJECT=true`: `poetry run python -c` **ينشئ** `.venv` (493 ملفًا) إن لم توجد، ولا يثبّت التبعيات (`import six` يفشل)، و`poetry env info -p` يعطي مسار البيئة دون كتابة، و`poetry check --lock` يخبر بغياب القفل برمز 1.

**الخلاصة لـ C-15 (صف pytest):** داخل بيئة uv يكون الاستدعاء `uv run --no-sync --offline -- python -m pytest …` (أو مباشرة `<project>/.venv/bin/python -m pytest` حين توجد `.venv`، وهو الأبسط والأضمن). ومع Poetry يُستخدم `poetry env info -p` لتحديد البيئة ثم `<env>/bin/python` مباشرة، لأن `poetry run` ينشئ بيئة في المشروع إن غابت (أثر جانبي). وغياب البيئة «ناقص: بيئة Python غير مجهزة».

### 4. رموز الخروج الفعلية بأعلام C-15 (`results/exit-codes.md`، 72 صفًّا)

الاستدعاءات التي ثبتت صالحة بأعلام التقارير وبصفر آثار في شجرة المشروع (كل التقارير إلى مجلد خارجه):

| الأداة والإصدار | الاستدعاء المثبت | good | معيب | خطأ إعداد | بلا مدخلات | أخرى |
|---|---|---|---|---|---|---|
| Vitest 5.0.3 | `vitest run --reporter=default --reporter=json --reporter=junit --outputFile.json=R/vitest.json --outputFile.junit=R/junit.xml --update=none` | 0 | 1 | 1 (JSON يُكتب) | **1** «No test files found» (JSON يُكتب) | تعارض: 1 |
| Jest 30.5.2 | `jest --ci --json --outputFile=R/jest.json --testLocationInResults` | 0 | 1 | 1 (بلا تقرير) | 1 «No tests found» (بلا تقرير) | — |
| node:test (Node 20/24) | `node --test --test-reporter=junit --test-reporter-destination=R/junit.xml --test-reporter=spec --test-reporter-destination=stdout` | 0 | 1 | — | **0** (JUnit بـ 0 اختبار) | يعمل في النسخ الأربع |
| Playwright 1.64.0 | `playwright test --reporter=list,json,junit --update-snapshots=none --output=T/pw-out` + `PLAYWRIGHT_JSON_OUTPUT_FILE` و`PLAYWRIGHT_JUNIT_OUTPUT_FILE` | 0 | 1 | 1 (بلا تقرير، خطأ صياغة الإعداد) | 1 «No tests found» (JSON يُكتب) | — |
| ESLint 10.12.0 | `eslint src -f json -o R/eslint.json` | 0 | 1 | **2** | **2** «all of the files matching the glob pattern are ignored» | — |
| Biome 2.5.15 | `biome lint --reporter=json --reporter-file=R/biome.json src` | 0 | 1 | 1 (بلا تقرير؛ «unknown key») | **1** «No files were processed» (يصير 0 بـ `--no-errors-on-unmatched`) | التقرير يحمل `summary.errors/warnings` |
| tsc 6.0.3 | `tsc --noEmit -p tsconfig.json --pretty false` | 0 | **2** (TS6133) | 2 (TS5083) | 2 (TS18003) | (tsc 7: 1 بدل 2، E-13) |
| Knip 6.41.0 | `knip --reporter json` | 0 | 1 | 2 (خرج فارغ) | — | — |
| pyright 1.1.414 | `pyright --outputjson` | 0 | 1 | **3** («could not be parsed») | 0 | — |
| pytest 9.1.1 | `python -m pytest --junit-xml=R/junit.xml -p no:cacheprovider` | 0 | 1 | 4 (خطأ استخدام) | 5 | خطأ جمع: 2 (JUnit يُكتب)؛ تعارض: 0 |
| Ruff 0.16.10 | `ruff check --output-format json --output-file R/ruff.json --no-cache src` | 0 | 1 | 2 (بلا تقرير) | 0 (`[]`) | — |
| mypy 2.4.0 | `python -m mypy --show-column-numbers --no-error-summary --no-color-output --cache-dir T/mypy-cache` | 0 | 1 | 2 (بلا تشخيص) | 2 | خطأ صياغة: 2 **مع** تشخيص؛ و`-O json` يعمل (JSON Lines) ويعطي خرجًا فارغًا عند 0 أخطاء |
| Semgrep 1.180.0 | `semgrep scan --no-git-ignore --config … --metrics=off --disable-version-check --json-output=R/semgrep.json --sarif-output=R/semgrep.sarif src` | 0 | **0** مع نتائج | **7** (JSON يُكتب مع الخطأ) | 0 | — |
| OSV-Scanner 2.6.0 | `osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file R/osv.json` | 0 (بالقاعدة) | 1 | **128** «Error during extraction» | 128 «No package sources found» | **127** إن غابت القاعدة دون اتصال («no offline version of the OSV database») |
| Gitleaks 8.30.1 | `gitleaks dir . --redact=100 --no-banner --report-format json --report-path R/secrets.json --exit-code 42` | 0 | 42 | 1 | — | — |
| lychee 0.24.2 | `lychee --format json --output R/links.json …` | 0 | 2 | 3 | — | مهلة: 2 (مع الحالة في التقرير)؛ 403: 2 |

ملاحظات لخرائط DEV-6: (1) Semgrep يعطي 0 مع النتائج فالحكم من التقرير؛ (2) OSV يعطي 128 لحالتين مختلفتين يُميَّزان بالنص (G-DEV1-03) و127 عند غياب القاعدة ← «ناقص: قاعدة OSV غير مجهزة»؛ (3) «بلا مدخلات» رمزها يختلف بين الأدوات كما قرر D-DEV1-03؛ (4) `--output` في OSV مهجور لصالح `--output-file`؛ (5) الاستدعاءات كلها لم تكتب شيئًا في شجرة المشروع (العمود الأخير في `exit-codes.md` «لا شيء» في 72 صفًّا).

### 5. حجب المتغيرات الحساسة (G-35، `results/env-mask.json`)

بيئة جلسة المستخدم (72 متغيرًا) مع أنماط `SESSION|AUTH|KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE` حُجب 10 متغيرات، منها **`SSH_AUTH_SOCK`** (ومتغيرات جلسة Claude Code في هذه البيئة). الأثر: `pnpm install` وvitest وuv وpytest وgit (التزام محلي) **لم تتأثر** (رموز متطابقة)، و`ssh-add -l` تغيّر من 1 إلى **2** (لا وكيل)، أي أن أي فحص يحتاج ssh-agent (مثل `git fetch` عبر SSH داخل اختبار) يفشل بالحجب. **لـ C-18 (DEV-4):** استثناء صريح لـ `SSH_AUTH_SOCK` (مسار مقبس، ليس سرًّا) مع عرضه في شاشة الاعتماد، وفحص الأنماط على حدود الكلمات (`_AUTH_` و`AUTH_` …) حتى لا يُحجب `TERM_SESSION_ID` (ليس سرًّا) بلا سبب؛ وما يُحجب يُعرض بأسمائه كما تنص C-07.

## القرار

- **المدعوم أولًا (موجود فعلًا):** Node من Homebrew ومن nvm، وpnpm عبر corepack، وnpm، وbun (اكتشاف)، وPython 3.12 من Homebrew مع uv (مُدار)، وgitleaks من Homebrew، وXcode. ومحولات الأدوات الستة عشر بالأعلام المثبتة أعلاه.
- **مدعوم دعمًا محدودًا (موثق لا مجرب على جهاز المالك):** mise (جُرّب منزَّلًا؛ قواعده موثقة)، وasdf وfnm وvolta (قراءة مجلداتها فقط كما في C-07؛ لا shims مثبتة)، وpoetry (جُرّب منزَّلًا: `env info -p` ثم `<env>/bin/python`).
- **قواعد الجاهزية (C-07):** `COREPACK_ENABLE_NETWORK=0` ومتغيرات mise الثلاثة في كل فحص إصدار؛ وpnpm عبر corepack مع `packageManager` مختلف = «يحتاج تجهيزًا»؛ و`.nvmrc` لنسخة غير مثبتة = «يحتاج تجهيزًا» مع ذكر النسخ المثبتة من الملفات.
- **أعلام Python (C-15):** `.venv/bin/python -m pytest` حين توجد `.venv`، وإلا `uv run --no-sync --offline -- python -m pytest` في مشاريع uv، و`poetry env info -p` في مشاريع Poetry. ولا `uv run` افتراضيًّا ولا `--frozen` (كلاهما يكتب في `.venv`).
- **لا يتغير نص الخطة** (الأعلام هي تطبيق ما تركته للتحقق). والملاحظات المسجلة: G-35 أعلاه لـ C-18، وrealpath لكشف corepack لـ C-07.
