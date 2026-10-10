// C-07 points 2 to 4: the fallback PATH, the tools of a project on the computed PATH with their versions read
// from their real paths (no execution), the versions the project asks for, the matching installed version
// from a version manager's folder (proposed explicitly, so it enters the approval), corepack shims (G-DEV2-01),
// shell functions (G-49), and — at readiness only — the version probes: `<tool> --version` with a 5 s limit,
// COREPACK_ENABLE_NETWORK=0 and the version managers' auto-install switched off (E-07, AT-31).
import type { Fact, ToolResolution } from '@ayar/protocol';
import { posix } from 'node:path';
import type { FileSystem, ProcessControl } from '../ports/index.ts';
import type { InstalledVersion } from './managers.ts';
import { best, parseVersion, satisfies } from './semver.ts';

/** C-07 point 2: known folders, kept only when they exist, then the system paths. */
export const FALLBACK_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '~/.local/share/mise/shims', '~/.asdf/shims', '~/.volta/bin', '~/.local/bin', '~/.cargo/bin', '~/.bun/bin'];

export async function fallbackPath(fs: Pick<FileSystem, 'stat'>, home: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of FALLBACK_DIRS) {
    const dir = d.startsWith('~/') ? posix.join(home, d.slice(2)) : d;
    if ((await fs.stat(dir))?.isDirectory) out.push(dir);
  }
  return [...out, '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
}

/** E-07: what keeps a version probe from installing or downloading anything. */
export const PROBE_ENV: Readonly<Record<string, string>> = {
  COREPACK_ENABLE_NETWORK: '0',
  MISE_AUTO_INSTALL: '0',
  MISE_EXEC_AUTO_INSTALL: '0',
  MISE_NOT_FOUND_AUTO_INSTALL: '0',
  ASDF_NODEJS_AUTO_ENABLE_COREPACK: '0',
};
export const PROBE_TIMEOUT_MS = 5000;

const text = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** A version read from where a program lives: Homebrew's Cellar, nvm/fnm/mise/asdf folders, uv's Pythons. */
export function versionFromPath(realPath: string): string | null {
  const patterns = [
    /\/Cellar\/(?:node|node@\d+|python@[\d.]+|pnpm|yarn|uv|poetry|bun)\/(\d+\.\d+(?:\.\d+)?)/,
    /\/\.nvm\/versions\/node\/v(\d+\.\d+\.\d+)\//,
    /\/fnm\/node-versions\/v(\d+\.\d+\.\d+)\//,
    /\/mise\/installs\/(?:node|python)\/(\d+\.\d+\.\d+)\//,
    /\/\.asdf\/installs\/(?:nodejs|python)\/(\d+\.\d+\.\d+)\//,
    /\/\.pyenv\/versions\/(\d+\.\d+\.\d+)\//,
    /\/uv\/python\/cpython-(\d+\.\d+\.\d+)/,
    /\/Python\.framework\/Versions\/(\d+\.\d+)\//,
  ];
  for (const p of patterns) {
    const m = p.exec(realPath);
    if (m) return m[1]!;
  }
  return null;
}

async function onPath(fs: Pick<FileSystem, 'stat'>, path: readonly string[], name: string): Promise<string | null> {
  for (const dir of path) {
    if (!dir.startsWith('/')) continue;
    const p = posix.join(dir, name);
    const st = await fs.stat(p);
    if (st?.isFile && (st.mode & 0o111) !== 0) return p;
  }
  return null;
}

export interface ResolveToolsInput {
  fs: Pick<FileSystem, 'stat' | 'realpath' | 'readFilePrefix'>;
  path: readonly string[];
  /** The project root (absolute): its .venv and the tools it uses. */
  projectRoot: string;
  facts: readonly Fact[];
  installed: readonly InstalledVersion[];
  shellFunctions: readonly string[];
  nvmDefault: string | null;
}

export async function resolveTools(i: ResolveToolsInput): Promise<ToolResolution[]> {
  const has = (key: string) => i.facts.some((f) => f.key === key);
  const node = has('node.package');
  const python = has('python.project') || has('python.requirements') || has('python.manager');
  const pm = node ? text(rec(i.facts.find((f) => f.key === 'node.packageManager' && f.component === '.')?.value ?? i.facts.find((f) => f.key === 'node.packageManager')?.value).name, 'npm') : null;
  const pmFact = i.facts.find((f) => f.key === 'node.packageManager' && f.proof === 'declared');
  const pmSpec = pmFact ? rec(pmFact.value) : null;
  const runtime = (name: 'node' | 'python') => {
    const order = name === 'node' ? ['nvmrc', 'node-version', 'tool-versions', 'mise', 'engines'] : ['python-version', 'tool-versions', 'mise', 'requires-python'];
    const found = i.facts.filter((f) => f.key === `runtime.${name}` && f.component === '.').map((f) => rec(f.value));
    for (const from of order) {
      const hit = found.find((v) => v.from === from);
      if (hit && typeof hit.spec === 'string') return { spec: hit.spec, from };
    }
    return null;
  };

  const tools: { name: string; required: { spec: string; from: string } | null; runtime: 'node' | 'python' | null }[] = [];
  if (node) {
    tools.push({ name: 'node', required: runtime('node'), runtime: 'node' });
    if (pm && pm !== 'npm') tools.push({ name: pm, required: pmSpec && typeof pmSpec.version === 'string' ? { spec: pmSpec.version, from: 'packageManager' } : null, runtime: null });
    tools.push({ name: 'npm', required: pm === 'npm' && pmSpec && typeof pmSpec.version === 'string' ? { spec: pmSpec.version, from: 'packageManager' } : null, runtime: null });
  }
  if (python) {
    tools.push({ name: 'python3', required: runtime('python'), runtime: 'python' });
    const manager = text(rec(i.facts.find((f) => f.key === 'python.manager')?.value).name, '');
    if (manager === 'uv' || manager === 'poetry') tools.push({ name: manager, required: null, runtime: null });
  }

  const out: ToolResolution[] = [];
  for (const t of tools) {
    let path = await onPath(i.fs, i.path, t.name);
    let versionSource: ToolResolution['versionSource'] = null;
    let version: string | null = null;
    // A project virtual environment wins for Python (E-07): its pyvenv.cfg names the version, nothing runs.
    if (t.name === 'python3') {
      const venv = posix.join(i.projectRoot, '.venv');
      const venvPython = posix.join(venv, 'bin/python3');
      if ((await i.fs.stat(venvPython))?.isFile) {
        path = venvPython;
        try {
          const cfg = new TextDecoder().decode((await i.fs.readFilePrefix(posix.join(venv, 'pyvenv.cfg'), 16 * 1024)).data);
          const m = /^\s*version(?:_info)?\s*=\s*(\d+\.\d+(?:\.\d+)?)/m.exec(cfg);
          if (m) {
            version = m[1]!;
            versionSource = 'venv';
          }
        } catch {
          /* no pyvenv.cfg: the version comes from the probe */
        }
      }
    }
    const realPath = path ? await i.fs.realpath(path) : null;
    const viaCorepack = !!realPath && /\/corepack\/dist\/(pnpm|yarn|pnpx|yarnpkg)\.js$/.test(realPath);
    if (!version && realPath && !viaCorepack) {
      version = versionFromPath(realPath);
      if (version) versionSource = 'path';
    }
    const installed = t.runtime ? i.installed.filter((x) => x.tool === t.runtime) : [];
    const sat = version && t.required ? satisfies(version, t.required.spec) : null;
    let proposedPath: string | null = null;
    let status: ToolResolution['status'] = !path ? 'missing' : t.required === null ? (version ? 'ok' : 'unknown') : sat === true ? 'ok' : sat === false ? 'mismatch' : 'unknown';
    if (t.required && (sat === false || !path || (sat === null && !version))) {
      const match = best(installed.map((x) => x.version), t.required.spec);
      const hit = match ? installed.find((x) => x.version === match) : undefined;
      if (hit && sat !== true) {
        proposedPath = hit.path;
        status = 'mismatch';
      } else if (!path) status = 'missing';
    }
    // corepack would download the declared manager (G-DEV2-01): without the network the tool is not ready.
    if (viaCorepack && t.required) status = 'mismatch';
    out.push({
      tool: t.name,
      path,
      realPath,
      viaCorepack,
      shellFunction: i.shellFunctions.includes(t.name) || (t.name === 'python3' && i.shellFunctions.includes('python')),
      version,
      versionSource,
      required: t.required,
      satisfies: sat,
      installed: installed.map((x) => ({ version: x.version, manager: x.manager, path: x.path })),
      proposedPath,
      terminalVersion: t.name === 'node' && i.shellFunctions.includes('node') ? i.nvmDefault : null,
      status,
      probe: null,
    });
  }
  return out;
}

/** Version-manager shims choose the version by the working folder: they are probed in the project folder. */
const DIRECTORY_SHIMS = /\/(\.local\/share\/mise\/shims|\.asdf\/shims|\.pyenv\/shims|\.volta\/bin|\.rbenv\/shims)\//;

export interface ProbeOptions {
  /** The real path of the project root: no program inside it is ever run (review C2). */
  projectRoot: string;
  /** A neutral working folder (the home folder): the default, so no project configuration is read. */
  neutralCwd: string;
  /** In «مشروع غير موثوق» mode nothing is probed in the project folder (FR-55). */
  untrusted: boolean;
  env: Record<string, string>;
  realpath: (p: string) => Promise<string | null>;
}

/**
 * Readiness only (C-07 point 4): `<tool> --version`, 5 s, COREPACK_ENABLE_NETWORK=0 and auto-install off. These
 * are tool programs, never project code: a program whose real path is inside the project (a .venv's python, a
 * node_modules binary) is not run — its version comes from its files. The probe runs in a neutral folder, except
 * for a version-manager shim or corepack's pnpm, which resolve by folder: those run in the project folder, and
 * only for a trusted project. Yarn is never run there (yarnPath points at a file the project ships).
 */
export async function probeVersions(processes: ProcessControl, tools: ToolResolution[], o: ProbeOptions): Promise<ToolResolution[]> {
  const out: ToolResolution[] = [];
  const insideProject = (p: string) => p === o.projectRoot || p.startsWith(`${o.projectRoot}/`);
  for (const t of tools) {
    const program = t.proposedPath ?? t.path;
    if (!program) {
      out.push(t);
      continue;
    }
    const real = (await o.realpath(program)) ?? program;
    if (insideProject(program) || insideProject(real)) {
      out.push({ ...t, probe: { ok: false, version: null, durationMs: 0, error: 'project_controlled' } });
      continue;
    }
    const byFolder = DIRECTORY_SHIMS.test(program) || (t.viaCorepack && t.tool === 'pnpm');
    if (byFolder && o.untrusted) {
      out.push({ ...t, probe: { ok: false, version: null, durationMs: 0, error: 'untrusted' } });
      continue;
    }
    const cwd = byFolder && t.tool !== 'yarn' ? o.projectRoot : o.neutralCwd;
    const r = await processes.spawn(program, ['--version'], { cwd, env: { ...o.env, ...PROBE_ENV }, timeoutMs: PROBE_TIMEOUT_MS, maxOutputBytes: 64 * 1024 });
    const text = new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr);
    const m = /(\d+\.\d+\.\d+)/.exec(text);
    const ok = !r.error && !r.timedOut && r.code === 0 && !!m;
    const probe = { ok, version: ok ? m[1]! : null, durationMs: r.durationMs, error: r.error ?? (r.timedOut ? 'timeout' : r.code !== 0 ? `exit:${r.code ?? r.signal ?? '?'}` : m ? null : 'no_version') };
    let { version, versionSource, satisfies: sat, status } = t;
    if (ok && !t.proposedPath) {
      version = probe.version;
      versionSource = 'probe';
      sat = t.required && version ? satisfies(version, t.required.spec) : null;
      status = t.required ? (sat === true ? 'ok' : sat === false ? 'mismatch' : 'unknown') : 'ok';
      if (t.viaCorepack && t.required && parseVersion(version!)?.join('.') !== parseVersion(t.required.spec)?.join('.')) status = 'mismatch';
    } else if (!ok) status = t.status === 'missing' ? 'missing' : probe.error === 'timeout' ? 'unknown' : 'mismatch';
    out.push({ ...t, version, versionSource, satisfies: sat, status, probe });
  }
  return out;
}
