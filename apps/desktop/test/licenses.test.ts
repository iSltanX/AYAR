// Plan 25 (DEV-13): the licences of the fonts and libraries AYAR ships are inside the app. The generated module is
// what the settings' «حول» shows; it must match the installed packages (docs/dependencies.md §1) and carry a real
// licence text for every entry, the fonts' OFL included.
import { describe, expect, it } from 'vitest';
import { SHIPPED_FONTS, SHIPPED_PACKAGES } from '../src/renderer/app/licenses.generated.ts';
import { collect, render, SHIPPED } from '../../../tools/packaging/licenses.ts';
import { readFileSync } from 'node:fs';

describe('shipped licences (plan 25)', () => {
  it('is generated from the installed packages and is current', () => {
    const generated = readFileSync(new URL('../src/renderer/app/licenses.generated.ts', import.meta.url), 'utf8');
    expect(generated).toBe(render(collect()));
  });

  it('covers every shipped package of docs/dependencies.md §1 and both fonts, each with its licence text', () => {
    expect(SHIPPED_PACKAGES.map((p) => p.name)).toEqual(SHIPPED.map((p) => p.name));
    for (const p of [...SHIPPED_PACKAGES, ...SHIPPED_FONTS]) {
      expect(p.license, p.name).toMatch(/^(MIT|ISC|BSD-3-Clause|Apache-2\.0|MPL-2\.0|OFL-1\.1)$/);
      expect(p.text.length, p.name).toBeGreaterThan(200);
    }
    expect(SHIPPED_FONTS.map((f) => f.name)).toEqual(['Cairo', 'Almarai']);
    // The registry's versions (docs/dependencies.md §1, 2026-10-11): a bump there is a deliberate change here too.
    const versions = Object.fromEntries(SHIPPED_PACKAGES.map((p) => [p.name, p.version]));
    expect(versions).toMatchObject({ electron: '44.7.0', zod: '4.6.5', svelte: '5.57.2', ignore: '7.0.12', 'playwright-core': '1.64.0', 'axe-core': '4.14.0', pixelmatch: '7.2.0' });
  });
});
