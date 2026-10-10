// The window shell's vocabularies and helpers (C-01 title bar, C-02 sidebar, C-03 run bar, C-10 progress,
// C-20 banners and toasts, C-22 selection bar). Presentational only: no bridge or engine calls.
import type { MessageKey } from '@ayar/i18n';
import type { LucideName } from '../design/icons.generated.ts';
import type { Result } from './status.ts';

/** Where macOS draws the window buttons (D-54): decided by the main process from the system language. */
export type WindowControls = 'left' | 'right';

/** The sidebar destinations, in their Figma order (Sidebar 101:1355; plan 9, 13.2). */
export const NAV_TOP = ['overview', 'fullScan'] as const;
export const NAV_SECTIONS = ['design', 'security', 'code', 'behavior', 'performance', 'custom', 'integrity'] as const;
export const NAV_PROJECT = ['modelChecks', 'tasks', 'runs', 'projectConfiguration'] as const;
export const NAV_BOTTOM = ['tools', 'settings'] as const;
export type NavId =
  | (typeof NAV_TOP)[number]
  | (typeof NAV_SECTIONS)[number]
  | (typeof NAV_PROJECT)[number]
  | (typeof NAV_BOTTOM)[number];

/** The label key and the Lucide 16 glyph of each destination, as in the Figma sidebar. */
export const NAV: Readonly<Record<NavId, { key: MessageKey; icon: LucideName }>> = {
  overview: { key: 'ui.nav.overview', icon: 'layout-dashboard' },
  fullScan: { key: 'ui.nav.fullScan', icon: 'scan-search' },
  design: { key: 'ui.section.design', icon: 'palette' },
  security: { key: 'ui.section.security', icon: 'shield' },
  code: { key: 'ui.section.code', icon: 'code' },
  behavior: { key: 'ui.section.behavior', icon: 'workflow' },
  performance: { key: 'ui.section.performance', icon: 'gauge' },
  custom: { key: 'ui.section.custom', icon: 'puzzle' },
  integrity: { key: 'ui.section.integrity', icon: 'scale' },
  modelChecks: { key: 'ui.nav.modelChecks', icon: 'sparkles' },
  tasks: { key: 'ui.nav.tasks', icon: 'list-todo' },
  runs: { key: 'ui.nav.runs', icon: 'history' },
  projectConfiguration: { key: 'ui.nav.projectConfiguration', icon: 'sliders-horizontal' },
  tools: { key: 'ui.nav.tools', icon: 'hammer' },
  settings: { key: 'ui.nav.settings', icon: 'settings' },
};

/** Nav badge (101:783): the failed checks of a section, or the section needs setup. */
export type NavBadgeValue = { kind: 'failures'; count: number } | { kind: 'missing' };
/** The status family whose colours each badge kind takes (status.css). */
export const NAV_BADGE_FAMILY: Readonly<Record<NavBadgeValue['kind'], Result>> = { failures: 'failed', missing: 'missing' };

/** A run's cycle while the run bar shows (Run bar 102:1452: Status running | cancelling). */
export type RunBarStatus = 'running' | 'cancelling';
/** One result count of the run bar: a status symbol 12 and a Latin number. */
export interface ResultCount {
  result: Result;
  count: number;
}

/** A clock for durations: m:ss, or mm:ss with padMinutes (the run bar's 02:14; the progress 0:48). */
export function clock(seconds: number, padMinutes = false): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${padMinutes ? String(m).padStart(2, '0') : m}:${ss}`;
}

/** The same duration as an ISO 8601 duration, for <time datetime>. */
export function isoDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `PT${Math.floor(s / 3600)}H${Math.floor((s % 3600) / 60)}M${s % 60}S`;
}

/**
 * A path split for display (D-DES3-04): one segment per entry (each rendered in its own <bdi>), the middle
 * collapsed to "…" when there are more than `keep` segments (the project switcher's middle truncation).
 */
export function pathSegments(path: string, keep = 3): string[] {
  const parts = path.split('/').filter((p, i) => p !== '' || i === 0);
  if (parts.length <= keep) return parts;
  return [parts[0]!, '…', ...parts.slice(parts.length - (keep - 1))];
}

/**
 * Splits a translated message around one placeholder so the caller can render that value in its own element
 * (an identifier isolated left to right). Returns [before, after].
 */
export function splitAround(text: string, marker: string): [string, string] {
  const at = text.indexOf(marker);
  if (at < 0) return [text, ''];
  return [text.slice(0, at), text.slice(at + marker.length)];
}

/** A marker that never occurs in a message, used with splitAround. */
export const SLOT = '\u{E000}';
