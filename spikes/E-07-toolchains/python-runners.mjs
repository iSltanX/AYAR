// E-07 (3): خيارات `uv run` التي تمنع المزامنة، وسلوك `poetry run` (الخطة 22، وC-15 صف pytest).
// على FX-PY (السليمة): بعد `uv sync --frozen` يُجعل القفل قديمًا (تبعية جديدة في pyproject بلا قفل)، ثم تُجرَّب أعلام uv run
// وتُقاس آثارها على .venv وuv.lock بلقطة حالة. وPoetry 2.5.1 (في ~/.cache/ayar-dev2/poetry-venv) على مشروع مؤقت.
//   node spikes/E-07-toolchains/python-runners.mjs
import fs from 'node:fs';
import path from 'node:path';
import { DEV2_CACHE, baseEnv, diffSnapshot, excerpt, materialize, resultsDir, rmrf, run, snapshot, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const out = { at: new Date().toISOString(), uv: [], poetry: [] };
const PY = 'python -c "import sys, nusus; print(sys.prefix); print(nusus.__file__)"';

// ── uv ──
{
  const { base, root } = await materialize('FX-PY', 'good');
  const env = baseEnv({ UV_PYTHON_PREFERENCE: 'only-system', UV_CACHE_DIR: path.join(DEV2_CACHE, 'uv-cache') });
  const sync = await run('uv sync --frozen', { cwd: root, env, timeout: 300 });
  out.uv.push({ name: 'uv sync --frozen (التجهيز)', code: sync.code, ms: sync.ms, err: excerpt(sync.err, 400) });
  const watched = () => snapshot(root, { skip: new Set(['__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache']) }); // يشمل .venv وuv.lock
  const clean = watched();
  // القفل قديم: تبعية جديدة في pyproject دون تحديث uv.lock
  const pyproject = path.join(root, 'pyproject.toml');
  fs.writeFileSync(pyproject, fs.readFileSync(pyproject, 'utf8').replace('dependencies = []', 'dependencies = ["six==1.17.0"]'));
  const lockFile = path.join(root, 'uv.lock');
  const lockOrig = fs.readFileSync(lockFile);
  const stale = watched();
  // الحالات التي لا تزامن أولًا، ثم التي تزامن (لأنها تغيّر .venv والقفل)، وكل حالة تُقارن بلقطة أُخذت قبلها مباشرة
  const cases = [
    ['uv run --no-sync', 'uv run --no-sync'],
    ['uv run --frozen', 'uv run --frozen'],
    ['uv run --locked', 'uv run --locked'],
    ['uv run --no-sync --offline', 'uv run --no-sync --offline'],
    ['uv run --frozen --offline', 'uv run --frozen --offline'],
    ['UV_NO_SYNC=1 uv run', 'uv run', { UV_NO_SYNC: '1' }],
    ['uv run --no-sync --no-project (من مجلد آخر)', 'uv run --no-sync --no-project', {}, true],
    ['uv run --offline', 'uv run --offline'],
    ['uv run (افتراضي)', 'uv run'],
  ];
  for (const [name, cmd, extra = {}, elsewhere = false] of cases) {
    const pre = watched();
    const r = await run(`${cmd} ${PY}`, { cwd: elsewhere ? path.join(root, 'src') : root, env: { ...env, ...extra }, timeout: 300 });
    const after = watched();
    const d = diffSnapshot(pre, after);
    const venvChanged = [...d.added, ...d.changed, ...d.removed].filter((f) => f.startsWith('.venv/'));
    const lockChanged = d.changed.includes('uv.lock');
    out.uv.push({ name, code: r.code, ms: r.ms, lockChanged, venvChangedCount: venvChanged.length, venvChangedSample: venvChanged.slice(0, 5), stdout: excerpt(r.out, 300), stderr: excerpt(r.err, 500) });
    console.log(`• ${name}: exit=${r.code} ${r.ms}ms lockChanged=${lockChanged} venvChanged=${venvChanged.length}`);
    // استعادة حالة «القفل قديم» إن تغيّر شيء: القفل الأصلي، و.venv من القفل (--frozen يتجاهل pyproject)
    if (lockChanged || venvChanged.length) {
      fs.writeFileSync(lockFile, lockOrig);
      const restore = await run('uv sync --frozen', { cwd: root, env, timeout: 300 });
      out.uv.at(-1).restored = restore.code === 0 && diffSnapshot(pre, watched()).clean;
    }
  }
  rmrf(base);
}

// ── Poetry 2.5.1 ──
{
  const poetry = path.join(DEV2_CACHE, 'poetry-venv', 'bin', 'poetry');
  const proj = tmpdir('poetry-proj');
  fs.writeFileSync(path.join(proj, 'pyproject.toml'), `[project]\nname = "ayar-poetry-probe"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = ["six==1.17.0"]\n\n[tool.poetry]\npackage-mode = false\n\n[build-system]\nrequires = ["poetry-core>=2.0.0"]\nbuild-backend = "poetry.core.masonry.api"\n`);
  fs.mkdirSync(path.join(proj, 'tests'));
  fs.writeFileSync(path.join(proj, 'tests', 'test_x.py'), 'def test_x():\n    assert 1 == 1\n');
  const cacheDir = tmpdir('poetry-cache');
  const env = baseEnv({ POETRY_CACHE_DIR: cacheDir, POETRY_VIRTUALENVS_IN_PROJECT: 'true', POETRY_NO_INTERACTION: '1', PATH: `${path.dirname(poetry)}:/opt/homebrew/bin:/usr/bin:/bin` });
  const snap = () => snapshot(proj, { skip: new Set(['__pycache__']) }); // يشمل .venv داخل المشروع
  const s0 = snap();
  const cases = [
    ['poetry --version', ['--version']],
    ['poetry env info -p (قبل أي بيئة)', ['env', 'info', '-p']],
    ['poetry run python -c (بلا بيئة ولا قفل)', ['run', 'python', '-c', 'import sys; print(sys.prefix)']],
    ['poetry run python -c "import six" (التبعية لم تُثبَّت)', ['run', 'python', '-c', 'import six; print(six.__version__)']],
    ['poetry env info -p (بعد run)', ['env', 'info', '-p']],
    ['poetry check --lock', ['check', '--lock']],
    ['poetry install --sync --no-root --dry-run', ['install', '--sync', '--no-root', '--dry-run']],
  ];
  for (const [name, args] of cases) {
    const r = await run(poetry, { args, cwd: proj, env, timeout: 180 });
    const d = diffSnapshot(s0, snap());
    out.poetry.push({ name, code: r.code, ms: r.ms, projectDiff: { added: d.added.filter((f) => !f.startsWith('.venv/')).slice(0, 10), venvFiles: [...d.added, ...d.changed].filter((f) => f.startsWith('.venv/')).length, lockCreated: fs.existsSync(path.join(proj, 'poetry.lock')) }, stdout: excerpt(r.out, 300), stderr: excerpt(r.err, 500) });
    console.log(`• ${name}: exit=${r.code} ${r.ms}ms venvFiles=${out.poetry.at(-1).projectDiff.venvFiles} lock=${out.poetry.at(-1).projectDiff.lockCreated}`);
  }
  rmrf(proj); rmrf(cacheDir);
}

writeJson(path.join(results, 'python-runners.json'), out);
console.log(`\nكُتب ${path.join(results, 'python-runners.json')}`);
