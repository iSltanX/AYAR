// Static rules over the renderer sources (DEV-10 gate):
//   D-16 / D-49: green and red only through status.css, and only for passed/pure and failed/blocked; no colour
//   literal in a component; the crest colour nowhere in the UI.
//   15.2 (CSP): no style attribute, no style: directive, no {@html} (C-03: no HTML from data), no inline <style>
//   in HTML entries.
//   C-24: no hard-coded text in components (Arabic letters, or English words in markup text).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RENDERER } from './design-source.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(RENDERER).filter((f) => /\.(svelte|css|ts|html)$/.test(f));
const rel = (f: string) => relative(RENDERER, f);
const read = (f: string) => readFileSync(f, 'utf8');
const GENERATED = new Set(['design/tokens.css', 'design/icons.generated.ts']);
const sources = files.filter((f) => !GENERATED.has(rel(f)));

/** The template of a Svelte file: without <script>, <style> and comments. */
function template(svelte: string): string {
  return svelte
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}
function styles(svelte: string): string {
  return [...svelte.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
}
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** A template with every {…} expression (nested braces and string literals included) replaced by a space. */
function withoutExpressions(tpl: string): string {
  let out = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < tpl.length; i++) {
    const c = tpl[i]!;
    if (depth === 0) {
      if (c === '{') depth = 1;
      else out += c;
      continue;
    }
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) out += ' ';
  }
  return out;
}

describe('semantic colour (D-16, D-49)', () => {
  it('names the green and red primitives nowhere outside the generated tokens', () => {
    const hits = sources.filter((f) => /--(green|red)-\d/.test(read(f))).map(rel);
    expect(hits).toEqual([]);
  });

  it('maps passed/pure to green and failed/blocked to red only in design/status.css, and nothing else to them', () => {
    const allowed = new Set(['design/status.css']);
    const pattern = /--(result-passed|result-failed|verdict-pure|verdict-blocked)-/;
    expect(sources.filter((f) => pattern.test(read(f)) && !allowed.has(rel(f))).map(rel)).toEqual([]);
    const status = read(join(RENDERER, 'design/status.css'));
    for (const m of status.matchAll(/^\.status-([\w-]+) \{([^}]*)\}/gm)) {
      const [cls, body] = [m[1]!, m[2]!];
      const families = new Set([...body.matchAll(/var\(--(result|cycle|verdict|tag)-([\w-]+?)-(fg|bg|border|icon)\)/g)].map((v) => `${v[1]}-${v[2]}`));
      expect(families.size, cls).toBe(1);
      const family = [...families][0]!;
      expect(family.endsWith(cls), `${cls} reads ${family}`).toBe(true);
    }
  });

  it('applies no status class literally: status-passed/failed/pure/blocked come only from a typed status', () => {
    const svelte = sources.filter((f) => f.endsWith('.svelte'));
    expect(svelte.filter((f) => /status-(passed|failed|pure|blocked)\b/.test(read(f))).map(rel)).toEqual([]);
  });

  it('writes no colour literal in component styles (every colour is a variable)', () => {
    const offenders: string[] = [];
    for (const f of sources) {
      const css = stripCssComments(f.endsWith('.svelte') ? styles(read(f)) : f.endsWith('.css') ? read(f) : '');
      if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/.test(css)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });

  it('never uses the crest colour #A33D2F in the UI', () => {
    expect(files.filter((f) => /a33d2f/i.test(read(f))).map(rel)).toEqual([]);
  });
});

describe('CSP and safe rendering (15.2, C-03)', () => {
  it('has no style attribute, style: directive or {@html} in any Svelte file', () => {
    const offenders: string[] = [];
    for (const f of sources.filter((x) => x.endsWith('.svelte'))) {
      const tpl = template(read(f));
      if (/\sstyle\s*=|\sstyle:[\w-]+|\{@html\b/.test(tpl)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });

  it('writes no inline style, HTML or code from strings in scripts (CSSOM setProperty only)', () => {
    const forbidden = [
      /setAttribute\(\s*['"]style['"]/,
      /\.cssText\b/,
      /\.(inner|outer)HTML\b/,
      /insertAdjacentHTML/,
      /document\.write/,
      /\beval\s*\(/,
      /new\s+Function\b/,
      /createContextualFragment/,
    ];
    const offenders: string[] = [];
    for (const f of sources.filter((x) => /\.(svelte|ts)$/.test(x))) {
      const text = f.endsWith('.svelte') ? [...read(f).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n') + template(read(f)) : read(f);
      for (const re of forbidden) if (re.test(text)) offenders.push(`${rel(f)}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });

  it('has no inline <style> or inline script in the HTML entries', () => {
    for (const f of sources.filter((x) => x.endsWith('.html'))) {
      const html = read(f);
      expect(html, rel(f)).not.toMatch(/<style|\sstyle=/);
      for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        expect(m[1], rel(f)).toMatch(/\ssrc=/);
        expect(m[2]!.trim(), rel(f)).toBe('');
      }
    }
  });
});

describe('no hard-coded text in components and screens (C-24)', () => {
  // DEV-11: the screens follow the components' rule — every visible string comes from a message key.
  const components = sources.filter((f) => (rel(f).startsWith('components/') || rel(f).startsWith('screens/') || rel(f) === 'App.svelte') && f.endsWith('.svelte'));

  it('writes no Arabic letters in component templates', () => {
    expect(components.filter((f) => /[؀-ۿ]/.test(template(read(f)))).map(rel)).toEqual([]);
  });

  it('writes no English words as markup text or literal labels in component templates', () => {
    const offenders: string[] = [];
    for (const f of components) {
      const tpl = withoutExpressions(template(read(f)));
      // Text between tags, with expressions and block tags removed: ">Copy {x}<" still counts as "Copy".
      for (const m of tpl.matchAll(/>([^<>]*)</g)) {
        const text = m[1]!.replace(/&#?\w+;/g, ' ');
        if (/[A-Za-z]{2,}/.test(text)) offenders.push(`${rel(f)}: ${text.trim()}`);
      }
      // User-visible attributes written as literals.
      for (const m of tpl.matchAll(/\s(aria-label|aria-description|aria-valuetext|aria-roledescription|title|placeholder|alt)="([^"{]*)"/g)) {
        if (/[A-Za-z\u0600-\u06FF]{2,}/.test(m[2]!)) offenders.push(`${rel(f)}: ${m[1]}="${m[2]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('finds the component files it checks', () => {
    expect(components.length).toBeGreaterThan(5);
  });
});
