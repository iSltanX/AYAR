#!/usr/bin/env node
// The app icon's 1024 px PNGs (apps/desktop/icon/AppIcon-<light|dark>-1024.png) from the approved Figma frames (D-48:
// 30:1445 light and 30:1439 dark), rendered layer by layer as Figma lists them, at 1024/440: the Squircle (Apple's
// template, 824 of 1024, radius 185, vertical gradient), the Sheen, and the Glyph (the symbol's SVG beside them). The
// margins stay transparent: an export flattened on white gave macOS 26's icon mask a white rim around the tile
// (D-DEV13-07), and the frame's drop shadow is left out because the tile is the icon and the Dock draws its own.
//   node tools/packaging/render-appicon.mjs [apps/desktop/icon]
// Needs the probe's pinned Chromium in Playwright's cache (as the e2e tests do).
import { createRequire } from 'node:module';
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright-core');
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const BROWSER = join(homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const dir = process.argv[2] ?? new URL('../../apps/desktop/icon/', import.meta.url).pathname;
const variants = {
  light: { from: '#fbf8f1', to: '#e9e3d7', sheen: 'rgba(255,255,255,0.55)', glyph: 'AYAR-Symbol-light.svg' },
  dark: { from: '#232b31', to: '#0f1418', sheen: 'rgba(255,255,255,0.1)', glyph: 'AYAR-Symbol-dark.svg' },
};
const k = 1024 / 440;
const html = (v, shadow) => `<!doctype html><html><head><style>
html,body{margin:0;background:transparent}
.frame{position:relative;width:1024px;height:1024px}
.squircle{position:absolute;left:${42.96875 * k}px;top:${42.96875 * k}px;width:${354.0625 * k}px;height:${354.0625 * k}px;border-radius:${79.4921875 * k}px;background:linear-gradient(to bottom,${v.from},${v.to});${shadow ? `box-shadow:0 ${5.15625 * k}px ${10.3125 * k}px 0 rgba(0,0,0,0.24);` : ''}}
.sheen{position:absolute;left:${42.96875 * k}px;top:${42.96875 * k}px;width:${354.0625 * k}px;height:${354.0625 * k}px;border-radius:${79.4921875 * k}px;background:linear-gradient(to bottom,${v.sheen} 0%,rgba(255,255,255,0) 50%)}
.glyph{position:absolute;left:${85.9375 * k}px;top:${84.21875 * k}px;width:${275 * k}px;height:${275 * k}px}
.glyph svg{width:100%;height:100%;display:block}
</style></head><body><div class="frame"><div class="squircle"></div><div class="sheen"></div><div class="glyph">${readFileSync(join(dir, v.glyph), 'utf8')}</div></div></body></html>`;
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  for (const [name, v] of Object.entries(variants)) {
    await page.setContent(html(v, false));
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
    writeFileSync(join(dir, `AppIcon-${name}-1024.png`), png);
  }
} finally {
  await browser.close();
}
console.log('rendered');
