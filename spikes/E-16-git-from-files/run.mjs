// E-16: اختبار قارئ Git من الملفات (reader.mjs) على:
//   (أ) مستودعات اصطناعية في مجلد مؤقت (git مسموح هناك): مراجع فضفاضة، وpacked-refs، وHEAD منفصل، ومساحة عمل إضافية،
//       ووحدة فرعية، وصيغة SHA-256، ونسخة سطحية — مع مقارنة بـ git rev-parse/branch.
//   (ب) مجلد عمل DEV-2 نفسه (ملف .git → gitdir في المستودع الأصلي) مع مقارنة بـ git في المجلد نفسه.
//   (ج) FX-MALICIOUS المولَّد **دون git** مع مقارنة بـ HEAD الذي يطبعه المولّد.
//   (د) مستودعات المالك Rasd وTars وWasl **للقراءة فقط ودون git** (E-15)، مع جرد .git (حجم ووقت) قبل وبعد لإثبات عدم التغيير.
//   node spikes/E-16-git-from-files/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, REPO, baseEnv, resultsDir, rmrf, run, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';
import { readGit } from './reader.mjs';

const results = resultsDir(import.meta.url);
const env = baseEnv({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'a', GIT_AUTHOR_EMAIL: 'a@b', GIT_COMMITTER_NAME: 'a', GIT_COMMITTER_EMAIL: 'a@b' });
const git = (args, cwd) => run('/usr/bin/git', { args, cwd, env });
const out = { at: new Date().toISOString(), synthetic: [], self: null, malicious: null, owner: [] };
const pick = (g) => ({ branch: g.branch, commit: g.commit, detached: g.detached, headSource: g.headSource, objectFormat: g.objectFormat, packedRefs: g.packedRefCount, linkedWorktree: g.linkedWorktree, worktrees: g.worktrees?.length, submodules: g.submodules?.map((s) => ({ path: s.path, initialized: s.initialized, commit: s.commit?.slice(0, 12) })), shallow: g.shallow, reflogAgrees: g.reflogAgrees, confidence: g.confidence });

// (أ) اصطناعية
{
  const base = tmpdir('ayar-e16');
  const mk = async (name, fmt) => { const d = path.join(base, name); fs.mkdirSync(d); await git(['init', '-q', '-b', 'main', ...(fmt ? ['--object-format=sha256'] : []), d], base); fs.writeFileSync(path.join(d, 'a.txt'), 'a\n'); await git(['add', '.'], d); await git(['commit', '-q', '-m', 'one'], d); return d; };
  const expect = async (name, d, extra = {}) => {
    const r = readGit(d);
    const sha = (await git(['rev-parse', 'HEAD'], d)).out.trim();
    const br = (await git(['branch', '--show-current'], d)).out.trim() || null;
    const row = { name, reader: pick(r), git: { commit: sha, branch: br }, match: r.commit === sha && (r.branch ?? null) === br, ...extra };
    out.synthetic.push(row);
    console.log(`• ${name}: ${row.match ? '✓' : '✗'} reader=${r.branch}@${r.commit?.slice(0, 7)} (${r.headSource}) git=${br}@${sha.slice(0, 7)}`);
  };
  const loose = await mk('loose'); await expect('مراجع فضفاضة', loose);
  const packed = await mk('packed'); await git(['pack-refs', '--all'], packed); await expect('packed-refs (بعد git pack-refs --all)', packed, { looseRefExists: fs.existsSync(path.join(packed, '.git', 'refs', 'heads', 'main')) });
  const det = await mk('detached'); await git(['checkout', '-q', '--detach'], det); await expect('HEAD منفصل', det);
  const wtMain = await mk('with-worktree'); const wtDir = path.join(base, 'wt-feature'); await git(['worktree', 'add', '-q', '-b', 'feature', wtDir], wtMain); fs.writeFileSync(path.join(wtDir, 'b.txt'), 'b\n'); await git(['add', '.'], wtDir); await git(['commit', '-q', '-m', 'two'], wtDir);
  await expect('المستودع الرئيسي الذي له مساحة عمل إضافية', wtMain); await expect('مساحة العمل الإضافية (ملف .git بـ gitdir)', wtDir);
  const subSrc = await mk('sub-src'); const withSub = await mk('with-submodule'); await git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', subSrc, 'libs/sub'], withSub); await git(['commit', '-q', '-m', 'add sub'], withSub);
  await expect('وحدة فرعية (.gitmodules وملف .git في مجلدها)', withSub, { submoduleGit: (await git(['rev-parse', 'HEAD'], path.join(withSub, 'libs', 'sub'))).out.trim().slice(0, 12) });
  const s256 = await mk('sha256', true); await expect('صيغة SHA-256 (extensions.objectFormat)', s256);
  const shallowDst = path.join(base, 'shallow'); await git(['clone', '-q', '--depth', '1', `file://${loose}`, shallowDst], base); await expect('نسخة سطحية (ملف shallow)', shallowDst);
  const empty = path.join(base, 'empty'); fs.mkdirSync(empty); await git(['init', '-q', '-b', 'main', empty], base);
  const er = readGit(empty); out.synthetic.push({ name: 'مستودع جديد بلا التزام', reader: pick(er) }); console.log(`• مستودع جديد: branch=${er.branch} commit=${er.commit} (${er.headSource}) confidence=${er.confidence}`);
  const notRepo = readGit(base); out.synthetic.push({ name: 'مجلد ليس مستودعًا', reader: notRepo });
  rmrf(base);
}

// (ب) مجلد عمل DEV-2 (قراءة ملفات فقط؛ المقارنة بـ git في هذا المجلد مسموحة)
{
  const r = readGit(REPO);
  const sha = (await git(['rev-parse', 'HEAD'], REPO)).out.trim();
  const br = (await git(['branch', '--show-current'], REPO)).out.trim();
  out.self = { reader: pick(r), git: { commit: sha, branch: br }, match: r.commit === sha && r.branch === br, gitdir: r.gitdir.replaceAll(process.env.HOME, '~') };
  console.log(`• DEV-2 worktree: ${out.self.match ? '✓' : '✗'} ${r.branch}@${r.commit?.slice(0, 7)} linked=${r.linkedWorktree} worktrees=${r.worktrees.length}`);
}

// (ج) FX-MALICIOUS دون git
{
  const dest = tmpdir('ayar-e16-mal');
  const gen = await run(process.execPath, { args: [path.join(FIXTURES, 'tools', 'malicious', 'generate.mjs'), '--out', dest] });
  const printed = (gen.out.match(/HEAD ([0-9a-f]+)/) ?? [])[1] ?? null;
  const r = readGit(path.join(dest, 'repo'));
  out.malicious = { reader: pick(r), generatorHead: printed, match: printed ? r.commit?.startsWith(printed) : null };
  console.log(`• FX-MALICIOUS (بلا git): ${out.malicious.match ? '✓' : '✗'} ${r.branch}@${r.commit?.slice(0, 7)} packed=${r.packedRefCount}`);
  rmrf(dest);
}

// (د) مستودعات المالك: قراءة فقط، ولا git
{
  const owners = ['/Volumes/iSltanXx/Projects/Brave/Rasd', '/Volumes/iSltanXx/Projects/Tars', '/Volumes/iSltanXx/Projects/Plugins/Wasl'];
  const inventory = (dir) => { const m = new Map(); const walk = (d) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.isFile()) { const st = fs.statSync(p); m.set(path.relative(dir, p), `${st.size}:${st.mtimeMs}`); } } }; walk(dir); return m; };
  for (const root of owners) {
    const g = path.join(root, '.git');
    const before = fs.existsSync(g) ? inventory(g) : null;
    const r = readGit(root);
    const after = fs.existsSync(g) ? inventory(g) : null;
    let changed = null;
    if (before && after) { changed = [...after].filter(([k, v]) => before.get(k) !== v).map(([k]) => k).concat([...before.keys()].filter((k) => !after.has(k))); }
    out.owner.push({ root, reader: r.isRepo ? { ...pick(r), remoteHost: r.remote ? r.remote.replace(/^(https?:\/\/|git@)([^/:]+).*$/, '$2') : null } : r, gitFilesInventoried: before?.size ?? null, gitFilesChanged: changed });
    console.log(`• ${path.basename(root)}: repo=${r.isRepo} ${r.branch ?? ''}@${r.commit?.slice(0, 7) ?? ''} (${r.headSource ?? ''}) packed=${r.packedRefCount ?? ''} worktrees=${r.worktrees?.length ?? ''} submodules=${r.submodules?.length ?? ''} reflogAgrees=${r.reflogAgrees} .git-changed=${changed?.length ?? 'n/a'}`);
  }
}
writeJson(path.join(results, 'run.json'), out);
console.log(`\nكُتب ${path.join(results, 'run.json')}`);
