// What the probe measures inside a page (C-14): each function runs in the page through page.evaluate, so it is
// self-contained (no closure, no import) and returns plain data. They read; they change nothing the page shows.

/** A short selector of an element: its id, else its tag with classes and position among siblings (for the evidence). */
function selectorOfSource(): string {
  return `function selectorOf(el) {
    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && depth < 5; depth++) {
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      let part = node.localName;
      const cls = [...node.classList].slice(0, 2).map((c) => '.' + CSS.escape(c)).join('');
      part += cls;
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.localName === node.localName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }`;
}

/**
 * design.tokens.render: the computed values of the visible elements, for the properties a design scale binds —
 * colours, spacing, radius, font size. A value the user agent gives by itself is left out: each element is compared
 * with a bare element of the same tag and font size in an unstyled frame, so a browser default (a paragraph's
 * margin, a button's padding) is never taken for the project's choice. Transparent colours, borders of no width and
 * zero lengths are left out too.
 */
export const SAMPLE_STYLES = `(maxElements) => {
  ${selectorOfSource()}
  const PROPS = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'row-gap', 'column-gap', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius', 'font-size'];
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = '<!doctype html><html><body></body></html>';
  document.documentElement.append(frame);
  const bare = frame.contentDocument;
  const defaults = new Map();
  const defaultOf = (tag, fontSize) => {
    const k = tag + '|' + fontSize;
    if (defaults.has(k)) return defaults.get(k);
    let d = null;
    try {
      const el = bare.createElement(tag);
      if (fontSize) el.style.fontSize = fontSize;
      bare.body.append(el);
      const cs = frame.contentWindow.getComputedStyle(el);
      d = {};
      for (const p of PROPS) d[p] = cs.getPropertyValue(p);
      el.remove();
    } catch { d = null; }
    defaults.set(k, d);
    return d;
  };
  const out = [];
  const all = document.body ? [document.body, ...document.body.querySelectorAll('*')] : [];
  let seen = 0;
  for (const el of all) {
    if (seen >= maxElements) break;
    if (el === frame || ['script', 'style', 'template', 'noscript', 'link', 'meta'].includes(el.localName)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    seen++;
    // Lengths in em follow the element's font size, so its defaults are read at that size; the font size itself is
    // compared with the tag's default at the browser's own size.
    const d = defaultOf(el.localName, cs.fontSize) || {};
    const dSize = defaultOf(el.localName, null) || {};
    const selector = selectorOf(el);
    // Horizontal auto margins (centring) resolve to pixels: equal margins that centre the box are not lengths.
    const ml = parseFloat(cs.marginLeft), mr = parseFloat(cs.marginRight);
    const parent = el.parentElement;
    const centred = parent && ml > 0 && Math.abs(ml - mr) <= 1 && (() => { const pr = parent.getBoundingClientRect(); const pcs = getComputedStyle(parent); const inner = pr.width - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderLeftWidth) - parseFloat(pcs.borderRightWidth); return Math.abs(inner - r.width - ml - mr) <= 2; })();
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (!v || v === (p === 'font-size' ? dSize[p] : d[p])) continue;
      if (centred && (p === 'margin-left' || p === 'margin-right')) continue;
      if (p.endsWith('color') && (/rgba\\([^)]*,\\s*0\\)$/.test(v) || v === 'transparent')) continue;
      if (p.startsWith('border-') && p.endsWith('-color')) {
        const side = p.split('-')[1];
        if (parseFloat(cs.getPropertyValue('border-' + side + '-width')) === 0) continue;
      }
      if (p === 'outline-color' && (cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0)) continue;
      if (/^(padding|margin|row-gap|column-gap|border-.*-radius)/.test(p) && (v === '0px' || v === 'normal' || v === 'auto')) continue;
      if ((p === 'row-gap' || p === 'column-gap') && !/flex|grid/.test(cs.display)) continue;
      out.push({ selector, prop: p, value: v });
    }
  }
  frame.remove();
  return out;
}`;

/** design.fonts.render: every face the document knows with its status, and the families the visible text asks for. */
export const FONTS_STATE = `async () => {
  try { await document.fonts.ready; } catch {}
  const faces = [...document.fonts].map((f) => ({ family: f.family.replace(/^["']|["']$/g, ''), status: f.status, unicodeRange: f.unicodeRange, style: f.style, weight: String(f.weight) }));
  const families = new Set();
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  let n = 0;
  while (walker.nextNode() && n < 2000) {
    const t = walker.currentNode;
    if (!t.textContent || !t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el) continue;
    n++;
    const first = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (first) families.add(first);
  }
  return { faces, families: [...families] };
}`;

/** design.rtl.render: the root's direction, horizontal overflow, and text cut short without an ellipsis. */
export const RTL_MEASURE = `() => {
  ${selectorOfSource()}
  const root = document.documentElement;
  const doc = document.scrollingElement || root;
  const overflowX = Math.max(0, doc.scrollWidth - doc.clientWidth);
  const clipped = [];
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    if (clipped.length >= 20) break;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!text) continue;
    const cut = (cs.overflowX === 'hidden' || cs.overflow === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis';
    if (cut) clipped.push({ selector: selectorOf(el), text: text.slice(0, 200) });
  }
  return { dirAttribute: root.getAttribute('dir'), direction: getComputedStyle(root).direction, overflowX, clipped };
}`;

/** The source text around a position of a loaded script (a console error's place), for its source line (D-DEV7-05). */
export const SCRIPT_NEAR = `async ({ url, line, column }) => {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const lines = (await res.text()).split('\\n');
    const l = lines[line] ?? lines[line - 1];
    if (l === undefined) return null;
    const c = Math.max(0, column);
    return l.slice(Math.max(0, c - 300), c + 300);
  } catch { return null; }
}`;

/** E-21 (perf.web): the browser's own timings of the load, read after it. */
export const PERF_TIMINGS = `async () => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
  const lcp = await new Promise((resolve) => {
    let last = null;
    try {
      const po = new PerformanceObserver((list) => { const e = list.getEntries(); if (e.length) last = e[e.length - 1].startTime; });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => { po.disconnect(); resolve(last); }, 150);
    } catch { resolve(null); }
  });
  const cls = await new Promise((resolve) => {
    let sum = 0;
    try {
      const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) sum += e.value; });
      po.observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => { po.disconnect(); resolve(sum); }, 100);
    } catch { resolve(null); }
  });
  const resources = performance.getEntriesByType('resource');
  const bytes = resources.reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), (nav && (nav.transferSize || nav.encodedBodySize)) || 0);
  return {
    fcp: paints['first-contentful-paint'] ?? null,
    lcp,
    load: nav ? nav.loadEventEnd - nav.startTime : null,
    domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
    ttfb: nav ? nav.responseStart - nav.startTime : null,
    cls,
    bytes: Math.round(bytes),
    requests: resources.length + 1,
  };
}`;
