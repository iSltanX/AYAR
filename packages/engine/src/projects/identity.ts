// C-05 «حدّد الموقع الجديد»: before a moved project is linked to a new folder, its identity fingerprint is compared:
// the package name, or the content of a root file (an HMAC, C-18). Discovery records the identity as a fact; a
// relocation computes it for the new folder the same way, reading only those root files.
import { isRecord, parseConfig, str } from '../discovery/parse.ts';

export interface ProjectIdentity {
  name: string | null;
  file: string;
  fingerprint: string;
}

const IDENTITY_FILES: [string, 'json' | 'toml' | 'text'][] = [
  ['package.json', 'json'],
  ['pyproject.toml', 'toml'],
  ['Cargo.toml', 'toml'],
  ['go.mod', 'text'],
  ['Package.swift', 'text'],
  ['manifest.json', 'json'],
  ['README.md', 'text'],
];

function nameOf(file: string, text: string, format: 'json' | 'toml' | 'text'): string | null {
  if (format === 'text') return file === 'go.mod' ? (/^module\s+(\S+)/m.exec(text)?.[1] ?? null) : null;
  const p = parseConfig(text, format);
  if (!p.ok || !isRecord(p.value)) return null;
  if (file === 'pyproject.toml') return isRecord(p.value.project) ? str(p.value.project.name) : isRecord(p.value.tool) && isRecord(p.value.tool.poetry) ? str(p.value.tool.poetry.name) : null;
  if (file === 'Cargo.toml') return isRecord(p.value.package) ? str(p.value.package.name) : null;
  return str(p.value.name);
}

export async function readIdentity(read: (file: string) => Promise<string | null>, fingerprint: (data: Uint8Array) => string): Promise<ProjectIdentity | null> {
  for (const [file, format] of IDENTITY_FILES) {
    const text = await read(file);
    if (text === null) continue;
    return { name: nameOf(file, text, format), file, fingerprint: fingerprint(new TextEncoder().encode(text)) };
  }
  return null;
}

/** Same project: the same name when both have one, else the same root file content. */
export function sameIdentity(a: ProjectIdentity, b: ProjectIdentity): boolean {
  if (a.name && b.name) return a.name === b.name;
  return a.file === b.file && a.fingerprint === b.fingerprint;
}
