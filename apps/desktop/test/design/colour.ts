// WCAG 2.x relative luminance and contrast ratio, and reading the generated tokens.css per mode.
import { readFileSync } from 'node:fs';
import { TOKENS_CSS, type Mode } from './design-source.ts';

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16) / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** The custom properties of the light block (`:root, [data-theme='light']`) or the dark one (`[data-theme='dark']`). */
export function tokensFromCss(mode: Mode, css = readFileSync(TOKENS_CSS, 'utf8')): Map<string, string> {
  const selector = mode === 'light' ? ":root,\n[data-theme='light'] {" : "\n[data-theme='dark'] {";
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${mode} block in tokens.css`);
  const body = css.slice(start + selector.length, css.indexOf('\n}', start + selector.length));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}
