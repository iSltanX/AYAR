// Version requirements as projects write them: `.nvmrc` (`24`, `v24.16.0`, `lts/*`), `engines.node` (`>=24.12`,
// `^24 || ^22`), `.python-version` (`3.12`), `requires-python` (`>=3.12,<4`), `.tool-versions`. A small matcher:
// true or false when the requirement is understood, null when it is not (`lts/*`, `latest`) — then C-07 says so
// instead of guessing.

export type Version = [number, number, number];

export function parseVersion(v: string): Version | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

export function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** How many parts a bare version names: `24` → 1, `24.16` → 2, `24.16.0` → 3. */
function precision(v: string): number {
  return v.replace(/^v/, '').split('.').filter((p) => /^\d+$/.test(p)).length;
}

function matchesPrefix(version: Version, spec: string): boolean {
  const s = parseVersion(spec);
  if (!s) return false;
  const n = precision(spec);
  return version.slice(0, n).every((x, i) => x === s[i]);
}

/**
 * The two grammars differ on partial versions (review m8): in npm's ranges `>24.1` means above every 24.1.x and
 * `<=24.1` includes every 24.1.x, and `~24` allows every 24.x; in PEP 440 a missing part is zero (`>3.12` is
 * `>3.12.0`) and `==3.12` is exact unless written `==3.12.*`.
 */
export type RangeFlavor = 'npm' | 'pep440';

function comparator(version: Version, c: string, flavor: RangeFlavor): boolean | null {
  const m = /^(>=|<=|>|<|===|==|!=|=|~=|\^|~)?\s*v?([\d.*xX]+)$/.exec(c.trim());
  if (!m) return null;
  const op = m[1] ?? '';
  const wildcard = /(^|\.)[*xX]/.test(m[2]!);
  const raw = m[2]!.replace(/\.[*xX].*$/, '').replace(/^[*xX]$/, '');
  if (raw === '') return op !== '!=';
  const target = parseVersion(raw);
  if (!target) return null;
  const n = precision(raw);
  const cmp = compare(version, target);
  // The comparison over the parts the requirement names: 24.5.3 against `24.5` compares [24, 5] with [24, 5].
  const head = version.slice(0, n).map((x, i) => x - target[i]!).find((d) => d !== 0) ?? 0;
  const partial = n < 3 && (flavor === 'npm' || wildcard);
  switch (op) {
    case '>=':
      return cmp >= 0;
    case '<=':
      return partial ? head <= 0 : cmp <= 0;
    case '>':
      return partial ? head > 0 : cmp > 0;
    case '<':
      return cmp < 0;
    case '^':
      if (cmp < 0 || version[0] !== target[0]) return false;
      if (target[0] !== 0 || n === 1) return true;
      if (target[1] !== 0 || n === 2) return version[1] === target[1];
      return version[1] === 0 && version[2] === target[2];
    case '~':
      return cmp >= 0 && version[0] === target[0] && (n === 1 || version[1] === target[1]);
    case '~=': {
      // PEP 440 compatible release: ~=3.12 means >=3.12, ==3.*
      return cmp >= 0 && version.slice(0, Math.max(1, n - 1)).every((x, i) => x === target[i]);
    }
    case '!=':
      return flavor === 'pep440' && !wildcard ? cmp !== 0 : !matchesPrefix(version, raw);
    case '==':
    case '===':
      if (flavor === 'pep440' && !wildcard) return cmp === 0;
      return matchesPrefix(version, raw);
    default:
      return matchesPrefix(version, raw);
  }
}

/** Does `version` satisfy `spec`? null when the requirement is not a version range this matcher understands. */
export function satisfies(version: string, spec: string, flavor: RangeFlavor = 'npm'): boolean | null {
  const v = parseVersion(version);
  if (!v) return null;
  const s = spec.trim().replace(/(>=|<=|~=|===|==|!=|>|<|=|\^|~)\s+/g, '$1');
  if (!s || /^(lts\/|node$|latest|stable|system|current|\*$)/i.test(s)) return /^\*$/.test(s) ? true : null;
  const alternatives = s.split('||');
  let understood = false;
  for (const alt of alternatives) {
    const parts = alt.split(/[,\s]+/).filter(Boolean);
    let ok = true;
    for (const p of parts) {
      const r = comparator(v, p, flavor);
      if (r === null) return null;
      ok &&= r;
    }
    understood = true;
    if (ok) return true;
  }
  return understood ? false : null;
}

/** The grammar of a tool's requirement: Python's tools follow PEP 440, the rest npm's ranges. */
export function flavorOf(tool: string): RangeFlavor {
  return /^(python|pip|uv|poetry|pdm|hatch)/.test(tool) ? 'pep440' : 'npm';
}

/** The highest of `versions` that satisfies `spec`. */
export function best(versions: readonly string[], spec: string, flavor: RangeFlavor = 'npm'): string | null {
  const ok = versions.filter((v) => satisfies(v, spec, flavor) === true).map((v) => [v, parseVersion(v)!] as const);
  ok.sort((a, b) => compare(b[1], a[1]));
  return ok[0]?.[0] ?? null;
}
