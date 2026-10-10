// C-06 point 10: components. Each package of a workspace (`workspaces` in package.json, `packages:` in
// pnpm-workspace.yaml, `[tool.uv.workspace] members`) becomes a component whose id is its relative path; the
// root is always the component `.`. A pnpm-workspace.yaml without `packages:` only carries pnpm settings and
// declares no workspace (E-15 point 6). A manifest inside a test vault (E-15 point 2) is not a component.
import type { FactSource } from '@ayar/protocol';
import { isRecord, lineOf, lineOfJsonPath, lineOfToml, parseConfig } from './parse.ts';

export interface ComponentDecl {
  patterns: string[];
  source: FactSource;
}

/** Workspace patterns from the root files, read before the walk (so output folders of components are known). */
export function workspaceDecls(files: { packageJson?: string | null; pnpmWorkspace?: string | null; pyproject?: string | null }): ComponentDecl[] {
  const out: ComponentDecl[] = [];
  if (files.packageJson) {
    const p = parseConfig(files.packageJson, 'json');
    if (p.ok && isRecord(p.value)) {
      const w = p.value.workspaces;
      const patterns = Array.isArray(w) ? w : isRecord(w) && Array.isArray(w.packages) ? w.packages : [];
      const list = patterns.filter((x): x is string => typeof x === 'string');
      if (list.length) out.push({ patterns: list, source: { file: 'package.json', pointer: '/workspaces', line: lineOfJsonPath(files.packageJson, ['workspaces']) } });
    }
  }
  if (files.pnpmWorkspace) {
    const p = parseConfig(files.pnpmWorkspace, 'yaml');
    if (p.ok && isRecord(p.value) && Array.isArray(p.value.packages)) {
      const list = p.value.packages.filter((x): x is string => typeof x === 'string');
      if (list.length) out.push({ patterns: list, source: { file: 'pnpm-workspace.yaml', pointer: '/packages', line: lineOf(files.pnpmWorkspace, 'packages') } });
    }
  }
  if (files.pyproject) {
    const p = parseConfig(files.pyproject, 'toml');
    const members = p.ok && isRecord(p.value) && isRecord(p.value.tool) && isRecord(p.value.tool.uv) && isRecord(p.value.tool.uv.workspace) ? p.value.tool.uv.workspace.members : null;
    if (Array.isArray(members)) {
      const list = members.filter((x): x is string => typeof x === 'string');
      if (list.length) out.push({ patterns: list, source: { file: 'pyproject.toml', pointer: 'tool.uv.workspace.members', line: lineOfToml(files.pyproject, 'tool.uv.workspace', 'members') } });
    }
  }
  return out;
}

/** A workspace glob as a regular expression over relative folder paths (`packages/*`, `apps/**`). */
export function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/^\.\//, '').replace(/\/+$/, '');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const ch = g[i]!;
    if (ch === '*') {
      if (g[i + 1] === '*') {
        re += '.*';
        i++;
        if (g[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function matchesWorkspace(rel: string, decls: readonly ComponentDecl[]): ComponentDecl | null {
  if (rel === '.') return null;
  for (const d of decls) {
    const include = d.patterns.filter((p) => !p.startsWith('!'));
    const exclude = d.patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1));
    if (include.some((p) => globToRegExp(p).test(rel)) && !exclude.some((p) => globToRegExp(p).test(rel))) return d;
  }
  return null;
}

/** The component a file belongs to: the deepest component folder that contains it. */
export function componentOf(rel: string, componentDirs: readonly string[]): string {
  let best: string | null = null;
  for (const c of componentDirs) {
    if (c === '.') continue;
    if ((rel === c || rel.startsWith(`${c}/`)) && (best === null || c.length > best.length)) best = c;
  }
  return best ?? '.';
}
