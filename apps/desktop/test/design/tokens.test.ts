// DEV-10 task 1: the tokens in code are the approved Figma variables. The committed generated files equal what
// the generator makes from the Figma dump, and the dump equals the values DES-1 derived and checked
// (docs/design/DES-1/tokens.json, alternative A).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ICONS_TS, MODES, TOKENS_CSS, cssName, iconsModule, readDesignSource, resolve, tokensCss } from './design-source.ts';
import { tokensFromCss } from './colour.ts';

const des1 = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../docs/design/DES-1/tokens.json', import.meta.url)), 'utf8')) as {
  crest: string;
  alternatives: { A: Record<'primitives' | 'semantic' | 'status', Record<'light' | 'dark', Record<string, string>>> };
};
const src = readDesignSource();

describe('design tokens (task 1)', () => {
  it('has the four Figma collections with the approved counts (46 + 13 + 76 + 12)', () => {
    expect([src.primitives.size, src.semantic.size, src.status.size, src.dimensions.size]).toEqual([46, 13, 76, 12]);
    expect(src.textStyles.size).toBe(11);
  });

  it('matches the values DES-1 derived and checked, in both modes', () => {
    const A = des1.alternatives.A;
    for (const mode of MODES) {
      for (const group of ['primitives', 'semantic', 'status'] as const) {
        for (const [name, value] of Object.entries(A[group][mode])) {
          if (name === 'overlay') continue; // tokens.json keeps overlay pre-composited; Figma holds the RGBA (D-DES1-06)
          expect(resolve(src, name, mode), `${mode} ${name}`).toBe(value.toLowerCase());
        }
      }
    }
    expect(src.semantic.get('overlay')).toEqual({ light: '#141b2052', dark: '#0b111699' });
  });

  it('keeps the generated tokens.css and icons in step with the Figma dump', () => {
    expect(readFileSync(TOKENS_CSS, 'utf8')).toBe(tokensCss(src));
    expect(readFileSync(ICONS_TS, 'utf8')).toBe(iconsModule());
  });

  it('writes every colour variable, resolved, in the light and dark blocks', () => {
    for (const mode of MODES) {
      const css = tokensFromCss(mode);
      for (const name of [...src.primitives.keys(), ...src.semantic.keys(), ...src.status.keys()]) {
        expect(css.get(cssName(name)), `${mode} ${name}`).toBe(resolve(src, name, mode));
      }
    }
  });

  it('keeps the crest colour out of every UI variable (D-49)', () => {
    const crest = des1.crest.toLowerCase();
    for (const mode of MODES) for (const v of tokensFromCss(mode).values()) expect(v.toLowerCase()).not.toContain(crest);
  });
});
