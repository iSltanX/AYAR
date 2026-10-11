// The design checks that read sources only (C-13): design.tokens.static (a literal outside the declared scale in a
// bound property, a var() of an undefined token; a literal equal to a token, a suggestion «استخدم الرمز»),
// design.fonts.static (a family not approved, a local @font-face file missing, a font from a remote host) and
// design.rtl.static (an entry page without `dir` or `lang` while the interface declares Arabic; physical properties,
// suggestions). No reference, no scale: «ناقص إعداد», never an invented one (7.4). CSS, SCSS and the <style> blocks
// of HTML, Svelte, Vue and Astro are read with postcss; a Tailwind 3 configuration in JavaScript is not read (it would
// run code), nor are inline JSX styles or CSS-in-JS (the first release's limits).
import { finding, pushFinding } from '@ayar/adapters';
import type { ExitSignal } from '@ayar/protocol';
import postcss from 'postcss';
import { posix } from 'node:path';
import { checkCancel, factValues, htmlTags, OK, readOrSay, refValue, report, styleSources, type Analyzer, type AnalyzerInput } from './common.ts';
import { stripJsonComments } from './manifest.ts';

// ── tokens ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface Token {
  /** The CSS custom property it is (`--color-primary`). */
  name: string;
  type: 'color' | 'dimension' | 'fontFamily' | 'other';
  values: string[];
}

const NAMED_COLORS = new Set('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' '));

/** A colour literal normalized for comparison (`#ABC` → `#aabbcc`, `rgb(26 115 232)` → `#1a73e8`). */
export function normalizeColor(v: string): string | null {
  const s = v.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1]!;
    if (h.length === 3 || h.length === 4) return `#${[...h].map((c) => c + c).join('')}`.replace(/^(#[0-9a-f]{6})ff$/, '$1');
    if (h.length === 6) return `#${h}`;
    if (h.length === 8) return `#${h}`.replace(/^(#[0-9a-f]{6})ff$/, '$1');
    return null;
  }
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const hex = [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('');
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    return a >= 1 ? `#${hex}` : `#${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
  }
  if (NAMED_COLORS.has(s)) return s;
  return null;
}

/** The colour literals of a declaration's value (hex, rgb/rgba, hsl/hsla, named), outside var() and url(). */
export function colorLiterals(value: string): string[] {
  const v = value.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ').replace(/url\([^)]*\)/g, ' ');
  const out: string[] = [];
  for (const m of v.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)|\b[a-zA-Z]+\b/g)) {
    const t = m[0];
    if (t.startsWith('#') || /^(rgb|hsl)/i.test(t) || NAMED_COLORS.has(t.toLowerCase())) out.push(t);
  }
  return out;
}

/** The lengths of a value in px (rem and px; em, % and viewport units are relative and left alone). */
export function lengthLiterals(value: string): { text: string; px: number }[] {
  const v = value.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ').replace(/calc\([^)]*\)/g, ' ');
  const out: { text: string; px: number }[] = [];
  for (const m of v.matchAll(/(-?\d*\.?\d+)(px|rem)\b/g)) out.push({ text: m[0], px: Math.abs(Number(m[1]) * (m[2] === 'rem' ? 16 : 1)) });
  return out;
}

const COLOR_PROPS = /^(color|background|background-color|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|text-decoration(-color)?|caret-color|column-rule(-color)?|accent-color)$/;
const SPACING_PROPS = /^(margin|padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(gap|row-gap|column-gap|inset(-(block|inline)(-(start|end))?)?|top|right|bottom|left)$/;
const RADIUS_PROPS = /^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/;
const FONT_SIZE_PROPS = /^font-size$/;

/** DTCG tokens (`$value`, `$type` inherited by groups, modes in `$extensions.mode`) as CSS custom properties. */
export function dtcgTokens(json: unknown): Token[] {
  const out: Token[] = [];
  const walk = (node: unknown, path: string[], inherited: string | null) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
    const o = node as Record<string, unknown>;
    const type = typeof o.$type === 'string' ? o.$type : inherited;
    if ('$value' in o || 'value' in o) {
      const raw = '$value' in o ? o.$value : o.value;
      const modes = o.$extensions && typeof o.$extensions === 'object' ? (o.$extensions as Record<string, unknown>).mode : null;
      const values = [raw, ...(modes && typeof modes === 'object' ? Object.values(modes as Record<string, unknown>) : [])].map((v) => (Array.isArray(v) ? v.join(', ') : String(v)));
      out.push({ name: `--${path.join('-')}`, type: type === 'color' ? 'color' : type === 'dimension' ? 'dimension' : type === 'fontFamily' ? 'fontFamily' : 'other', values });
      return;
    }
    for (const [k, v] of Object.entries(o)) if (!k.startsWith('$')) walk(v, [...path, k], type);
  };
  walk(json, [], null);
  return out;
}

/** Custom properties defined in a stylesheet (`:root`, themes, Tailwind 4 `@theme`), as tokens. */
export function cssTokens(css: string): Token[] {
  const out: Token[] = [];
  try {
    postcss.parse(css).walkDecls(/^--/, (d) => {
      const v = d.value.trim();
      out.push({ name: d.prop, type: normalizeColor(v) ? 'color' : /^-?\d*\.?\d+(px|rem)$/.test(v) ? 'dimension' : 'other', values: [v] });
    });
  } catch {
    // An unparsable token stylesheet: no tokens from it.
  }
  return out;
}

interface TokensConfig {
  source: string | null;
  css: string[];
  scope: string[] | null;
  spacingScalePx: number[] | null;
  tolerancePx: number;
  exclude: string[];
}

function tokensConfig(i: AnalyzerInput): TokensConfig | null {
  const v = refValue(i, 'tokens');
  if (typeof v === 'string') return { source: v, css: [], scope: null, spacingScalePx: null, tolerancePx: 0, exclude: [] };
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : typeof x === 'string' ? [x] : []);
  return {
    source: typeof o.source === 'string' ? o.source : typeof o.tokens === 'string' ? o.tokens : null,
    css: list(o.css ?? o.tokens_css),
    scope: o.scope || o.static_scope ? list(o.scope ?? o.static_scope) : null,
    spacingScalePx: Array.isArray(o.spacingScalePx ?? o.spacing_scale_px) ? ((o.spacingScalePx ?? o.spacing_scale_px) as unknown[]).filter((n): n is number => typeof n === 'number') : null,
    tolerancePx: typeof o.tolerancePx === 'number' ? o.tolerancePx : 0,
    exclude: list(o.exclude),
  };
}

/** A glob of the scope (`src/*.js`, `styles/**`): `**` any folders, `*` a name part. */
export function globMatch(glob: string, path: string): boolean {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/?/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?');
  return new RegExp(`^${re}$`).test(path);
}

function styleFiles(i: AnalyzerInput, scope: string[] | null, exclude: string[]): string[] {
  const comp = i.component === '.' ? '' : `${i.component}/`;
  return i.files.filter((f) => /\.(css|scss|pcss|html?|svelte|vue|astro)$/i.test(f) && (scope ? scope.some((g) => globMatch(`${comp}${g}`, f) || globMatch(g, f)) : true) && !exclude.some((g) => globMatch(`${comp}${g}`, f) || globMatch(g, f)));
}

function nearestPx(scale: number[], px: number): number {
  return scale.reduce((best, s) => (Math.abs(s - px) < Math.abs(best - px) ? s : best), scale[0] ?? 0);
}

/** The declared design scale (DTCG tokens and token stylesheets): colours, the spacing, radius and font-size scales. */
export interface TokenScale {
  tokens: Token[];
  /** The tokens' files: the scale's source, never judged against it. */
  sourceFiles: Set<string>;
  /** A colour of the tokens (normalized) → its token. */
  colors: Map<string, string>;
  spacing: number[];
  radius: number[];
  fontSize: number[];
  /** A length of the tokens (px) → its token. */
  dimToken: Map<number, string>;
  tolerancePx: number;
  scope: string[] | null;
  exclude: string[];
}

export const SCALE_PROPS = { color: COLOR_PROPS, spacing: SPACING_PROPS, radius: RADIUS_PROPS, fontSize: FONT_SIZE_PROPS };

/**
 * The tokens reference read into a scale (design.tokens.static here, design.tokens.render in the probe's judge):
 * the reference absent or unreadable is the exit signal of «ناقص إعداد» or «تعذّر», never an invented scale (7.4).
 */
export function loadTokenScale(i: AnalyzerInput): { scale: TokenScale } | { exit: ExitSignal } {
  const cfg = tokensConfig(i);
  if (!cfg || (!cfg.source && !cfg.css.length)) return { exit: { kind: 'missing', reason: { key: 'analyzer.reason.noTokens' } } };
  const comp = i.component === '.' ? '' : `${i.component}/`;
  const at = (p: string) => (i.exists(p) ? p : i.exists(`${comp}${p}`) ? `${comp}${p}` : p);
  const tokens: Token[] = [];
  const sourceFiles = new Set<string>();
  if (cfg.source) {
    const rel = at(cfg.source);
    sourceFiles.add(rel);
    const text = i.read(rel);
    if (text === null) return { exit: { kind: 'missing', reason: { key: 'analyzer.reason.tokensUnreadable', params: { path: cfg.source } } } };
    if (/\.json$/i.test(rel)) {
      try {
        tokens.push(...dtcgTokens(JSON.parse(stripJsonComments(text).json)));
      } catch (e) {
        return { exit: { kind: 'tool_error', reason: { key: 'analyzer.reason.tokensUnparsable', params: { path: rel, detail: e instanceof Error ? e.message.slice(0, 200) : 'invalid' } } } };
      }
    } else if (/\.(css|scss|pcss)$/i.test(rel)) tokens.push(...cssTokens(text));
    else return { exit: { kind: 'missing', reason: { key: 'analyzer.reason.tokensFormat', params: { path: rel } } } };
  }
  for (const c of cfg.css) {
    const rel = at(c);
    sourceFiles.add(rel);
    tokens.push(...cssTokens(i.read(rel) ?? ''));
  }
  const colors = new Map<string, string>();
  for (const t of tokens) if (t.type === 'color') for (const v of t.values) {
    const n = normalizeColor(v);
    if (n) colors.set(n, t.name);
  }
  const dims = (re: RegExp) => [...new Set(tokens.filter((t) => t.type === 'dimension' && re.test(t.name)).flatMap((t) => t.values.flatMap((v) => lengthLiterals(v).map((l) => l.px))))].sort((a, b) => a - b);
  const spacing = cfg.spacingScalePx ?? dims(/space|spacing|gap|gutter/);
  const radius = dims(/radius|rounded/);
  const dimToken = new Map<number, string>();
  for (const t of tokens) if (t.type === 'dimension') for (const v of t.values) for (const l of lengthLiterals(v)) if (!dimToken.has(l.px)) dimToken.set(l.px, t.name);
  return {
    scale: {
      tokens,
      sourceFiles,
      colors,
      spacing: spacing.length ? [0, ...spacing] : [],
      radius: radius.length ? [0, ...radius] : [],
      fontSize: dims(/font.*size|text-size|fontsize/),
      dimToken,
      tolerancePx: cfg.tolerancePx,
      scope: cfg.scope,
      exclude: cfg.exclude,
    },
  };
}

export const tokensAnalyzer: Analyzer = {
  id: 'tokens-static',
  version: '1.0.0',
  limitsKey: 'analyzer.limits.tokens',
  run(i) {
    const r = report(this, ['css']);
    const loaded = loadTokenScale(i);
    if ('exit' in loaded) return { report: r, exit: loaded.exit };
    const { tokens, sourceFiles, colors, dimToken } = loaded.scale;
    const cfg = { scope: loaded.scale.scope, exclude: loaded.scale.exclude, tolerancePx: loaded.scale.tolerancePx };
    const scales: [RegExp, number[]][] = [
      [SPACING_PROPS, loaded.scale.spacing],
      [RADIUS_PROPS, loaded.scale.radius],
      [FONT_SIZE_PROPS, loaded.scale.fontSize],
    ];

    // Every custom property the project defines anywhere counts as defined (a local --x is not a token, but exists).
    const defined = new Set(tokens.map((t) => t.name));
    const all = styleFiles(i, null, []);
    for (const f of all) for (const s of styleSources(f, i.read(f) ?? '')) for (const t of cssTokens(s.css)) defined.add(t.name);

    const files = styleFiles(i, cfg.scope, cfg.exclude).filter((f) => !sourceFiles.has(f));
    for (const file of files) {
      checkCancel(i);
      const text = readOrSay(i, r, file);
      if (text === null) continue;
      for (const s of styleSources(file, text)) {
        let root: postcss.Root;
        try {
          root = postcss.parse(s.css);
        } catch (e) {
          pushFinding(r, finding({ rule: 'analysis.unparsable-file', origin: 'tool', message: `${file}: ${e instanceof Error ? e.message.slice(0, 200) : 'unparsable'}`, location: { path: file, line: s.line }, anchor: { kind: 'text', value: file } }));
          continue;
        }
        root.walkDecls((d) => {
          if (d.prop.startsWith('--')) return; // a definition, not a use
          const prop = d.prop.toLowerCase();
          const line = s.line - 1 + (d.source?.start?.line ?? 1);
          const location = { path: file, line };
          const anchor = { kind: 'code' as const, value: '' };
          for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) if (!defined.has(m[1]!)) pushFinding(r, finding({ rule: 'tokens.undefined-var', message: `var(${m[1]}) is not defined by the tokens nor in the styles`, location, anchor, actual: m[1]! }));
          if (COLOR_PROPS.test(prop) && colors.size) {
            for (const lit of colorLiterals(d.value)) {
              const n = normalizeColor(lit);
              if (!n) continue;
              const token = colors.get(n);
              if (token) pushFinding(r, finding({ rule: 'tokens.use-token', message: `${prop}: ${lit} is the value of ${token}: use the token`, location, anchor, expected: `var(${token})`, actual: lit }));
              else pushFinding(r, finding({ rule: 'tokens.off-scale', message: `${prop}: ${lit} is not a colour of the tokens`, location, anchor, actual: lit }));
            }
          }
          for (const [re, scale] of scales) {
            if (!re.test(prop) || !scale.length) continue;
            for (const l of lengthLiterals(d.value)) {
              if (l.px === 0) continue;
              const near = nearestPx(scale, l.px);
              if (Math.abs(near - l.px) <= cfg.tolerancePx) {
                const token = dimToken.get(near);
                if (token && l.px === near) pushFinding(r, finding({ rule: 'tokens.use-token', message: `${prop}: ${l.text} is the value of ${token}: use the token`, location, anchor, expected: `var(${token})`, actual: l.text }));
              } else pushFinding(r, finding({ rule: 'tokens.off-scale', message: `${prop}: ${l.text} is outside the scale (nearest ${near}px)`, location, anchor, expected: `${near}px`, actual: l.text }));
            }
          }
        });
      }
    }
    r.info.tokens = tokens.length;
    r.info.files = files.length;
    return { report: r, exit: OK };
  },
};

// ── fonts ───────────────────────────────────────────────────────────────────────────────────────────────────

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', 'revert-layer', '-apple-system', 'blinkmacsystemfont']);

/** The families of a `font-family` value (quotes removed, var() and generic families left out). */
export function families(value: string): string[] {
  if (/var\(/.test(value)) return [];
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (const c of value) {
    if (q) {
      if (c === q) q = null;
      else cur += c;
    } else if (c === '"' || c === "'") q = c;
    else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out.filter((f) => f && !GENERIC.has(f.toLowerCase()));
}

/** The family of a `font` shorthand: what follows the size (and line height). */
function shorthandFamily(value: string): string {
  const m = /(?:^|\s)[\d.]+(?:px|rem|em|%|pt)(?:\s*\/\s*[\d.]+[a-z%]*)?\s+(.+)$/i.exec(value);
  return m ? m[1]! : '';
}

const REMOTE = /^(https?:)?\/\//i;

export const fontsAnalyzer: Analyzer = {
  id: 'fonts-static',
  version: '1.0.0',
  limitsKey: 'analyzer.limits.fonts',
  run(i) {
    const r = report(this, ['css', 'html']);
    const v = refValue(i, 'fonts');
    const cfg = Array.isArray(v) ? { approved: v.filter((x): x is string => typeof x === 'string'), localOnly: false, scope: null as string[] | null } : v && typeof v === 'object' ? { approved: Array.isArray((v as Record<string, unknown>).approved) ? ((v as Record<string, unknown>).approved as unknown[]).filter((x): x is string => typeof x === 'string') : Array.isArray((v as Record<string, unknown>).approved_fonts) ? ((v as Record<string, unknown>).approved_fonts as unknown[]).filter((x): x is string => typeof x === 'string') : [], localOnly: (v as Record<string, unknown>).localOnly === true, scope: Array.isArray((v as Record<string, unknown>).scope) ? ((v as Record<string, unknown>).scope as unknown[]).filter((x): x is string => typeof x === 'string') : null } : null;
    if (!cfg || !cfg.approved.length) return { report: r, exit: { kind: 'missing', reason: { key: 'analyzer.reason.noFonts' } } };
    const approved = new Set(cfg.approved.map((f) => f.toLowerCase()));
    const files = styleFiles(i, cfg.scope, []);
    const anchor = { kind: 'code' as const, value: '' };
    const remote = (file: string, line: number, url: string) => pushFinding(r, finding({ rule: 'fonts.remote', level: cfg.localOnly ? 'error' : 'warning', message: `a font loaded from ${url.replace(/^(https?:)?\/\//, '').split('/')[0]}; AYAR loads nothing from the network while scanning`, location: { path: file, line }, anchor, actual: url }));
    for (const file of files) {
      checkCancel(i);
      const text = readOrSay(i, r, file);
      if (text === null) continue;
      // Pages: a stylesheet from a font host (`<link href="https://fonts.googleapis.com/…">`).
      if (/\.html?$/i.test(file)) {
        for (const t of htmlTags(text)) {
          const rel = (t.attrs.rel ?? '').toLowerCase().split(/\s+/);
          const loads = rel.includes('stylesheet') || (rel.includes('preload') && t.attrs.as === 'font');
          if (t.name === 'link' && loads && REMOTE.test(t.attrs.href ?? '') && /font/i.test(t.attrs.href ?? '')) remote(file, t.line, t.attrs.href!);
        }
      }
      for (const s of styleSources(file, text)) {
        let root: postcss.Root;
        try {
          root = postcss.parse(s.css);
        } catch (e) {
          pushFinding(r, finding({ rule: 'analysis.unparsable-file', origin: 'tool', message: `${file}: ${e instanceof Error ? e.message.slice(0, 200) : 'unparsable'}`, location: { path: file, line: s.line }, anchor: { kind: 'text', value: file } }));
          continue;
        }
        const lineOf = (n: postcss.Node) => s.line - 1 + (n.source?.start?.line ?? 1);
        root.walkAtRules('import', (a) => {
          const m = /(?:url\(\s*)?['"]?([^'")\s]+)/.exec(a.params);
          if (m && REMOTE.test(m[1]!) && /font/i.test(m[1]!)) remote(file, lineOf(a), m[1]!);
        });
        root.walkAtRules('font-face', (a) => {
          a.walkDecls('src', (d) => {
            for (const m of d.value.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
              const url = m[2]!;
              if (REMOTE.test(url)) remote(file, lineOf(d), url);
              else if (!url.startsWith('data:')) {
                const target = posix.normalize(posix.join(posix.dirname(file), url.split(/[?#]/)[0]!));
                if (!i.exists(target)) pushFinding(r, finding({ rule: 'fonts.face-missing', message: `@font-face: ${url} does not exist`, location: { path: file, line: lineOf(d) }, anchor, actual: url }));
              }
            }
          });
        });
        root.walkDecls(/^(font-family|font)$/i, (d) => {
          if (d.parent && d.parent.type === 'atrule' && (d.parent as postcss.AtRule).name === 'font-face') return;
          const value = d.prop.toLowerCase() === 'font' ? shorthandFamily(d.value) : d.value;
          for (const fam of families(value)) if (!approved.has(fam.toLowerCase())) pushFinding(r, finding({ rule: 'fonts.unapproved', message: `${fam} is not an approved font`, location: { path: file, line: lineOf(d) }, anchor, actual: fam, expected: cfg.approved.join(', ') }));
        });
      }
    }
    r.info.files = files.length;
    return { report: r, exit: OK };
  },
};

// ── direction ───────────────────────────────────────────────────────────────────────────────────────────────

const RTL = /^(ar|fa|he|ur|ps|ku|ckb|sd|ug|yi|dv)(-|$)/i;
const PHYSICAL = /^(margin|padding)-(left|right)$|^(left|right)$|^border-(left|right)(-.+)?$|^border-(top|bottom)-(left|right)-radius$/i;

export const rtlAnalyzer: Analyzer = {
  id: 'rtl-static',
  version: '1.0.0',
  limitsKey: 'analyzer.limits.rtl',
  run(i) {
    const r = report(this, ['html', 'css']);
    // The interface declares a right-to-left language (C-13: «تعلن الواجهة لغة من اليمين»).
    const rtl = factValues(i, 'ui.rtl')[0];
    const languages = [...((rtl?.languages as string[] | undefined) ?? []), ...factValues(i, 'ui.languages').flatMap((f) => (f.languages as string[] | undefined) ?? []), ...factValues(i, 'ui.defaultLocale').map((f) => (typeof f.value === 'string' ? f.value : ''))].filter((l) => RTL.test(l));
    if (!rtl && !languages.length) return { report: r, exit: { kind: 'missing', reason: { key: 'analyzer.reason.noRtl' } } };
    const pages = factValues(i, 'ui.entryPages').flatMap((f) => (f.files as string[] | undefined) ?? []);
    for (const page of pages) {
      checkCancel(i);
      const text = readOrSay(i, r, page);
      if (text === null) continue;
      const html = htmlTags(text).find((t) => t.name === 'html');
      if (!html) continue;
      const anchor = { kind: 'code' as const, value: '' };
      if (!('dir' in html.attrs)) pushFinding(r, finding({ rule: 'rtl.missing-dir', message: `${page}: <html> has no dir while the interface declares ${languages[0] ?? 'a right-to-left language'}`, location: { path: page, line: html.line }, anchor }));
      if (!('lang' in html.attrs)) pushFinding(r, finding({ rule: 'rtl.missing-lang', message: `${page}: <html> has no lang`, location: { path: page, line: html.line }, anchor }));
    }
    // Physical properties: suggestions, by number and place (a physical property may be intended).
    for (const file of styleFiles(i, null, [])) {
      checkCancel(i);
      const text = readOrSay(i, r, file);
      if (text === null) continue;
      for (const s of styleSources(file, text)) {
        try {
          postcss.parse(s.css).walkDecls((d) => {
            const physical = PHYSICAL.test(d.prop) || (/^(text-align|float|clear)$/i.test(d.prop) && /^(left|right)$/i.test(d.value.trim()));
            if (physical) pushFinding(r, finding({ rule: 'rtl.physical-property', message: `${d.prop}: ${d.value} — a logical property (inline-start/end) follows the direction`, location: { path: file, line: s.line - 1 + (d.source?.start?.line ?? 1) }, anchor: { kind: 'code', value: '' } }));
          });
        } catch {
          // An unparsable stylesheet gives no suggestion; the pages were checked.
        }
      }
    }
    r.info.pages = pages.length;
    return { report: r, exit: OK };
  },
};

