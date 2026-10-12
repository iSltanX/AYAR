#!/usr/bin/env node
// The app icon's 1024 px PNGs (apps/desktop/icon/AppIcon-<light|dark>-1024.png): the composition the owner approved in
// DEV-13 (D-DEV13-10, 2026-10-12), flat, the same in both appearances: Apple's squircle tile (824 of 1024, radius 185)
// in the symbol's black, a round ivory nest hole the woodpecker looks out of (the approved Figma symbol beside this
// script, D-48, unchanged: black body, red crest, the ع aperture and the eye showing the ivory through), its crest
// rising over the top of the hole, its beak just inside the rim, and its body resting on the lower rim, which hides
// what is below it. No gradient, sheen or shadow. The margins stay transparent: an export flattened on a background
// gave macOS 26's icon mask a rim around the tile (D-DEV13-07), and the Dock draws its own shadow.
//   node tools/packaging/render-appicon.mjs [apps/desktop/icon]
// Needs the probe's pinned Chromium in Playwright's cache (as the e2e tests do).
import { createRequire } from 'node:module';
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright-core');
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const BROWSER = join(homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const dir = process.argv[2] ?? new URL('../../apps/desktop/icon/', import.meta.url).pathname;
// The symbol's colours (AYAR-Symbol-light.svg: #141B20 body, #A33D2F crest; the dark symbol's ivory #F7F4EC).
const TILE = '#141B20';
const HOLE = '#F7F4EC';
// The tile, as Apple's template lays it out at 440 (D-48), scaled to 1024.
const k = 1024 / 440;
const tile = `left:${42.96875 * k}px;top:${42.96875 * k}px;width:${354.0625 * k}px;height:${354.0625 * k}px;border-radius:${79.4921875 * k}px;`;
// The hole and the glyph, in 1024 px: the hole 600 wide (73% of the tile), its centre a little below the tile's; the
// glyph's 320-unit box at 680 px, placed so the beak's tip stays 16 px inside the rim and the crest rises over it.
const hole = { cx: 512, cy: 545, r: 300 };
const glyph = { left: 134, top: 250, size: 680 };
// What is below the rim's lower arc and outside the hole is hidden (the bird stands behind the lower rim); above that
// line the bird may lean out over the tile (the crest).
const mid = hole.cy + 70;
const dy = mid - hole.cy;
const hw = Math.sqrt(hole.r * hole.r - dy * dy);
const clip = `clip-path:path('M0 0H1024V${mid}H${hole.cx + hw}A${hole.r} ${hole.r} 0 0 1 ${hole.cx - hw} ${mid}H0Z')`;
const html = (svg) => `<!doctype html><html><head><style>
html,body{margin:0;background:transparent}
.frame{position:relative;width:1024px;height:1024px}
.tile{position:absolute;${tile}background:${TILE}}
.hole{position:absolute;left:${hole.cx - hole.r}px;top:${hole.cy - hole.r}px;width:${2 * hole.r}px;height:${2 * hole.r}px;border-radius:50%;background:${HOLE}}
.bird{position:absolute;left:0;top:0;width:1024px;height:1024px;${clip}}
.bird svg{position:absolute;left:${glyph.left}px;top:${glyph.top}px;width:${glyph.size}px;height:${glyph.size}px;display:block}
</style></head><body><div class="frame"><div class="tile"></div><div class="hole"></div><div class="bird">${svg}</div></div></body></html>`;
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(html(readFileSync(join(dir, 'AYAR-Symbol-light.svg'), 'utf8')));
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  for (const name of ['light', 'dark']) writeFileSync(join(dir, `AppIcon-${name}-1024.png`), png);
} finally {
  await browser.close();
}
console.log('rendered');
