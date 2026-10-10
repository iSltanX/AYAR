// Helpers shared by the input controls of C-18 (DEV-10): a width set through CSSOM (no inline style, 15.2),
// arrow-key navigation that follows the reading direction (WAI-ARIA radio group and tabs patterns), and the
// two tab bars Figma defines (Tabs 100:607).
import type { MessageKey } from '@ayar/i18n';
import type { Attachment } from 'svelte/attachments';

/** A control width: a number of px, or 'fill' to take the container's width. */
export type ControlWidth = number | 'fill';

/** Sets --control-width on the element from script (CSSOM is allowed by the CSP; the style attribute is not). */
export function controlWidth(width: ControlWidth | undefined): Attachment<HTMLElement> {
  return (el) => {
    if (width === undefined) el.style.removeProperty('--control-width');
    else el.style.setProperty('--control-width', width === 'fill' ? '100%' : `${width}px`);
  };
}

/**
 * The index an arrow key moves to in a one-row group (segmented control, tab list, radio group), or null for
 * any other key. "Next" is the inline-end side: ArrowLeft in Arabic, ArrowRight in English. ArrowDown/ArrowUp
 * are next/previous too. Home and End go to the first and last enabled item. Disabled items are skipped and
 * the movement wraps.
 */
export function arrowTarget(event: KeyboardEvent, current: number, enabled: readonly boolean[]): number | null {
  const el = event.currentTarget instanceof Element ? event.currentTarget : null;
  const rtl = el ? getComputedStyle(el).direction === 'rtl' : false;
  const next = rtl ? 'ArrowLeft' : 'ArrowRight';
  const prev = rtl ? 'ArrowRight' : 'ArrowLeft';
  const n = enabled.length;
  if (!n || !enabled.some(Boolean)) return null;
  const step = (from: number, by: 1 | -1) => {
    let i = from;
    for (let k = 0; k < n; k++) {
      i = (i + by + n) % n;
      if (enabled[i]) return i;
    }
    return from;
  };
  switch (event.key) {
    case next:
    case 'ArrowDown':
      return step(current, 1);
    case prev:
    case 'ArrowUp':
      return step(current, -1);
    case 'Home':
      return step(n - 1, 1);
    case 'End':
      return step(0, -1);
    default:
      return null;
  }
}

/** One tab or segment: a stable id and its visible label (already translated, or content). */
export interface ControlOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** The two tab bars of Figma `Tabs` (100:607), in reading order from the start side. */
export const TAB_SETS = {
  inspector: [
    { value: 'details', key: 'controls.tab.details' },
    { value: 'log', key: 'controls.tab.log' },
  ],
  results: [
    { value: 'findings', key: 'ui.tab.findings' },
    { value: 'checks', key: 'ui.tab.checks' },
    { value: 'evidence', key: 'ui.tab.evidence' },
    { value: 'side-effects', key: 'ui.tab.sideEffects' },
  ],
} as const satisfies Record<string, readonly { value: string; key: MessageKey }[]>;

export type TabsKind = keyof typeof TAB_SETS;
