// DEV-10, task 1 and 3: the design source read from Figma (src/renderer/design/figma/) and the files generated
// from it (tokens.css and icons.generated.ts). Pure functions: the generator writes their output, and the tests
// regenerate it to prove the committed files have not drifted from the Figma dump.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const RENDERER = fileURLToPath(new URL('../../src/renderer/', import.meta.url));
export const FIGMA_DIR = `${RENDERER}design/figma/`;
export const TOKENS_CSS = `${RENDERER}design/tokens.css`;
export const ICONS_TS = `${RENDERER}design/icons.generated.ts`;

export type Mode = 'light' | 'dark';
export const MODES: readonly Mode[] = ['light', 'dark'];

export interface DesignSource {
  /** name -> value per mode; aliases (`@name`) are kept as written. */
  primitives: Map<string, Record<Mode, string>>;
  semantic: Map<string, Record<Mode, string>>;
  status: Map<string, Record<Mode, string>>;
  dimensions: Map<string, number>;
  textStyles: Map<string, { family: string; style: string; size: number; lineHeight: number }>;
  shadow: { x: number; y: number; blur: number; spread: number; color: string }[];
}

export function readDesignSource(text = readFileSync(`${FIGMA_DIR}variables.txt`, 'utf8')): DesignSource {
  const src: DesignSource = {
    primitives: new Map(),
    semantic: new Map(),
    status: new Map(),
    dimensions: new Map(),
    textStyles: new Map(),
    shadow: [],
  };
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#COL ')) section = line.slice(5).trim();
    else if (line.startsWith('#TEXT')) section = 'TEXT';
    else if (line.startsWith('#EFFECT')) section = 'EFFECT';
    else if (line.startsWith('#GRID')) section = 'GRID';
    if (line.startsWith('#')) continue;
    const f = line.split('|');
    const name = f[0]!;
    if (section === 'Primitives' || section === 'Semantic' || section === 'Status') {
      const map = section === 'Primitives' ? src.primitives : section === 'Semantic' ? src.semantic : src.status;
      map.set(name, { light: f[1]!, dark: f[2]! });
    } else if (section === 'Dimensions') src.dimensions.set(name, Number(f[1]));
    else if (section === 'TEXT') {
      const family = ['JetBrains Mono', 'Cairo', 'Almarai'].find((fam) => f[1]!.startsWith(`${fam} `));
      if (!family) throw new Error(`unknown family in ${f[1]}`);
      src.textStyles.set(name, { family, style: f[1]!.slice(family.length + 1), size: Number(f[2]), lineHeight: Number(f[3]) });
    } else if (section === 'EFFECT') {
      src.shadow.push({ x: Number(f[1]), y: Number(f[2]), blur: Number(f[3]), spread: Number(f[4]), color: f[5]! });
    }
  }
  return src;
}

/** The resolved colour of a variable in one mode, following aliases inside the same mode (D-DES1-06). */
export function resolve(src: DesignSource, name: string, mode: Mode): string {
  const entry = src.primitives.get(name) ?? src.semantic.get(name) ?? src.status.get(name);
  if (!entry) throw new Error(`unknown variable ${name}`);
  const value = entry[mode];
  return value.startsWith('@') ? resolve(src, value.slice(1), mode) : value.toLowerCase();
}

/** Figma's WEB code syntax: var(--<name with dashes>) (D-DES1-05). */
export const cssName = (name: string) => `--${name.replace(/\//g, '-')}`;

const WEIGHTS: Record<string, number> = { Regular: 400, SemiBold: 600, Bold: 700, ExtraBold: 800 };

/** Production font stacks. Figma's mono style uses JetBrains Mono as a stand-in only (D-DES1-04, D-DES1-09). */
export const FONT_STACKS: Record<string, string> = {
  Cairo: "'Cairo', sans-serif",
  Almarai: "'Almarai', sans-serif",
  'JetBrains Mono': "'SF Mono', SFMono-Regular, Menlo, 'Almarai', monospace",
};

/** Motion (D-DES1-08, D-DES2-11): documented in Figma frame 56:2, not variables. */
export const MOTION = { fast: 120, base: 160, slow: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)', spin: 1000 };

function colourBlock(src: DesignSource, mode: Mode, indent: string): string {
  const out: string[] = [];
  out.push(`${indent}color-scheme: ${mode};`);
  for (const [group, map] of [['Primitives', src.primitives], ['Semantic', src.semantic], ['Status', src.status]] as const) {
    out.push(`${indent}/* ${group} */`);
    for (const [name, entry] of map) {
      const alias = entry[mode].startsWith('@') ? ` /* ${entry[mode].slice(1)} */` : '';
      out.push(`${indent}${cssName(name)}: ${resolve(src, name, mode)};${alias}`);
    }
  }
  return out.join('\n');
}

export function tokensCss(src: DesignSource): string {
  const dims = [...src.dimensions].map(([n, v]) => `  ${cssName(n)}: ${v}px;`).join('\n');
  const type = [...src.textStyles]
    .map(([n, s]) => {
      const weight = WEIGHTS[s.style.replace(/\s/g, '')];
      if (!weight) throw new Error(`unknown weight ${s.style}`);
      const stack = FONT_STACKS[s.family];
      if (!stack) throw new Error(`unknown family ${s.family}`);
      return `  --type-${n.replace(/\//g, '-')}: ${weight} ${s.size}px/${s.lineHeight}px ${stack};`;
    })
    .join('\n');
  const shadow = src.shadow.map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`).join(', ');
  return `/* GENERATED by apps/desktop/test/design/generate.ts from design/figma/variables.txt (Figma file
   UXkPakdqRuHDVTs78DO4uC, DES-1). Do not edit: change Figma (through its design phase), re-dump, regenerate.
   Colours are written resolved in every mode block, because a custom property that aliases another one is
   computed where it is declared: a subtree that switches theme must redeclare all of them (D-DES1-06). */

:root {
  /* Dimensions (one mode) */
${dims}
  /* Text styles, as font shorthands: font: var(--type-label) */
${type}
  /* Effect style shadow/overlay */
  --shadow-overlay: ${shadow};
  /* Motion (D-DES1-08, D-DES2-11); zero under reduced motion */
  --motion-fast: ${MOTION.fast}ms;
  --motion-base: ${MOTION.base}ms;
  --motion-slow: ${MOTION.slow}ms;
  --motion-easing: ${MOTION.easing};
  --motion-spin: ${MOTION.spin}ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms;
    --motion-base: 0ms;
    --motion-slow: 0ms;
  }
}

:root,
[data-theme='light'] {
${colourBlock(src, 'light', '  ')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${colourBlock(src, 'dark', '    ')}
  }
}

[data-theme='dark'] {
${colourBlock(src, 'dark', '  ')}
}
`;
}

// ---------- icons ----------

/** Lucide icons the approved design uses (Figma 97:4, 68:4, 68:182, 68:196), pinned to lucide-static 1.48.0. */
export const LUCIDE_ICONS = [
  // Components page, C-icons (97:4)
  'arrow-down-to-line', 'arrow-up-down', 'check', 'chevron-down', 'chevron-up', 'chevrons-up-down', 'code', 'columns-2',
  'ellipsis', 'external-link', 'eye', 'file-check', 'file-pen-line', 'file-text', 'folder-open', 'gauge', 'globe',
  'grip-vertical', 'hammer', 'hand', 'history', 'image-off', 'image', 'info', 'layers', 'layout-dashboard', 'list-filter',
  'list-todo', 'lock', 'minus', 'palette', 'panel-left', 'panel-right', 'play', 'plus', 'puzzle', 'redo-2', 'scale',
  'scan-search', 'scissors', 'shield', 'sliders-horizontal', 'sparkles', 'square-split-horizontal', 'triangle-alert',
  'undo-2', 'user', 'workflow', 'x',
  // Icons page: tag icons (68:4)
  'message-square', 'laptop', 'clock', 'ban', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'clipboard-list',
  'clipboard-copy', 'check-check', 'archive', 'shield-question', 'shield-check', 'user-search', 'user-check', 'user-x',
  'file-diff', 'package-check', 'package-x', 'flask-conical-off', 'list-checks', 'circle-alert',
  // verdict icons (68:182, D-DES2-03)
  'badge-check', 'badge-minus', 'octagon-x',
  // general examples (68:196)
  'search', 'settings', 'folder', 'copy', 'chevron-left', 'chevron-right',
] as const;

/** Names the design uses that lucide-static 1.48.0 ships under their newer file names (its own export aliases). */
export const LUCIDE_ALIASES: Record<string, string> = { history: 'rotate-ccw-clock', 'shield-question': 'shield-question-mark' };

export const STATUS_SYMBOLS = [
  'passed', 'failed', 'warning', 'needs-review', 'flaky', 'missing', 'unavailable', 'timed-out', 'cancelled',
  'interrupted', 'skipped', 'not-applicable', 'queued', 'running', 'cancelling', 'running-static', 'cancelling-static',
] as const;

type IconNode = [string, Record<string, string>];

function parseSvgChildren(svg: string): IconNode[] {
  const nodes: IconNode[] = [];
  for (const m of svg.matchAll(/<(\w+)\s([^>]*?)\/>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[2]!.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
    nodes.push([m[1]!, attrs]);
  }
  return nodes;
}

export function iconsModule(): string {
  const require = createRequire(import.meta.url);
  const lucide = require('lucide-static/icon-nodes.json') as Record<string, IconNode[]>;
  const lucideVersion = (require('lucide-static/package.json') as { version: string }).version;
  const lucideOut: Record<string, IconNode[]> = {};
  for (const name of [...LUCIDE_ICONS].sort()) {
    const nodes = lucide[LUCIDE_ALIASES[name] ?? name];
    if (!nodes) throw new Error(`lucide-static has no icon ${name}`);
    lucideOut[name] = nodes;
  }
  const status: Record<string, Record<string, IconNode[]>> = {};
  for (const size of ['12', '16', '20']) {
    const json = JSON.parse(readFileSync(`${FIGMA_DIR}status-symbols-${size}.json`, 'utf8')) as Record<string, string>;
    status[size] = {};
    for (const name of STATUS_SYMBOLS) {
      const svg = json[name];
      if (!svg) throw new Error(`status symbol ${name} ${size} missing`);
      status[size][name] = parseSvgChildren(svg);
    }
  }
  return `// GENERATED by apps/desktop/test/design/generate.ts. Do not edit.
// Lucide ${lucideVersion} (ISC, A-12, D-DES2-03): the icons the approved design uses, as element lists.
// Status symbols (D-DES2-01): exported from Figma 67:394 (Icons page), colour replaced by currentColor.
export type IconNode = readonly [string, Readonly<Record<string, string>>];

export const LUCIDE = ${JSON.stringify(lucideOut)} as const satisfies Record<string, readonly IconNode[]>;

export type LucideName = keyof typeof LUCIDE;

export const STATUS_SYMBOL_NODES = ${JSON.stringify(status)} as const satisfies Record<'12' | '16' | '20', Record<string, readonly IconNode[]>>;
`;
}
