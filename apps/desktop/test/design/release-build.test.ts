// The gallery is development-only (DEV-10, task 5): the release renderer build has a single entry, the
// packaging script always rebuilds first, and the release entry imports no gallery module.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RENDERER } from './design-source.ts';

describe('release build without the gallery', () => {
  it('builds one renderer entry unless AYAR_GALLERY=1', async () => {
    delete process.env.AYAR_GALLERY;
    const config = (await import('../../vite.renderer.config.ts')).default as { build: { rollupOptions: { input: Record<string, string> } } };
    expect(Object.keys(config.build.rollupOptions.input)).toEqual(['index']);
  });

  it('packages only after a fresh build, and the e2e tests build the gallery separately', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['package']).toMatch(/^npm run build && electron-forge package$/);
    // The release build clears an inherited AYAR_GALLERY, and the e2e run restores the release renderer
    // after its tests, whatever their outcome, so dist/ never keeps the gallery.
    expect(pkg.scripts['build']).toMatch(/^AYAR_GALLERY= vite build -c vite\.renderer\.config\.ts && /);
    expect(pkg.scripts['build']).not.toContain('AYAR_GALLERY=1');
    expect(pkg.scripts['build:gallery']).toContain('AYAR_GALLERY=1');
    expect(pkg.scripts['test:e2e']).toMatch(/status=\$\?; AYAR_GALLERY= vite build -c vite\.renderer\.config\.ts[^;]*; exit \$status\)$/);
  });

  it('keeps the app entry free of the gallery', () => {
    for (const f of ['index.html', 'main.ts', 'App.svelte']) expect(readFileSync(`${RENDERER}${f}`, 'utf8')).not.toMatch(/gallery/i);
  });
});
