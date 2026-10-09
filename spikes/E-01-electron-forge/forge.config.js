// DEV-0 spike harness. One packaged app shared by E-01, G-05, E-04, E-05 and E-23.
// Each experiment selects its build through environment variables (see README.md):
//   SPIKE_MODE        e01 (default) | e04 | e05 | e23  -> copies ../<dir>/mode/ into the app (inside asar)
//   SPIKE_BUNDLE_ID   default com.bysltan.ayar.spike (never the final id, see Q-04)
//   SPIKE_NAME        product name, default "AYAR Spike"
//   SPIKE_IDENTITY    codesign identity (SHA-1 or name). Unset -> ad-hoc signature reset by the fuses plugin.
//   SPIKE_BUILD_TAG   free text baked into build-info.json (E-04 uses it to make two different builds)
//   SPIKE_COOKIE_ENC  "1" to enable the EnableCookieEncryption fuse (E-04 only)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const here = path.dirname(fileURLToPath(import.meta.url));
const MODE_DIRS = {
  e04: '../E-04-signing-identity/mode',
  e05: '../E-05-privacy-scope/mode',
  e23: '../E-23-window-buttons/mode',
};

const mode = process.env.SPIKE_MODE || 'e01';
const bundleId = process.env.SPIKE_BUNDLE_ID || 'com.bysltan.ayar.spike';
const productName = process.env.SPIKE_NAME || 'AYAR Spike';
const identity = process.env.SPIKE_IDENTITY || '';
const buildTag = process.env.SPIKE_BUILD_TAG || '';

export default {
  packagerConfig: {
    name: productName,
    appBundleId: bundleId,
    asar: true,
    arch: 'arm64',
    ignore: [/^\/out($|\/)/, /^\/README\.md$/, /^\/results($|\/)/, /^\/tools($|\/)/],
    ...(identity
      ? {
          osxSign: {
            identity,
            identityValidation: false,
            // Every .app (main and helpers) gets minimal entitlements instead of osx-sign's darwin
            // default (camera, mic, location...). The plugin helper keeps its Chromium set.
            // SPIKE_DLV=1 adds disable-library-validation (needed without a Team ID, see README).
            optionsForFile: (filePath) => {
              if (!filePath.endsWith('.app')) return { hardenedRuntime: true };
              const dlv = process.env.SPIKE_DLV === '1' ? ['com.apple.security.cs.disable-library-validation'] : [];
              const entitlements = filePath.includes('(Plugin).app')
                ? ['com.apple.security.cs.allow-jit', 'com.apple.security.cs.allow-unsigned-executable-memory', 'com.apple.security.cs.disable-library-validation']
                : ['com.apple.security.cs.allow-jit', ...dlv];
              return { hardenedRuntime: true, entitlements };
            },
          },
        }
      : {}),
  },
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: process.env.SPIKE_COOKIE_ENC === '1',
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      const info = { mode, bundleId, productName, signed: identity ? 'identity' : 'ad-hoc', buildTag, builtAt: new Date().toISOString() };
      await fs.writeFile(path.join(buildPath, 'build-info.json'), JSON.stringify(info, null, 2));
      if (MODE_DIRS[mode]) {
        await fs.cp(path.resolve(here, MODE_DIRS[mode]), path.join(buildPath, 'mode'), { recursive: true });
      }
    },
  },
};
