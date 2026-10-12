#!/usr/bin/env node
// The app icon (D-48: the approved identity's AppIcon, exported from Figma at 1024 px, `apps/desktop/icon/`), as the
// .icns the packager embeds: an iconset of the ten standard sizes rendered with sips, then iconutil. Written to
// dist/icon/AppIcon.icns by the desktop build, so the package always carries the icon of the committed source.
//   node tools/packaging/make-icns.mjs [--source apps/desktop/icon/AppIcon-light-1024.png] [--out apps/desktop/dist/icon]
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const source = resolve(root, opt('source', 'apps/desktop/icon/AppIcon-light-1024.png'));
const out = resolve(root, opt('out', 'apps/desktop/dist/icon'));
if (!existsSync(source)) throw new Error(`icon source missing: ${source}`);
// Apple's template keeps the canvas outside the tile transparent; an opaque corner means the export was flattened on a
// background, and macOS 26's icon mask would show it as a rim around the tile (D-DEV13-07).
const corner = execFileSync('sips', ['-g', 'hasAlpha', source], { encoding: 'utf8' });
if (!/hasAlpha:\s*yes/.test(corner)) throw new Error(`icon source has no alpha channel (its margins must be transparent): ${source}`);
const set = mkdtempSync(join(tmpdir(), 'ayar-icon-'));
const iconset = join(set, 'AppIcon.iconset');
mkdirSync(iconset);
for (const [name, px] of [
  ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32], ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256], ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
]) execFileSync('sips', ['-z', String(px), String(px), source, '--out', join(iconset, name)], { stdio: 'ignore' });
copyFileSync(source, join(iconset, 'icon_512x512@2x.png'));
mkdirSync(out, { recursive: true });
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(out, 'AppIcon.icns')], { stdio: 'inherit' });
rmSync(set, { recursive: true, force: true });
console.log(`icon: ${join(out, 'AppIcon.icns')}`);
