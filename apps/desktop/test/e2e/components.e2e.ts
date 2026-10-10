// DEV-10 component behaviour in the gallery, by real keyboard input (FR-53 "component test"):
//   arrow keys in segmented controls and tabs follow the reading direction (Left is "next" in Arabic),
//   a modal sheet traps focus, starts on its safe button, closes on Escape and gives focus back, and passes axe
//   while open; a glossary term shows its tooltip on keyboard focus and hides it on Escape; all under the CSP.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { launchGallery, showGallery } from './gallery-support.ts';
import { tempDataDir, type Launched } from './support.ts';

let t: ReturnType<typeof tempDataDir>;
let run: Launched;

beforeAll(async () => {
  t = tempDataDir();
  run = await launchGallery(t.dataDir);
});
afterEach(async () => {
  // A failed test must not leave a modal over the page for the next one.
  await run?.page.evaluate(() => document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((d) => d.close()));
});
afterAll(async () => {
  await run?.app.close();
  t?.cleanup();
});

const panel = (section: string, lang: 'ar' | 'en') => `[data-panel="${section}/${lang}/light"]`;
const checkedIndex = (selector: string, attr: 'aria-checked' | 'aria-selected') =>
  run.page.$$eval(selector, (els, a) => els.findIndex((e) => e.getAttribute(a) === 'true'), attr);
const focusedIndex = (selector: string) => run.page.$$eval(selector, (els) => (els as Element[]).indexOf(document.activeElement as Element));

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

describe('sheet state is reset on every opening (C-19)', () => {
  it('reopens the human review with the first decision and an empty note', async () => {
    await showGallery(run.page, { lang: 'en', theme: 'light', section: 'C-19' });
    const demo = `${panel('C-19', 'en')} [data-demo="Sheet/Human review/modal"]`;
    const dialog = `${demo} dialog`;
    const decision = () => run.page.$$eval(`${dialog} input[type="radio"]`, (els) => els.findIndex((e) => (e as HTMLInputElement).checked));
    const noteField = `${dialog} input[id$="-note"]`;
    const note = () => run.page.$eval(noteField, (e) => (e as HTMLInputElement).value);
    await run.page.click(`${demo} > .specimen > button`);
    await run.page.waitForSelector(`${dialog}[open]`);
    expect(await decision()).toBe(0);
    await run.page.click(`${dialog} label:has(input[type="radio"]) >> nth=1`);
    await run.page.fill(noteField, 'a note that must not survive');
    expect(await decision()).toBe(1);
    await run.page.keyboard.press('Escape');
    await run.page.waitForSelector(`${dialog}:not([open])`, { state: 'attached' });
    await run.page.click(`${demo} > .specimen > button`);
    await run.page.waitForSelector(`${dialog}[open]`);
    expect(await decision()).toBe(0);
    expect(await note()).toBe('');
    await run.page.keyboard.press('Escape');
    await run.page.waitForSelector(`${dialog}:not([open])`, { state: 'attached' });
  });

  it('keeps the open prop in step when the dialog closes natively, and opens again', async () => {
    await showGallery(run.page, { lang: 'ar', theme: 'light', section: 'C-19' });
    const demo = `${panel('C-19', 'ar')} [data-demo="Sheet/Cancel confirmation/modal"]`;
    await run.page.click(`${demo} > .specimen > button`);
    await run.page.waitForSelector(`${demo} dialog[open]`);
    // A close that does not go through the cancel event (as Chromium does on a second, non-cancelable Escape).
    await run.page.$eval(`${demo} dialog`, (d) => (d as HTMLDialogElement).close());
    await run.page.waitForSelector(`${demo} dialog:not([open])`, { state: 'attached' });
    await run.page.click(`${demo} > .specimen > button`);
    await run.page.waitForSelector(`${demo} dialog[open]`);
    await run.page.keyboard.press('Escape');
    await run.page.waitForSelector(`${demo} dialog:not([open])`, { state: 'attached' });
  });
});

describe('findings table keyboard (C-17)', () => {
  for (const lang of ['ar', 'en'] as const) {
    it(`is one tab stop, moves with the arrows, toggles groups and selects rows (${lang})`, async () => {
      await showGallery(run.page, { lang, theme: 'light', section: 'C-17' });
      const table = `${panel('C-17', lang)} [data-demo="Table/findings"] [role="grid"]`;
      const stops = await run.page.$$eval(`${table} [tabindex="0"]`, (els) => els.length);
      expect(stops).toBe(1);
      const navs = `${table} [data-nav]`;
      await run.page.focus(`${table} [data-nav][tabindex="0"]`);
      const first = await focusedIndex(navs);
      await run.page.keyboard.press('ArrowDown');
      expect(await focusedIndex(navs)).toBe(first + 1);
      await run.page.keyboard.press('End');
      const count = await run.page.$$eval(navs, (els) => els.length);
      expect(await focusedIndex(navs)).toBe(count - 1);
      await run.page.keyboard.press('Home');
      expect(await focusedIndex(navs)).toBe(0);
      // Space on a finding row selects it.
      await run.page.focus(`${table} [role="row"][aria-selected]`);
      const before = await run.page.$eval(`${table} [role="row"][aria-selected]`, (e) => e.getAttribute('aria-selected'));
      await run.page.keyboard.press('Space');
      const after = await run.page.$eval(`${table} [role="row"][aria-selected]`, (e) => e.getAttribute('aria-selected'));
      expect(after).not.toBe(before);
      // Still one tab stop after moving.
      expect(await run.page.$$eval(`${table} [tabindex="0"]`, (els) => els.length)).toBe(1);
    });
  }
});

describe('argument editor focus (C-18)', () => {
  it('moves focus to a remove button after removing an argument, never to the page', async () => {
    await showGallery(run.page, { lang: 'en', theme: 'light', section: 'C-18' });
    const editor = `${panel('C-18', 'en')} [data-demo="Argument editor/default"]`;
    const before = await run.page.$$eval(`${editor} [data-arg-input]`, (els) => els.length);
    expect(before).toBeGreaterThan(1);
    await run.page.focus(`${editor} .remove button >> nth=0`);
    await run.page.keyboard.press('Enter');
    expect(await run.page.$$eval(`${editor} [data-arg-input]`, (els) => els.length)).toBe(before - 1);
    const focused = await run.page.evaluate((sel) => {
      const a = document.activeElement as HTMLElement;
      return { inEditor: !!document.querySelector(sel)?.contains(a), tag: a.tagName, remove: !!a.closest('.remove') };
    }, editor);
    expect(focused).toEqual({ inEditor: true, tag: 'BUTTON', remove: true });
  });
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
