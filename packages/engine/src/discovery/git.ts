// C-06 point 8, as settled by E-16: Git data is read from the files under .git, never by running `git` (T2:
// a hostile .git/config can run programs through core.fsmonitor, diff drivers or textconv). Read: HEAD
// (symbolic or detached), loose refs then packed-refs, extensions.objectFormat, linked work trees (`.git` as a
// file with gitdir and commondir), submodules (.gitmodules), shallow. From config only known keys are matched
// by pattern, and of the remote only the host is kept (a URL may carry a token). Objects and packs are never
// read. Confidence: «مؤكد» when HEAD resolves to a commit, otherwise unknown with the reason.
import { posix } from 'node:path';
import type { DiscoveryFs } from './walker.ts';

const MAX_GIT_FILE = 1024 * 1024;

export interface GitInfo {
  isRepo: true;
  branch: string | null;
  commit: string | null;
  detached: boolean;
  objectFormat: 'sha1' | 'sha256';
  shallow: boolean;
  linkedWorktree: boolean;
  bare: boolean;
  headSource: 'loose' | 'packed-refs' | 'detached' | 'unknown';
  confidence: 'confirmed' | 'unknown';
  /** Why the commit is unknown: new repository, missing ref, unreadable HEAD, symbolic-ref loop. */
  reason: string | null;
  worktrees: number;
  submodules: { path: string; initialized: boolean; commit: string | null }[];
  remoteHost: string | null;
}

/** The Git head a run recorded when it started (runs.git_json, 18.1); `repository: false` outside a repository. */
export interface RunGit {
  repository: boolean;
  branch: string | null;
  commit: string | null;
}

/**
 * runs.git_json read back (AUD-07), or null when the run recorded none (an older run): a report then says so, and
 * never borrows the project's later head. A row from before `repository` was kept named a repository's head.
 */
export function parseRunGit(json: string | null): RunGit | null {
  if (!json) return null;
  try {
    const g = JSON.parse(json) as { repository?: unknown; branch?: unknown; commit?: unknown };
    return {
      repository: g.repository !== false,
      branch: typeof g.branch === 'string' ? g.branch : null,
      commit: typeof g.commit === 'string' && /^[0-9a-f]{7,64}$/.test(g.commit) ? g.commit : null,
    };
  } catch {
    return null;
  }
}

async function readText(fs: DiscoveryFs, path: string): Promise<string | null> {
  try {
    const st = await fs.lstat(path);
    if (!st || !st.isFile) return null;
    const { data } = await fs.readFilePrefix(path, MAX_GIT_FILE);
    return new TextDecoder().decode(data);
  } catch {
    return null;
  }
}

const isHex = (s: string, n: number) => s.length === n && /^[0-9a-f]+$/.test(s);
const MAX_SUBMODULES = 200;
const MAX_CONFIG_LINES = 20_000;

/**
 * Git's config syntax, line by line (review M1: no pattern that can backtrack across lines): `[section]` or
 * `[section "sub"]`, then `key = value`. Sections and keys are lower-cased; the last value wins, as in Git.
 */
export function parseGitConfig(text: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  let section = '';
  for (const raw of text.split('\n').slice(0, MAX_CONFIG_LINES)) {
    const t = raw.trim();
    if (!t || t.startsWith('#') || t.startsWith(';')) continue;
    if (t.startsWith('[')) {
      const end = t.indexOf(']');
      if (end < 0) continue;
      const inner = t.slice(1, end).trim();
      const q = inner.indexOf('"');
      const last = inner.lastIndexOf('"');
      section = q < 0 ? inner.toLowerCase() : `${inner.slice(0, q).trim().toLowerCase()} "${last > q ? inner.slice(q + 1, last) : inner.slice(q + 1)}"`;
      if (!out.has(section)) out.set(section, new Map());
      continue;
    }
    const eq = t.indexOf('=');
    const key = (eq < 0 ? t : t.slice(0, eq)).trim().toLowerCase();
    let value = eq < 0 ? 'true' : t.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!out.has(section)) out.set(section, new Map());
    out.get(section)!.set(key, value);
  }
  return out;
}

/**
 * The git directory a `.git` file names, judged by its real path (re-review R1: a link inside the root must not
 * lead out of it). Accepted: inside the root; or, outside it, a linked work tree's or a submodule's folder under
 * `…/.git/worktrees|modules/` that points back to this root — `gitdir` for a work tree, `core.worktree` for a
 * module (review M2). Returns the real path, or null.
 */
async function acceptedGitdir(fs: DiscoveryFs, gitdir: string, root: string): Promise<string | null> {
  const real = await fs.realpath(gitdir).catch(() => null);
  if (!real) return null;
  if (real === `${root}/.git` || real.startsWith(`${root}/`)) return real;
  const m = /\/\.git\/(worktrees|modules)\/[^/]+(\/[^/]+)*$/.exec(real);
  if (!m) return null;
  const back = async (target: string | undefined) => (target ? await fs.realpath(posix.resolve(real, target)).catch(() => null) : null);
  if (m[1] === 'worktrees') return (await back((await readText(fs, posix.join(real, 'gitdir')))?.trim())) === `${root}/.git` ? real : null;
  const worktree = parseGitConfig((await readText(fs, posix.join(real, 'config'))) ?? '').get('core')?.get('worktree');
  return (await back(worktree)) === root ? real : null;
}

/** The git directory of a work tree and its common directory, judged by their real paths (E-16, D-DEV4-14). */
export async function locate(fs: DiscoveryFs, root: string): Promise<{ gitdir: string; commondir: string; linked: boolean } | null> {
  const dotGit = posix.join(root, '.git');
  const st = await fs.lstat(dotGit);
  if (!st) return null;
  let gitdir: string;
  if (st.isDirectory) gitdir = dotGit;
  else if (st.isFile) {
    const line = ((await readText(fs, dotGit)) ?? '').split('\n').find((l) => l.startsWith('gitdir:'));
    if (!line) return null;
    const accepted = await acceptedGitdir(fs, posix.resolve(root, line.slice('gitdir:'.length).trim()), root);
    if (!accepted) return null;
    gitdir = accepted;
  } else return null;
  const common = (await readText(fs, posix.join(gitdir, 'commondir')))?.trim();
  const candidate = common ? posix.resolve(gitdir, common) : gitdir;
  // commondir must be where the linked work tree lives (…/.git for …/.git/worktrees/<n>), nowhere else: inside
  // the root when the git directory is, and exactly that .git folder for an external work tree (re-review N1).
  let commondir = gitdir;
  if (candidate !== gitdir && gitdir.startsWith(`${candidate}/`)) {
    const real = await fs.realpath(candidate).catch(() => null);
    const inside = (p: string) => p === `${root}/.git` || p.startsWith(`${root}/`);
    const worktreeHome = /^(.*\/\.git)\/worktrees\/[^/]+$/.exec(gitdir)?.[1];
    if (real && (inside(gitdir) ? inside(real) : real === worktreeHome)) commondir = real;
  }
  return { gitdir, commondir, linked: commondir !== gitdir };
}

/** Only the host of a remote URL, for display: `https://user:token@host/x` and `git@host:x` give `host`. */
export function remoteHost(url: string): string | null {
  const scp = /^[^@\s/]+@([^:\s/]+):/.exec(url);
  if (scp) return scp[1]!;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export async function readGitInfo(fs: DiscoveryFs, root: string, depth = 0, signal?: AbortSignal): Promise<GitInfo | null> {
  const loc = await locate(fs, root);
  if (!loc) return null;
  const { gitdir, commondir, linked } = loc;
  const config = parseGitConfig((await readText(fs, posix.join(commondir, 'config'))) ?? '');
  const objectFormat = config.get('extensions')?.get('objectformat')?.toLowerCase() === 'sha256' ? 'sha256' : 'sha1';
  const hashLen = objectFormat === 'sha256' ? 64 : 40;
  const bare = config.get('core')?.get('bare') === 'true';
  const packedText = (await readText(fs, posix.join(commondir, 'packed-refs'))) ?? '';
  const packed = new Map<string, string>();
  for (const line of packedText.split('\n')) {
    if (!line || line.startsWith('#') || line.startsWith('^')) continue;
    const [sha, ref] = line.split(' ');
    if (sha && ref) packed.set(ref.trim(), sha.trim());
  }
  const resolve = async (ref: string, hops = 0): Promise<{ sha: string | null; source: GitInfo['headSource']; reason: string | null }> => {
    if (hops > 5) return { sha: null, source: 'unknown', reason: 'symbolic_ref_loop' };
    if (!/^refs\/[A-Za-z0-9._/-]+$/.test(ref) || ref.includes('..')) return { sha: null, source: 'unknown', reason: 'unreadable_ref' };
    const perWorktree = /^refs\/(bisect|worktree|rewritten)\//.test(ref);
    const loose = await readText(fs, posix.join(perWorktree ? gitdir : commondir, ref));
    if (loose !== null) {
      const v = loose.trim();
      if (v.startsWith('ref: ')) return resolve(v.slice(5).trim(), hops + 1);
      if (isHex(v, hashLen)) return { sha: v, source: 'loose', reason: null };
      return { sha: null, source: 'unknown', reason: 'unreadable_ref' };
    }
    const p = packed.get(ref);
    if (p && isHex(p, hashLen)) return { sha: p, source: 'packed-refs', reason: null };
    return { sha: null, source: 'unknown', reason: 'missing_ref_or_new_repository' };
  };
  const head = ((await readText(fs, posix.join(gitdir, 'HEAD'))) ?? '').trim();
  let branch: string | null = null;
  let commit: string | null = null;
  let detached = false;
  let headSource: GitInfo['headSource'] = 'unknown';
  let reason: string | null = null;
  if (head.startsWith('ref: ')) {
    const ref = head.slice(5).trim();
    branch = ref.replace(/^refs\/heads\//, '');
    const r = await resolve(ref);
    commit = r.sha;
    headSource = r.source;
    reason = r.reason;
  } else if (isHex(head, hashLen)) {
    commit = head;
    detached = true;
    headSource = 'detached';
  } else reason = head ? 'unreadable_head' : 'no_head';

  let worktrees = 0;
  try {
    worktrees = (await fs.readdirEntries(posix.join(commondir, 'worktrees'))).filter((e) => e.kind === 'directory').length;
  } catch {
    worktrees = 0;
  }
  const submodules: GitInfo['submodules'] = [];
  const gm = depth < 2 ? await readText(fs, posix.join(root, '.gitmodules')) : null;
  if (gm) {
    const seen = new Set<string>();
    for (const [section, values] of parseGitConfig(gm)) {
      if (!section.startsWith('submodule ')) continue;
      const path = values.get('path');
      if (!path || path.startsWith('/') || path.split('/').includes('..') || seen.has(path)) continue;
      if (seen.size >= MAX_SUBMODULES) break;
      if (signal?.aborted) break;
      seen.add(path);
      // A submodule path that goes through a link is not followed (D-05): its Git data stays unread.
      let throughLink = false;
      for (let i = 1, segs = path.split('/'); i <= segs.length; i++) {
        if ((await fs.lstat(posix.join(root, ...segs.slice(0, i))))?.isSymbolicLink) throughLink = true;
      }
      const inner = throughLink ? null : await readGitInfo(fs, posix.join(root, path), depth + 1, signal);
      submodules.push({ path, initialized: inner !== null, commit: inner?.commit ?? null });
    }
  }
  const remoteUrl = config.get('remote "origin"')?.get('url') ?? null;
  return {
    isRepo: true,
    branch,
    commit,
    detached,
    objectFormat,
    shallow: (await fs.lstat(posix.join(commondir, 'shallow'))) !== null,
    linkedWorktree: linked,
    bare,
    headSource,
    confidence: commit ? 'confirmed' : 'unknown',
    reason: commit ? null : reason,
    worktrees,
    submodules,
    remoteHost: remoteUrl ? remoteHost(remoteUrl) : null,
  };
}
