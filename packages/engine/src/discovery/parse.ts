// Safe parsers for the configuration files discovery reads (C-06 point 5): JSON (with comments where the
// tool allows them), YAML with the core schema and no custom tags, and TOML. None of them evaluates anything.
// Positions: a fact names its file and a pointer, and the line where the key first appears (best effort).
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';

export type ConfigFormat = 'json' | 'jsonc' | 'yaml' | 'toml' | 'text';

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Removes // and /* *\/ comments and trailing commas outside strings (tsconfig, devcontainer, biome.jsonc…). */
export function stripJsonComments(text: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i]!;
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    out += ch;
    i++;
  }
  // Trailing commas before } or ], outside strings: a second pass over the comment-free text.
  let result = '';
  inString = false;
  for (let j = 0; j < out.length; j++) {
    const ch = out[j]!;
    if (inString) {
      result += ch;
      if (ch === '\\' && j + 1 < out.length) result += out[++j];
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    if (ch === ',') {
      let k = j + 1;
      while (k < out.length && /\s/.test(out[k]!)) k++;
      if (out[k] === '}' || out[k] === ']') continue;
    }
    result += ch;
  }
  return result;
}

export function parseConfig(text: string, format: ConfigFormat): ParseResult {
  try {
    switch (format) {
      case 'json':
        return { ok: true, value: JSON.parse(text.replace(/^﻿/, '')) };
      case 'jsonc':
        return { ok: true, value: JSON.parse(stripJsonComments(text.replace(/^﻿/, ''))) };
      case 'yaml':
        // The core schema: plain data only, no custom tags; aliases capped (no billion laughs).
        return { ok: true, value: parseYaml(text, { schema: 'core', customTags: [], maxAliasCount: 50, merge: false, prettyErrors: false }) };
      case 'toml':
        return { ok: true, value: parseToml(text) };
      case 'text':
        return { ok: true, value: text };
    }
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 200) };
  }
}

// Line positions are looked up in a table of newline offsets, built once per text (a few texts are cached), so
// placing many facts in one large file stays linear (review M1: a hostile file must not cost quadratic time).
const lineTables = new Map<string, number[]>();
function newlines(text: string): number[] {
  let t = lineTables.get(text);
  if (!t) {
    t = [];
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) t.push(i);
    if (lineTables.size >= 8) lineTables.delete(lineTables.keys().next().value!);
    lineTables.set(text, t);
  }
  return t;
}

/** The 1-based line of a character offset. */
export function lineAt(text: string, index: number): number {
  const t = newlines(text);
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! < index) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

/** The 1-based line where `needle` first appears (from `from`), or null. Used to place a fact inside its file. */
export function lineOf(text: string, needle: string, from = 0): number | null {
  const i = text.indexOf(needle, from);
  return i < 0 ? null : lineAt(text, i);
}

/** The line of a JSON key path such as ["scripts", "test"]: each key is searched after the previous one. */
export function lineOfJsonPath(text: string, path: readonly string[]): number | null {
  let from = 0;
  let line: number | null = null;
  for (const key of path) {
    const needle = `"${key}"`;
    const i = text.indexOf(needle, from);
    if (i < 0) return line;
    line = lineAt(text, i);
    from = i + needle.length;
  }
  return line;
}

/** A TOML table header or key: `[tool.pytest.ini_options]`, or `name =` within a table. Line by line, linear. */
export function lineOfToml(text: string, table: string, key?: string): number | null {
  const lines = text.split('\n');
  const header = (l: string) => {
    const t = l.trim();
    return t === `[${table}]` || t === `[[${table}]]`;
  };
  const at = lines.findIndex(header);
  if (at < 0) return null;
  if (!key) return at + 1;
  for (let i = at + 1; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t.startsWith('[')) break;
    const eq = t.indexOf('=');
    if (eq > 0 && t.slice(0, eq).trim().replace(/^"|"$/g, '') === key) return i + 1;
  }
  return at + 1;
}

/** A JSON pointer (RFC 6901) for a key path. */
export function pointer(path: readonly (string | number)[]): string {
  return path.length ? `/${path.map((p) => String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}` : '';
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
