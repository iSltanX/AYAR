// Q-04 in the app configuration, and the 15.2 fuses (D-53: cookie encryption off). The packaged app itself
// is checked in DEV-13 (AT-30 on the release package, D-51).
import { FuseV1Options } from '@electron/fuses';
import { describe, expect, it } from 'vitest';
import config, { BUNDLE_ID } from '../forge.config.js';

type Plugin = { name: string; fusesConfig: Record<number, boolean> };

describe('packaging configuration', () => {
  it('uses the bundle id the owner fixed (Q-04) for the app and its helpers', () => {
    expect(BUNDLE_ID).toBe('com.bysltan.ayar');
    expect(config.packagerConfig).toMatchObject({ appBundleId: 'com.bysltan.ayar', helperBundleId: 'com.bysltan.ayar.helper', arch: 'arm64', asar: true });
    expect(config.packagerConfig.extendInfo).toEqual({ LSMinimumSystemVersion: '13.0' });
  });

  it('locks the fuses of 15.2', () => {
    const fuses = (config.plugins as Plugin[]).find((p) => p.name === 'fuses')!.fusesConfig;
    expect(fuses[FuseV1Options.RunAsNode]).toBe(false);
    expect(fuses[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(false);
    expect(fuses[FuseV1Options.EnableNodeCliInspectArguments]).toBe(false);
    expect(fuses[FuseV1Options.GrantFileProtocolExtraPrivileges]).toBe(false);
    expect(fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(true);
    expect(fuses[FuseV1Options.OnlyLoadAppFromAsar]).toBe(true);
    expect(fuses[FuseV1Options.EnableCookieEncryption]).toBe(false);
  });

  it('signs with entitlements allow-jit and disable-library-validation only (D-50)', () => {
    const sign = config.packagerConfig.osxSign as { optionsForFile: (p: string) => { entitlements?: string[]; hardenedRuntime: boolean } };
    expect(sign.optionsForFile('/x/AYAR.app')).toEqual({ hardenedRuntime: true, entitlements: ['com.apple.security.cs.allow-jit', 'com.apple.security.cs.disable-library-validation'] });
    expect(sign.optionsForFile('/x/AYAR Helper (Renderer).app').entitlements).toHaveLength(2);
  });

  it('packages only the bundled dist/ and package.json', () => {
    const ignore = config.packagerConfig.ignore as (p: string) => boolean;
    expect(['', '/package.json', '/dist', '/dist/main/entry.js'].map(ignore)).toEqual([false, false, false, false]);
    expect(['/src', '/src/main/app.ts', '/test', '/node_modules', '/forge.config.js', '/distx'].map(ignore)).toEqual([true, true, true, true, true, true]);
  });
});
