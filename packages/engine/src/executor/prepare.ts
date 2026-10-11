// What a template asks AYAR to prepare in the instance's own temporary folder before the launch (C-15, C-12 point 2):
//   semgrep-rules  AYAR's Semgrep rules file (D-13, the catalog's package), Semgrep's settings file and its HOME
//                  inside the folder, so nothing is written to the user's home (E-10)
//   nogit          a stand-in `git`, first on the PATH, that records how it was called and fails at once: Semgrep
//                  goes on without git (E-10), so git never touches the repository even if the tool changes
//   git-shadow     E-24's shadow repository, built from files alone: bare, an empty configuration of two lines,
//                  the objects by alternates, the refs, packed-refs, HEAD and shallow copied; no hooks, no
//                  attributes, no index. The scanner's git runs on it, with Git's own configuration out of reach.
// The project's .git is only read (D-38): its configuration, hooks and attributes never reach a process.
import type { Catalog } from '@ayar/catalog';
import type { InvocationTemplate, Reason } from '@ayar/protocol';
import { posix } from 'node:path';
import { locate } from '../discovery/git.ts';
import type { FileSystem } from '../ports/index.ts';
import { nogitDir, shadowDir } from './template.ts';

const MAX_REF_BYTES = 64 * 1024;
const MAX_REFS = 50_000;
const enc = new TextEncoder();

/** The stand-in's record of its calls, kept as evidence (AT-01: «لا git من الأدوات الساكنة»). */
export const NOGIT_LOG = 'nogit-calls.log';

/** POSIX shell single quotes (the folder is AYAR's own; quoted all the same). */
const sq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

export async function prepare(o: { fs: FileSystem; catalog: Catalog; template: InvocationTemplate; tmpDir: string; root: string }): Promise<{ ok: true } | { ok: false; outcome: 'missing' | 'unavailable'; reason: Reason }> {
  const { fs, tmpDir } = o;
  const write = async (path: string, text: string, mode = 0o600) => {
    if (!(await fs.writeFileExclusive(path, enc.encode(text), mode))) throw new Error(`${path} exists`);
  };
  for (const step of o.template.prepare) {
    if (step === 'semgrep-rules') {
      await write(posix.join(tmpDir, 'ayar-rules.yml'), o.catalog.semgrep.configText());
      await write(posix.join(tmpDir, 'semgrep-settings.yml'), 'has_shown_metrics_notification: true\n');
      await fs.mkdir(posix.join(tmpDir, 'home'), 0o700);
    } else if (step === 'nogit') {
      const dir = nogitDir(tmpDir);
      await fs.mkdir(dir, 0o700);
      await write(posix.join(dir, 'git'), `#!/bin/sh\nprintf 'cwd=%s args=%s\\n' "$(pwd -P)" "$*" >> ${sq(posix.join(tmpDir, NOGIT_LOG))}\nexit 1\n`, 0o700);
    } else {
      const r = await buildShadow(fs, o.root, shadowDir(tmpDir));
      if (!r.ok) return { ok: false, outcome: 'missing', reason: r.reason };
      await fs.mkdir(posix.join(tmpDir, 'home'), 0o700);
    }
  }
  return { ok: true };
}

/** E-24: the shadow repository, from the project's git files alone. */
export async function buildShadow(fs: FileSystem, root: string, dest: string): Promise<{ ok: true } | { ok: false; reason: Reason }> {
  const where = await locate(fs, root);
  if (!where) return { ok: false, reason: { key: 'adapter.reason.noGitRepository' } };
  const objects = posix.join(where.commondir, 'objects');
  if (!(await fs.lstat(objects))?.isDirectory) return { ok: false, reason: { key: 'adapter.reason.noGitRepository' } };
  const head = await readSmall(fs, posix.join(where.gitdir, 'HEAD'));
  if (head === null) return { ok: false, reason: { key: 'adapter.reason.noGitRepository' } };
  await fs.mkdir(posix.join(dest, 'objects', 'info'), 0o700);
  await fs.mkdir(posix.join(dest, 'refs'), 0o700);
  const put = async (rel: string, data: Uint8Array) => {
    await fs.mkdir(posix.dirname(posix.join(dest, rel)), 0o700);
    await fs.writeFileExclusive(posix.join(dest, rel), data, 0o600);
  };
  await put('objects/info/alternates', enc.encode(`${objects}\n`));
  await put('config', enc.encode('[core]\n\tbare = true\n\trepositoryformatversion = 0\n'));
  await put('HEAD', head);
  for (const name of ['packed-refs', 'shallow']) {
    const data = await readSmall(fs, posix.join(where.commondir, name), 64 * 1024 * 1024);
    if (data) await put(name, data);
  }
  // The refs: regular files only, never a link followed.
  let count = 0;
  const walk = async (rel: string) => {
    for (const e of await fs.readdirEntries(posix.join(where.commondir, rel)).catch(() => [])) {
      if (++count > MAX_REFS) return;
      const r = posix.join(rel, e.name);
      if (e.kind === 'directory') await walk(r);
      else if (e.kind === 'file') {
        const data = await readSmall(fs, posix.join(where.commondir, r));
        if (data) await put(r, data);
      }
    }
  };
  await walk('refs');
  return { ok: true };
}

async function readSmall(fs: FileSystem, path: string, max = MAX_REF_BYTES): Promise<Uint8Array | null> {
  const st = await fs.lstat(path);
  if (!st?.isFile || st.size > max) return null;
  return (await fs.readFilePrefix(path, max)).data;
}
