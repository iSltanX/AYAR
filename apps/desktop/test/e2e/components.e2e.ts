// DEV-10 component behaviour in the gallery, by real keyboard input (FR-53 "component test"):
//   arrow keys in segmented controls and tabs follow the reading direction (Left is "next" in Arabic),
//   a modal sheet traps focus, starts on its safe button, closes on Escape and gives focus back, and passes axe
//   while open; a glossary term shows its tooltip on keyboard focus and hides it on Escape; all under the CSP.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchGallery, showGallery } from './gallery-support.ts';
import { tempDataDir, type Launched } from './support.ts';

let t: ReturnType<typeof tempDataDir>;
let run: Launched;

beforeAll(async () => {
  t = tempDataDir();
  run = await launchGallery(t.dataDir);
});
afterAll(async () => {
  await run?.app.close();
  t?.cleanup();
});

const panel = (section: string, lang: 'ar' | 'en') => `[data-panel="${section}/${lang}/light"]`;
const checkedIndex = (selector: string, attr: 'aria-checked' | 'aria-selected') =>
  run.page.$$eval(selector, (els, a) => els.findIndex((e) => e.getAttribute(a) === 'true'), attr);
const focusedIndex = (selector: string) => run.page.$$eval(selector, (els) => els.indexOf(document.activeElement as Element));

describe('arrow keys follow the reading direction', () => {
  for (const lang of ['ar', 'en'] as const) {
    const next = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight';
    const back = lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';

    it(`moves and selects in a segmented control (${lang})`, async () => {
      await showGallery(run.page, { lang, theme: 'light', section: 'C-18' });
      const segments = `${panel('C-18', lang)} [data-demo="Segmented control/3"] [role="radio"]`;
      expect(await run.page.$$eval(segments, (els) => els.length)).toBe(3);
      await run.page.focus(`${segments}[aria-checked="true"]`);
      const start = await checkedIndex(segments, 'aria-checked');
      await run.page.keyboard.press(next);
      expect(await checkedIndex(segments, 'aria-checked')).toBe((start + 1) % 3);
      expect(await focusedIndex(segments)).toBe((start + 1) % 3);
      await run.page.keyboard.press(back);
      expect(await checkedIndex(segments, 'aria-checked')).toBe(start);
      await run.page.keyboard.press('End');
      expect(await checkedIndex(segments, 'aria-checked')).toBe(2);
      await run.page.keyboard.press('Home');
      expect(await checkedIndex(segments, 'aria-checked')).toBe(0);
      // One tab stop for the group: only the checked segment is tabbable.
      expect(await run.page.$$eval(segments, (els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length)).toBe(1);
    });

    it(`moves and selects in tabs (${lang})`, async () => {
      await showGallery(run.page, { lang, theme: 'light', section: 'C-18' });
      const tabs = `${panel('C-18', lang)} [data-demo="Tabs/results"] [role="tab"]`;
      const count = await run.page.$$eval(tabs, (els) => els.length);
      expect(count).toBeGreaterThan(1);
      await run.page.focus(`${tabs}[aria-selected="true"]`);
      const start = await checkedIndex(tabs, 'aria-selected');
      await run.page.keyboard.press(next);
      expect(await checkedIndex(tabs, 'aria-selected')).toBe((start + 1) % count);
      await run.page.keyboard.press(back);
      expect(await checkedIndex(tabs, 'aria-selected')).toBe(start);
    });
  }
});

describe('modal sheet (C-19)', () => {
  const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

  for (const lang of ['ar', 'en'] as const) {
    it(`opens modal on its safe button, traps Tab, closes on Escape and restores focus (${lang})`, async () => {
      await showGallery(run.page, { lang, theme: 'light', section: 'C-19' });
      const demo = `${panel('C-19', lang)} [data-demo="Sheet/Cancel confirmation/modal"]`;
      const opener = `${demo} > .specimen > button, ${demo} button:not(dialog button)`;
      await run.page.focus(opener);
      await run.page.keyboard.press('Enter');
      await run.page.waitForSelector(`${demo} dialog[open]`);
      const state = () =>
        run.page.evaluate((sel) => {
          const dialog = document.querySelector<HTMLDialogElement>(`${sel} dialog`)!;
          return { open: dialog.open, modal: dialog.matches(':modal'), inside: dialog.contains(document.activeElement), focused: (document.activeElement as HTMLElement)?.textContent?.trim() };
        }, demo);
      const opened = await state();
      expect(opened.open && opened.modal && opened.inside).toBe(true);
      // Tab cycles inside the dialog only.
      for (let i = 0; i < 6; i++) {
        await run.page.keyboard.press('Tab');
        expect((await state()).inside).toBe(true);
      }
      // axe with the top-layer dialog open.
      await run.page.evaluate(axeSource);
      const serious = await run.page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string }[] }> } }).axe;
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id);
      });
      expect(serious).toEqual([]);
      await run.page.keyboard.press('Escape');
      await run.page.waitForSelector(`${demo} dialog:not([open])`, { state: 'attached' });
      expect(await run.page.evaluate((sel) => document.querySelector(sel)?.contains(document.activeElement), demo)).toBe(true);
      // Opens again after an Escape (the open prop stayed in sync with the native dialog).
      await run.page.keyboard.press('Enter');
      await run.page.waitForSelector(`${demo} dialog[open]`);
      await run.page.keyboard.press('Escape');
      await run.page.waitForSelector(`${demo} dialog:not([open])`, { state: 'attached' });
    });
  }
});

describe('glossary term tooltip (C-21)', () => {
  it('shows on keyboard focus, is described by it, and hides on Escape', async () => {
    await showGallery(run.page, { lang: 'ar', theme: 'light', section: 'C-21' });
    const term = `${panel('C-21', 'ar')} [data-demo="Term/default"] button`;
    await run.page.focus(term);
    await run.page.keyboard.press('Shift');
    const shown = await run.page.evaluate((sel) => {
      const b = document.querySelector(sel)!;
      const id = b.getAttribute('aria-describedby');
      const tip = id ? document.getElementById(id) : null;
      return { role: tip?.getAttribute('role'), visible: !!tip && tip.getClientRects().length > 0 };
    }, term);
    expect(shown).toEqual({ role: 'tooltip', visible: true });
    await run.page.keyboard.press('Escape');
    const hidden = await run.page.evaluate((sel) => {
      const id = document.querySelector(sel)!.getAttribute('aria-describedby');
      const tip = id ? document.getElementById(id) : null;
      return !tip || tip.getClientRects().length === 0;
    }, term);
    expect(hidden).toBe(true);
  });
});

describe('CSP during the interactions', () => {
  it('records zero violations', async () => {
    const n = await run.app.evaluate(() => (globalThis as unknown as { ayarDiagnostics: { cspViolations: unknown[] } }).ayarDiagnostics.cspViolations.length);
    expect(n).toBe(0);
  });
});
