// D-DEV7-05: the source line behind what a rendered page showed. The probe sees the page; the finding names the
// project's file and line where the value, the text or the code came from — found by reading the project's sources,
// never by guessing: a colour's literal (the tokens reference first, then the style sheets), a length in the property
// that sets it, a text's literal, the string literal next to the place a script threw, the manifest line Chromium
// named. When nothing matches, or more than one place matches equally, the finding keeps the rendered state as its
// place and no file. The proof of a finding never rests on this: it rests on what was rendered.
import { colorLiterals, lengthLiterals, normalizeColor, styleSources, type AnalyzerInput } from '@ayar/analyzers';
import postcss from 'postcss';

export interface SourcePlace {
  path: string;
  line: number;
  /** The text found at that place (the finding's anchor). */
  text: string;
}

/** Folders that are a build's output or installed packages: never a source (the page loads from them). */
const NOT_SOURCE = /(^|\/)(node_modules|dist|build|out|\.next|\.svelte-kit|\.output|coverage|storybook-static|\.git)\//;
const STYLE = /\.(css|scss|pcss|html?|svelte|vue|astro)$/i;
const TEXT = /\.(js|mjs|cjs|jsx|ts|tsx|json|html?|svelte|vue|astro|md|ya?ml|properties|po|strings|xml)$/i;

export interface Declaration {
  file: string;
  line: number;
  prop: string;
  value: string;
}

export class Sources {
  readonly #i: AnalyzerInput;
  #decls: Declaration[] | null = null;
  readonly #exclude: (p: string) => boolean;

  /** `exclude`: a folder the page was served from that is a build output (an extension's dist), beside the usual ones. */
  constructor(i: AnalyzerInput, exclude: readonly string[] = []) {
    this.#i = i;
    const ex = exclude.filter((d) => d && d !== '.').map((d) => d.replace(/\/+$/, ''));
    this.#exclude = (p) => NOT_SOURCE.test(`/${p}`) || ex.some((d) => p === d || p.startsWith(`${d}/`));
  }

  #files(re: RegExp): string[] {
    return this.#i.files.filter((f) => re.test(f) && !this.#exclude(f));
  }

  /** The declarations of every style source (CSS, SCSS, and the <style> blocks of pages and components). */
  declarations(): Declaration[] {
    if (this.#decls) return this.#decls;
    const out: Declaration[] = [];
    for (const file of this.#files(STYLE)) {
      const text = this.#i.read(file);
      if (text === null) continue;
      for (const s of styleSources(file, text)) {
        try {
          postcss.parse(s.css).walkDecls((d) => {
            out.push({ file, line: s.line - 1 + (d.source?.start?.line ?? 1), prop: d.prop.toLowerCase(), value: d.value });
          });
        } catch {
          /* an unparsable sheet gives no place */
        }
      }
    }
    return (this.#decls = out);
  }

  /** The first line of a file that contains a text, or matches a pattern. */
  #lineIn(file: string, needle: string | RegExp): SourcePlace | null {
    const text = this.#i.read(file);
    if (text === null) return null;
    for (const [k, l] of text.split('\n').entries()) if (typeof needle === 'string' ? l.includes(needle) : needle.test(l)) return { path: file, line: k + 1, text: l.trim().slice(0, 300) };
    return null;
  }

  /**
   * A colour's source: its literal in the tokens reference's files (the design's source of truth), else the first
   * declaration of a colour property whose literal is that colour, else a custom property that defines it.
   */
  color(hex: string, tokenFiles: readonly string[] = [], propFamily?: RegExp): SourcePlace | null {
    const want = normalizeColor(hex);
    if (!want) return null;
    for (const f of tokenFiles) {
      for (const form of colorForms(want)) {
        const p = this.#lineIn(f, new RegExp(`${form}(?![0-9a-f])`, 'i'));
        if (p) return p;
      }
    }
    const decls = this.declarations();
    const match = (d: Declaration) => colorLiterals(d.value).some((l) => normalizeColor(l) === want);
    const direct = decls.find((d) => !d.prop.startsWith('--') && (!propFamily || propFamily.test(d.prop)) && match(d)) ?? decls.find((d) => !d.prop.startsWith('--') && match(d));
    const def = direct ?? decls.find((d) => d.prop.startsWith('--') && match(d));
    return def ? { path: def.file, line: def.line, text: `${def.prop}: ${def.value}`.slice(0, 300) } : null;
  }

  /** A length's source: the first declaration of a property of this family that writes this length. */
  length(propFamily: RegExp, px: number): SourcePlace | null {
    const d = this.declarations().find((x) => propFamily.test(x.prop) && lengthLiterals(x.value).some((l) => Math.abs(l.px - px) < 0.01));
    return d ? { path: d.file, line: d.line, text: `${d.prop}: ${d.value}`.slice(0, 300) } : null;
  }

  /** A text's source: the one file that holds it literally (in a string, a template or markup); null if none or many. */
  text(literal: string): SourcePlace | null {
    const t = literal.trim();
    if (t.length < 2) return null;
    const hits: SourcePlace[] = [];
    for (const f of this.#files(TEXT)) {
      const p = this.#lineIn(f, t);
      if (p) hits.push(p);
      if (hits.length > 3) break;
    }
    const code = hits.filter((h) => !/\.(md)$/i.test(h.path));
    return code.length === 1 ? code[0]! : code.length ? (code.find((h) => !/(^|\/)(test|tests|e2e|__tests__)\/|\.test\.|\.spec\./.test(h.path)) ?? null) : null;
  }

  /**
   * The source line of a script error: the string literals of the code around the place it threw, nearest first,
   * each looked for in the project's sources (outside the build); the first found in exactly one place.
   */
  near(code: string, at: number | null = null): SourcePlace | null {
    const middle = at ?? Math.floor(code.length / 2);
    const lits: { text: string; at: number }[] = [];
    for (const m of code.matchAll(/`([^`$\\]{3,120})`|'([^'\\]{3,120})'|"([^"\\]{3,120})"/g)) lits.push({ text: (m[1] ?? m[2] ?? m[3])!, at: m.index });
    lits.sort((a, b) => Math.abs(a.at - middle) - Math.abs(b.at - middle));
    for (const l of lits) {
      if (/^\.{0,2}\//.test(l.text) || /\.(js|css|mjs)$/.test(l.text)) continue; // an import path is no clue
      const hits: SourcePlace[] = [];
      for (const f of this.#files(/\.(js|mjs|cjs|jsx|ts|tsx|svelte|vue|html?)$/i)) {
        const p = this.#lineIn(f, l.text);
        if (p) hits.push(p);
        if (hits.length > 1) break;
      }
      if (hits.length === 1) return hits[0]!;
    }
    return null;
  }

  /** A line of a given file holding one of these texts (a manifest key's value Chromium named), in order. */
  lineOf(file: string, needles: readonly string[]): SourcePlace | null {
    for (const n of needles) {
      const p = this.#lineIn(file, n);
      if (p) return p;
    }
    return null;
  }
}

/** The ways a colour may be written in a source: `#aabbcc`, `#abc` when it has one. */
function colorForms(hex: string): string[] {
  const out = [hex];
  const m = /^#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$/.exec(hex);
  if (m) out.push(`#${m[1]}${m[2]}${m[3]}`);
  return out;
}
