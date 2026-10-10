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
 * Which arrow keys move inside a one-row or one-column group (WAI-ARIA): a horizontal tab list uses Left/Right
 * only, a vertical list Up/Down only, and a radio group (segmented control) all four.
 */
export type ArrowOrientation = 'horizontal' | 'vertical' | 'both';

/**
 * The index an arrow key moves to, or null for any other key (pure: no DOM). "Next" on the horizontal axis is
 * the inline-end side: ArrowLeft in right-to-left text, ArrowRight in left-to-right text; on the vertical axis
 * ArrowDown. Home and End go to the first and last enabled item. Disabled items are skipped and the movement
 * wraps. Returns null when no item is enabled.
 */
export function arrowIndex(
  key: string,
  dir: 'rtl' | 'ltr',
  orientation: ArrowOrientation,
  current: number,
  enabled: readonly boolean[],
): number | null {
  const n = enabled.length;
  if (!n || !enabled.some(Boolean)) return null;
  const horizontal = orientation !== 'vertical';
  const vertical = orientation !== 'horizontal';
  const step = (from: number, by: 1 | -1) => {
    let i = from;
    for (let k = 0; k < n; k++) {
      i = (i + by + n) % n;
      if (enabled[i]) return i;
    }
    return from;
  };
  if (horizontal && key === (dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight')) return step(current, 1);
  if (horizontal && key === (dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft')) return step(current, -1);
  if (vertical && key === 'ArrowDown') return step(current, 1);
  if (vertical && key === 'ArrowUp') return step(current, -1);
  if (key === 'Home') return step(n - 1, 1);
  if (key === 'End') return step(0, -1);
  return null;
}

/**
 * arrowIndex for a keyboard event, the reading direction taken from the element that has the handler. The
 * orientation defaults to 'both' (the behaviour of the first version of this function).
 */
export function arrowTarget(
  event: KeyboardEvent,
  current: number,
  enabled: readonly boolean[],
  orientation: ArrowOrientation = 'both',
): number | null {
  const el = event.currentTarget instanceof Element ? event.currentTarget : null;
  const dir = el && getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr';
  return arrowIndex(event.key, dir, orientation, current, enabled);
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
