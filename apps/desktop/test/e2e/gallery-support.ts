// Opening the development-only component gallery (DEV-10) in the development build: the app starts as usual
// and the main process is asked to load app://ayar/gallery/index.html into the same window, under the same
// protocol and CSP. A navigation from the main process is not a page navigation, so will-navigate is not in
// the way; the page itself still cannot navigate.
import type { ElectronApplication, Page } from 'playwright-core';
import { launch, type Launched } from './support.ts';

export const GALLERY_URL = 'app://ayar/gallery/index.html';

export async function openGallery(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(async ({ BrowserWindow }, url) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setSize(1600, 1000);
    await w.loadURL(url);
  }, GALLERY_URL);
  await page.waitForLoadState('load');
  await page.waitForSelector('[data-section]');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

export async function launchGallery(dataDir: string): Promise<Launched> {
  const run = await launch(dataDir);
  await openGallery(run.app, run.page);
  return run;
}

/** Sets the gallery toolbar: language, theme and section ("all" or a section id). */
export async function showGallery(page: Page, opts: { lang: 'ar' | 'en' | 'both'; theme: 'light' | 'dark' | 'both'; section?: string }): Promise<void> {
  await page.click(`[data-testid="lang-${opts.lang}"]`);
  await page.click(`[data-testid="theme-${opts.theme}"]`);
  await page.selectOption('[data-testid="section"]', opts.section ?? 'all');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
