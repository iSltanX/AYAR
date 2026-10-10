// E-16: قارئ بيانات Git من الملفات **دون تشغيل git** (C-06 البند 8): الفرع ورقم الالتزام من HEAD والمراجع وpacked-refs،
// ومساحات العمل الإضافية (.git ملف بـ gitdir وcommondir)، والوحدات الفرعية (.gitmodules و.git ملف في مجلد الوحدة)،
// وصيغة SHA-256 (extensions.objectFormat)، والمستودع السطحي (shallow). كل حقل بثقة: «مؤكد» أو «غير معروف» مع السبب.
// لا يقرأ الكائنات ولا الحزم، ولا ينفذ شيئًا من config (يقرأ منه مفاتيح معلومة بتعبير نمطي فقط).
import fs from 'node:fs';
import path from 'node:path';

const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const isHex = (s, n) => new RegExp(`^[0-9a-f]{${n}}$`).test(s);

/** يحل مجلد gitdir وcommondir لجذر مشروع (مجلد .git أو ملف .git لمساحة عمل أو وحدة فرعية). */
export function locateGitDir(root) {
  const dotGit = path.join(root, '.git');
  let st;
  try { st = fs.lstatSync(dotGit); } catch { return null; }
  let gitdir;
  if (st.isDirectory()) gitdir = dotGit;
  else if (st.isFile()) {
    const m = (readText(dotGit) ?? '').match(/^gitdir:\s*(.+?)\s*$/m);
    if (!m) return { error: 'ملف .git بلا gitdir' };
    gitdir = path.resolve(root, m[1]);
  } else return null;
  const common = readText(path.join(gitdir, 'commondir'));
  const commondir = common ? path.resolve(gitdir, common.trim()) : gitdir;
  return { gitdir, commondir, linked: commondir !== gitdir };
}

function parsePackedRefs(commondir) {
  const txt = readText(path.join(commondir, 'packed-refs'));
  const map = new Map();
  if (!txt) return { map, present: false };
  for (const line of txt.split('\n')) {
    if (!line || line.startsWith('#') || line.startsWith('^')) continue;
    const [sha, ref] = line.split(' ');
    if (sha && ref) map.set(ref.trim(), sha.trim());
  }
  return { map, present: true };
}

function resolveRef(ref, gitdir, commondir, packed, hashLen, depth = 0) {
  if (depth > 5) return { sha: null, source: 'حلقة رموز' };
  // المراجع الخاصة بمساحة العمل (refs/bisect وHEAD) في gitdir، والباقي في commondir
  const perWorktree = /^refs\/(bisect|worktree|rewritten)\//.test(ref);
  const loose = readText(path.join(perWorktree ? gitdir : commondir, ref));
  if (loose !== null) {
    const v = loose.trim();
    if (v.startsWith('ref: ')) return resolveRef(v.slice(5).trim(), gitdir, commondir, packed, hashLen, depth + 1);
    if (isHex(v, hashLen)) return { sha: v, source: 'loose' };
    return { sha: null, source: `مرجع فضفاض غير مفهوم: ${v.slice(0, 20)}` };
  }
  if (packed.map.has(ref)) return { sha: packed.map.get(ref), source: 'packed-refs' };
  return { sha: null, source: 'غير موجود' };
}

export function readGit(root, { depth = 0 } = {}) {
  const loc = locateGitDir(root);
  if (!loc) return { isRepo: false };
  if (loc.error) return { isRepo: false, error: loc.error };
  const { gitdir, commondir, linked } = loc;
  const config = readText(path.join(commondir, 'config')) ?? '';
  const objectFormat = /^\s*objectFormat\s*=\s*sha256\s*$/mi.test(config) ? 'sha256' : 'sha1';
  const hashLen = objectFormat === 'sha256' ? 64 : 40;
  const bare = /^\s*bare\s*=\s*true/mi.test(config);
  const packed = parsePackedRefs(commondir);
  const headRaw = (readText(path.join(gitdir, 'HEAD')) ?? '').trim();
  let branch = null, commit = null, detached = false, headSource = 'غير معروف';
  if (headRaw.startsWith('ref: ')) {
    const ref = headRaw.slice(5).trim();
    branch = ref.replace(/^refs\/heads\//, '');
    const r = resolveRef(ref, gitdir, commondir, packed, hashLen);
    commit = r.sha; headSource = r.source;
    if (!commit && r.source === 'غير موجود') headSource = 'فرع بلا التزام بعد (مستودع جديد) أو مرجع مفقود';
  } else if (isHex(headRaw, hashLen)) { commit = headRaw; detached = true; headSource = 'HEAD منفصل'; }
  else headSource = headRaw ? `HEAD غير مفهوم: ${headRaw.slice(0, 30)}` : 'لا HEAD';
  // آخر قيد في سجل المراجع (ملف) للمقارنة
  const log = readText(path.join(gitdir, 'logs', 'HEAD'));
  const lastLog = log ? log.trim().split('\n').at(-1) : null;
  const logNew = lastLog ? lastLog.split(' ')[1] : null;
  // الريموت (عرض فقط)
  const remote = (config.match(/\[remote "origin"\][^[]*?url\s*=\s*(.+)/) ?? [])[1]?.trim() ?? null;
  // مساحات العمل الإضافية
  const worktrees = [];
  const wtDir = path.join(commondir, 'worktrees');
  if (fs.existsSync(wtDir)) for (const name of fs.readdirSync(wtDir)) {
    const g = readText(path.join(wtDir, name, 'gitdir'))?.trim() ?? null;
    const head = (readText(path.join(wtDir, name, 'HEAD')) ?? '').trim();
    worktrees.push({ name, path: g ? path.dirname(g) : null, head: head.startsWith('ref: ') ? head.slice(5).replace(/^refs\/heads\//, '') : head.slice(0, 12), locked: fs.existsSync(path.join(wtDir, name, 'locked')) });
  }
  // الوحدات الفرعية
  const submodules = [];
  const gm = readText(path.join(root, '.gitmodules'));
  if (gm && depth < 2) for (const m of gm.matchAll(/\[submodule "([^"]+)"\]([^[]*)/g)) {
    const sub = { name: m[1], path: (m[2].match(/path\s*=\s*(.+)/) ?? [])[1]?.trim() ?? null, url: (m[2].match(/url\s*=\s*(.+)/) ?? [])[1]?.trim() ?? null };
    if (sub.path) { const inner = readGit(path.join(root, sub.path), { depth: depth + 1 }); sub.initialized = inner.isRepo === true; sub.commit = inner.commit ?? null; sub.branch = inner.branch ?? null; }
    submodules.push(sub);
  }
  const shallow = fs.existsSync(path.join(commondir, 'shallow'));
  const confidence = commit ? 'مؤكد' : 'غير معروف';
  return { isRepo: true, gitdir, commondir, linkedWorktree: linked, bare, objectFormat, branch, commit, detached, headSource, packedRefsPresent: packed.present, packedRefCount: packed.map.size, reflogHead: logNew, reflogAgrees: logNew ? logNew === commit : null, remote, worktrees, submodules, shallow, confidence };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  console.log(JSON.stringify(readGit(path.resolve(process.argv[2] ?? '.')), null, 2));
}
