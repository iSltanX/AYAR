// DEV-10 gate, on the development build with the gallery (npm run test:e2e builds both):
//   AT-30 (part): zero CSP violations during a full tour of the gallery, and no request leaves app://.
//   AT-40 (part): axe on the gallery in both languages and both themes: no critical or serious issue.
//   FR-53: every interactive component is reachable by keyboard, in DOM order, with the focus moving from the
//          start side in both directions, and the 2 px ring visible.
//   AT-28 (part): mirroring: arrows and progress follow the language; the check mark, spinners and status
//          symbols other than "skipped" do not.
//   16.4: the fonts actually rendered are the bundled Cairo and Almarai, and the system monospace (E-01).
//   Matching (task 6, geometric part): every specimen has the size Figma gives it (±1 px).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchGallery, showGallery } from './gallery-support.ts';
import { tempDataDir, type Launched } from './support.ts';

type Combo = { lang: 'ar' | 'en'; theme: 'light' | 'dark' };
const COMBOS: Combo[] = [
  { lang: 'ar', theme: 'light' },
  { lang: 'en', theme: 'light' },
  { lang: 'ar', theme: 'dark' },
  { lang: 'en', theme: 'dark' },
];

let t: ReturnType<typeof tempDataDir>;
let run: Launched;

beforeAll(async () => {
  t = tempDataDir();
  run = await launchGallery(t.dataDir);
  // The page's own record of CSP violations, next to the main process's (ayarDiagnostics).
  await run.page.evaluate(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
});
afterAll(async () => {
  await run?.app.close();
  t?.cleanup();
});

const mainViolations = () =>
  run.app.evaluate(() => (globalThis as unknown as { ayarDiagnostics: { cspViolations: { directive: string }[] } }).ayarDiagnostics.cspViolations.length);
const pageViolations = () => run.page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

describe('gallery under the CSP (AT-30 part)', () => {
  it('lists every section and renders them in all four language and theme combinations', async () => {
    for (const c of COMBOS) {
      await showGallery(run.page, { lang: c.lang, theme: c.theme });
      const panels = await run.page.$$eval('[data-panel]', (els) => els.map((e) => e.getAttribute('data-panel')));
      const sections = await run.page.$$eval('[data-section]', (els) => els.length);
      expect(panels.length).toBe(sections);
      expect(panels.every((p) => p!.endsWith(`/${c.lang}/${c.theme}`))).toBe(true);
      // Scroll through the whole page so that everything is laid out and painted.
      await run.page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 800) {
          window.scrollTo(0, y);
          await new Promise((r) => requestAnimationFrame(() => r(undefined)));
        }
        window.scrollTo(0, 0);
      });
    }
    expect(await run.page.$$eval('[data-demo]', (els) => els.length)).toBeGreaterThan(50);
  });

  it('records zero CSP violations, and loads nothing from outside app://', async () => {
    expect(await pageViolations()).toEqual([]);
    expect(await mainViolations()).toBe(0);
    const foreign = await run.page.evaluate(() =>
      performance.getEntriesByType('resource').map((e) => e.name).filter((n) => !n.startsWith('app://ayar/')),
    );
    expect(foreign).toEqual([]);
  });
});

describe('geometry against Figma (task 6, measurable part)', () => {
  it('gives every specimen the height and width Figma gives it (±1 px), in both languages', async () => {
    for (const lang of ['ar', 'en'] as const) {
      await showGallery(run.page, { lang, theme: 'light' });
      const off = await run.page.$$eval('[data-expect-h], [data-expect-w]', (els) =>
        els.flatMap((el) => {
          const target = el.firstElementChild ?? el;
          const r = target.getBoundingClientRect();
          const h = el.getAttribute('data-expect-h');
          const w = el.getAttribute('data-expect-w');
          const name = el.closest('[data-demo]')?.getAttribute('data-demo');
          const out: string[] = [];
          if (h && Math.abs(r.height - Number(h)) > 1) out.push(`${name}: height ${r.height} ≠ ${h}`);
          if (w && Math.abs(r.width - Number(w)) > 1) out.push(`${name}: width ${r.width} ≠ ${w}`);
          return out;
        }),
      );
      expect(off, lang).toEqual([]);
    }
  });
});

describe('accessibility (AT-40 part, NFR-04)', () => {
  const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

  it('has no critical or serious axe violation in either language or theme', async () => {
    const report: string[] = [];
    for (const c of COMBOS) {
      await showGallery(run.page, { lang: c.lang, theme: c.theme });
      await run.page.evaluate(axeSource);
      const result = await run.page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, first: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
      });
      for (const v of result) report.push(`${c.lang}/${c.theme} ${v.impact} ${v.id} ×${v.nodes} ${v.first.join(' | ')}`);
    }
    console.log(`axe: ${report.length ? report.join('\n') : 'no violations'}`);
    expect(report.filter((r) => / (critical|serious) /.test(r))).toEqual([]);
  });

  it('reaches every interactive element by keyboard, in order, from the start side, with a visible ring', async () => {
    for (const lang of ['ar', 'en'] as const) {
      await showGallery(run.page, { lang, theme: 'light' });
      // Number the tabbable elements of each panel in tree order: that is the order Tab must follow.
      const panels = await run.page.evaluate(() => {
        const out: { panel: string; count: number }[] = [];
        for (const panel of document.querySelectorAll('[data-panel]')) {
          // A native radio group is one tab stop: its checked radio, or its first one when none is checked.
          const radioStop = (el: HTMLElement) => {
            if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return true;
            const group = [...panel.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]:not(:disabled)`)];
            return group.some((r) => r.checked) ? el.checked : el === group[0];
          };
          const tabbable = [...panel.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')].filter(
            (el) => !el.matches(':disabled') && el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]') && radioStop(el),
          );
          tabbable.forEach((el, i) => el.setAttribute('data-tab-order', String(i)));
          if (tabbable.length) out.push({ panel: panel.getAttribute('data-panel')!, count: tabbable.length });
        }
        return out;
      });
      const problems: string[] = [];
      let total = 0;
      for (const { panel, count } of panels) {
        total += count;
        await run.page.focus(`[data-panel="${panel}"] [data-tab-order="0"]`);
        // Page coordinates: Tab scrolls the focused element into view, so viewport rectangles are not comparable.
        let prev = await run.page.evaluate(() => {
          const r = (document.activeElement as HTMLElement).getBoundingClientRect();
          return { top: r.top + scrollY, left: r.left + scrollX };
        });
        for (let i = 1; i < count; i++) {
          await run.page.keyboard.press('Tab');
          const at = await run.page.evaluate(() => {
            const el = document.activeElement as HTMLElement;
            const demo = (e: Element | null) => e?.closest('[data-demo]')?.getAttribute('data-demo') ?? '';
            return { order: el.getAttribute('data-tab-order'), panel: el.closest('[data-panel]')?.getAttribute('data-panel'), rect: { top: el.getBoundingClientRect().top + scrollY, left: el.getBoundingClientRect().left + scrollX }, demo: demo(el), html: el.outerHTML.slice(0, 90) };
          });
          if (at.panel !== panel || at.order !== String(i)) {
            problems.push(`${panel}: Tab ${i} landed on ${at.html}`);
            break;
          }
          // Start side first: on one visual line, focus moves right-to-left in RTL and left-to-right in LTR.
          if (Math.abs(at.rect.top - prev.top) < 4 && (lang === 'ar' ? at.rect.left > prev.left + 1 : at.rect.left < prev.left - 1)) {
            problems.push(`${panel}: Tab ${i} moves against the reading direction (${at.demo})`);
          }
          prev = at.rect;
        }
      }
      expect(problems, lang).toEqual([]);
      expect(total).toBeGreaterThan(10);
    }
  });

  it('shows the focus ring (2 px ink outline, 2 px offset) on every focused element, from the keyboard', async () => {
    await showGallery(run.page, { lang: 'ar', theme: 'light' });
    const handles = await run.page.$$('[data-panel] :is(a[href], button, input, select, textarea, [tabindex]):not(:disabled)');
    const missing: string[] = [];
    let checked = 0;
    for (const h of handles) {
      const info = await h.evaluate((el: HTMLElement) => ({ tab: el.tabIndex, visible: el.getClientRects().length > 0 }));
      if (info.tab < 0 || !info.visible) continue;
      await h.focus();
      await run.page.keyboard.press('Shift'); // a key press makes the focus keyboard focus (:focus-visible)
      const ring = await h.evaluate((el: HTMLElement) => {
        const s = getComputedStyle(el);
        return { visible: el.matches(':focus-visible'), style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, html: el.outerHTML.slice(0, 80) };
      });
      checked++;
      if (!ring.visible || ring.style !== 'solid' || ring.width !== '2px' || ring.offset !== '2px') missing.push(`${ring.html} ${ring.style} ${ring.width} ${ring.offset}`);
    }
    expect(missing).toEqual([]);
    expect(checked).toBeGreaterThan(10);
  });
});

describe('mirroring (AT-28 part, 16.5, D-DES2-02)', () => {
  const transforms = (lang: 'ar' | 'en'): Promise<Record<string, string>> =>
    run.page.$$eval(`[data-panel$="/${lang}/light"] [data-symbol]`, (els) =>
      Object.fromEntries(els.map((e) => [e.getAttribute('data-symbol') ?? '', getComputedStyle(e).transform])),
    );

  it('mirrors only the skipped symbol in Arabic, and nothing in English', async () => {
    await showGallery(run.page, { lang: 'both', theme: 'light', section: 'S-01' });
    const ar = await transforms('ar');
    const en = await transforms('en');
    expect(ar['skipped']).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    for (const s of ['passed', 'failed', 'running', 'cancelling', 'queued', 'timed-out']) {
      expect(ar[s], s).toBe('none');
      expect(en[s], s).toBe('none');
    }
    expect(en['skipped']).toBe('none');
  });
});

describe('mirroring of arrows, progress and the check mark (AT-28 part, 16.5)', () => {
  it('chooses the arrow glyphs per language and never mirrors icons by transform', async () => {
    await showGallery(run.page, { lang: 'both', theme: 'light', section: 'S-04' });
    const icons = (lang: 'ar' | 'en') =>
      run.page.$$eval(`[data-panel="S-04/${lang}/light"] [data-icon]`, (els) => ({
        names: [...new Set(els.map((e) => e.getAttribute('data-icon')))],
        transformed: els.filter((e) => getComputedStyle(e).transform !== 'none').map((e) => e.getAttribute('data-icon')),
      }));
    const ar = await icons('ar');
    const en = await icons('en');
    // Persisting and reappeared (D-DES2-02): arrow-left / redo-2 in Arabic, arrow-right / undo-2 in English.
    expect(ar.names).toEqual(expect.arrayContaining(['arrow-left', 'redo-2']));
    expect(ar.names).not.toContain('arrow-right');
    expect(en.names).toEqual(expect.arrayContaining(['arrow-right', 'undo-2']));
    expect(en.names).not.toContain('arrow-left');
    expect([...ar.transformed, ...en.transformed]).toEqual([]);
  });

  it('fills progress bars from the right in Arabic and from the left in English', async () => {
    await showGallery(run.page, { lang: 'both', theme: 'light', section: 'C-10' });
    const edges = (lang: 'ar' | 'en') =>
      run.page.$$eval(`[data-panel="C-10/${lang}/light"] [data-demo="Progress/count"] .track`, (els) =>
        els.map((track) => {
          const t = track.getBoundingClientRect();
          const f = track.firstElementChild!.getBoundingClientRect();
          return { start: Math.round(f.left - t.left), end: Math.round(t.right - f.right), partial: f.width < t.width - 1 };
        }),
      );
    const [ar] = await edges('ar');
    const [en] = await edges('en');
    expect(ar!.partial && en!.partial).toBe(true);
    expect(ar!.end).toBe(0);
    expect(ar!.start).toBeGreaterThan(0);
    expect(en!.start).toBe(0);
    expect(en!.end).toBeGreaterThan(0);
  });

  it('keeps the check mark of a checkbox unmirrored in Arabic', async () => {
    await showGallery(run.page, { lang: 'ar', theme: 'light', section: 'C-18' });
    const transforms = await run.page.$$eval('[data-panel="C-18/ar/light"] [data-icon="check"]', (els) => els.map((e) => getComputedStyle(e).transform));
    expect(transforms.length).toBeGreaterThan(0);
    expect(transforms.every((t) => t === 'none')).toBe(true);
  });
});

describe('reduced motion (16.6, D-DES2-11)', () => {
  it('spins running and cancelling, and shows their static forms under reduced motion', async () => {
    await showGallery(run.page, { lang: 'ar', theme: 'light', section: 'S-01' });
    const state = () =>
      run.page.$$eval('[data-panel="S-01/ar/light"] [data-symbol="running"]', (els) =>
        els.map((e) => ({
          moving: getComputedStyle(e.querySelector('.motion')!).display !== 'none',
          still: getComputedStyle(e.querySelector('.still')!).display !== 'none',
          animation: getComputedStyle(e.querySelector('.spin')!).animationName,
        })),
      );
    expect((await state()).every((s) => s.moving && !s.still && /spin/.test(s.animation))).toBe(true);
    await run.page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await state()).every((s) => !s.moving && s.still)).toBe(true);
    await run.page.emulateMedia({ reducedMotion: 'no-preference' });
  });
});

describe('fonts actually rendered (16.4, E-01, D-DES1-09)', () => {
  it('renders labels in Cairo, body text in Almarai, and code in the system monospace with Arabic in Almarai', async () => {
    await showGallery(run.page, { lang: 'ar', theme: 'light', section: 'S-01' });
    const cdp = await run.page.context().newCDPSession(run.page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const fontsOf = async (selector: string) => {
      const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      return fonts.map((f) => f.familyName);
    };
    expect(await fontsOf('[data-panel="S-01/ar/light"] [data-result="passed"] .label')).toEqual(['Cairo']);
    expect(await fontsOf('[data-panel="S-01/ar/light"] figcaption')).toEqual(['Almarai']);
    const mono = await fontsOf('[data-section="S-01"] h2 code');
    expect(mono.some((f) => /^(Menlo|SF Mono)/.test(f))).toBe(true);
    // An Arabic path: Latin from the system monospace, Arabic from Almarai (D-DES1-09), never Courier New.
    await showGallery(run.page, { lang: 'ar', theme: 'light', section: 'C-11' });
    const arabicPath = await fontsOf('[data-panel="C-11/ar/light"] [data-demo="Path pill/arabic-folders"] .path bdi');
    expect(arabicPath).toContain('Almarai');
    expect(arabicPath.some((f) => /Courier/.test(f))).toBe(false);
    console.log(`fonts: label Cairo, body Almarai, mono ${mono.join('+')}, Arabic path ${arabicPath.join('+')}`);
    await cdp.detach();
  });
});
