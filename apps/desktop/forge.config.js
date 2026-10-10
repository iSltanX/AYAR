// Electron Forge configuration (E-01: Forge 8.0.1, Electron 44.7.0). DEV-3 builds a development package at
// most; the release package, its signature and the acceptance on it belong to DEV-13.
//   Bundle id (Q-04, owner 2026-10-10): com.bysltan.ayar; helpers and experiments live under com.bysltan.ayar.*.
//   Signing (E-04, D-50, D-53): always through osxSign, hardened runtime, the self-signed identity
//   "AYAR Local Code Signing", entitlements allow-jit and disable-library-validation only.
//   AYAR_SIGN_IDENTITY overrides the identity (for example "-" for an ad-hoc development check).
//   Fuses (15.2, D-53): RunAsNode, NODE_OPTIONS, inspect arguments and file-protocol privileges off; asar
//   integrity and asar-only on; cookie encryption off.
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

export const BUNDLE_ID = 'com.bysltan.ayar';
const identity = process.env.AYAR_SIGN_IDENTITY ?? 'AYAR Local Code Signing';

// Everything the app runs is bundled in dist/; nothing else enters the package.
const keep = (p) => p === '' || p === '/package.json' || p === '/dist' || p.startsWith('/dist/');

export default {
  packagerConfig: {
    name: 'AYAR',
    executableName: 'AYAR',
    appBundleId: BUNDLE_ID,
    helperBundleId: `${BUNDLE_ID}.helper`,
    appCategoryType: 'public.app-category.developer-tools',
    asar: true,
    arch: 'arm64',
    platform: 'darwin',
    darwinDarkModeSupport: true,
    extendInfo: { LSMinimumSystemVersion: '13.0' },
    ignore: (p) => !keep(p),
    osxSign: {
      identity,
      identityValidation: false,
      optionsForFile: (filePath) => {
        if (!filePath.endsWith('.app')) return { hardenedRuntime: true };
        const entitlements = filePath.includes('(Plugin).app')
          ? ['com.apple.security.cs.allow-jit', 'com.apple.security.cs.allow-unsigned-executable-memory', 'com.apple.security.cs.disable-library-validation']
          : ['com.apple.security.cs.allow-jit', 'com.apple.security.cs.disable-library-validation'];
        return { hardenedRuntime: true, entitlements };
      },
    },
  },
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};
