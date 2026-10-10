// Menu models (D-DES3-07): the context menus of a check row and a finding row, and the Run menu, are native macOS
// menus that the main process builds (DEV-11/12). This file holds their content, order and shortcuts exactly as
// approved in Figma: `Context menu` 113:8383, `Menu item` 113:8290, `Menu separator` 113:8293 and `Run menu`
// 113:8766 (frame C-23 113:8662); prompt §9.21 and §9.23; shortcuts from plan 4 §13.7. The models carry message
// keys, not text, so either process can translate them; accelerators use Electron's syntax.
import type { MessageKey, Translate } from '@ayar/i18n';

/** A message key with its values; a value may itself be a message key ({ key }) translated first. */
export type MenuValues = Record<string, string | number | { key: MessageKey }>;

export interface MenuItemModel {
  kind: 'item';
  /** A stable command id, sent back to the renderer when the item is chosen. */
  id: string;
  /** The label: a message key (with values), or literal content (a saved group's name). */
  label: { key: MessageKey; values?: MenuValues } | { text: string };
  /** Electron accelerator, e.g. 'CmdOrCtrl+Shift+R'. */
  accelerator?: string;
  enabled: boolean;
}
export interface MenuSeparatorModel {
  kind: 'separator';
}
/** A disabled caption heading a group of items (the Run menu's «المجموعات المحفوظة»). */
export interface MenuHeaderModel {
  kind: 'header';
  label: MessageKey;
}
export type MenuEntry = MenuItemModel | MenuSeparatorModel | MenuHeaderModel;

/** A saved group of checks, as the Run menu lists it (by name, in the saved order). */
export interface SavedGroup {
  id: string;
  name: string;
}

/** The accelerators of plan 4 §13.7 that these menus show. */
export const ACCELERATORS = {
  fullScan: 'CmdOrCtrl+R',
  rerunFailed: 'CmdOrCtrl+Shift+R',
} as const;

const item = (id: string, key: MessageKey, extra: Partial<MenuItemModel> = {}): MenuItemModel => ({
  kind: 'item',
  id,
  label: { key },
  enabled: true,
  ...extra,
});
const separator: MenuSeparatorModel = { kind: 'separator' };

/**
 * Context menu of a check row: شغّل · افتح السجل | انسخ المعرّف · افتح في المحرر. «افتح في المحرر» only when the
 * check has a configuration file. «انسخ المعرّف» copies the id text only.
 */
export function checkRowMenu(opts: { hasConfigFile: boolean }): MenuEntry[] {
  return [
    item('check.run', 'controls.menu.run'),
    item('check.openLog', 'controls.menu.openLog'),
    separator,
    item('check.copyId', 'controls.menu.copyId'),
    ...(opts.hasConfigFile ? [item('check.openInEditor', 'ui.action.openInEditor')] : []),
  ];
}

/**
 * Context menu of a finding row: حدّد للنسخ · أنشئ بطاقة · سجّل مراجعة | افتح في المحرر · انسخ المعرّف.
 * «حدّد للنسخ» is left out for a finding whose next step is «تعالجها مباشرة» (prompt §9.21, §9.25).
 */
export function findingRowMenu(opts: { selectableForCopy: boolean }): MenuEntry[] {
  return [
    ...(opts.selectableForCopy ? [item('finding.selectForCopy', 'ui.action.selectForCopy')] : []),
    item('finding.createCard', 'ui.action.createCard'),
    item('finding.recordReview', 'ui.action.recordReview'),
    separator,
    item('finding.openInEditor', 'ui.action.openInEditor'),
    item('finding.copyId', 'controls.menu.copyId'),
  ];
}

/**
 * The Run menu, opened from the primary «شغّل» button with a chevron: الفحص الكامل (⌘R) · القسم الحالي: <section>
 * · المحدد (N) | أعد الفاشل (⇧⌘R) · أعد غير المكتمل | «المجموعات المحفوظة» and the saved groups by name. The
 * current-section item is left out outside a section (it has no text without one), "Selected" is disabled when
 * nothing is selected, and the saved-groups block is left out when there are none. Re-run items open the Re-run sheet (component 19).
 */
export function runMenu(opts: { section?: MessageKey; selectedCount: number; savedGroups: readonly SavedGroup[] }): MenuEntry[] {
  const entries: MenuEntry[] = [
    item('run.fullScan', 'ui.nav.fullScan', { accelerator: ACCELERATORS.fullScan }),
    ...(opts.section
      ? [
          {
            kind: 'item',
            id: 'run.currentSection',
            label: { key: 'controls.runMenu.currentSection', values: { section: { key: opts.section } } },
            enabled: true,
          } satisfies MenuItemModel,
        ]
      : []),
    {
      kind: 'item',
      id: 'run.selected',
      label: { key: 'controls.runMenu.selected', values: { count: opts.selectedCount } },
      enabled: opts.selectedCount > 0,
    },
    separator,
    item('run.rerunFailed', 'ui.action.rerunFailed', { accelerator: ACCELERATORS.rerunFailed }),
    item('run.rerunIncomplete', 'ui.action.rerunIncomplete'),
  ];
  if (opts.savedGroups.length) {
    entries.push(separator, { kind: 'header', label: 'controls.runMenu.savedGroups' });
    for (const g of opts.savedGroups) entries.push({ kind: 'item', id: `run.savedGroup:${g.id}`, label: { text: g.name }, enabled: true });
  }
  return entries;
}

/** The visible text of an item or header in one language. */
export function menuLabel(entry: MenuItemModel | MenuHeaderModel, t: Translate): string {
  if (entry.kind === 'header') return t(entry.label);
  if ('text' in entry.label) return entry.label.text;
  const values: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(entry.label.values ?? {})) values[k] = typeof v === 'object' ? t(v.key) : v;
  return t(entry.label.key, values);
}

/** An Electron accelerator in macOS notation, modifiers in the system order ⌃⌥⇧⌘: 'CmdOrCtrl+Shift+R' → '⇧⌘R'. */
export function acceleratorGlyphs(accelerator: string): string {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const has = (...names: string[]) => names.some((n) => mods.has(n));
  return (
    (has('ctrl', 'control') ? '⌃' : '') +
    (has('alt', 'option') ? '⌥' : '') +
    (has('shift') ? '⇧' : '') +
    (has('cmdorctrl', 'commandorcontrol', 'cmd', 'command', 'super', 'meta') ? '⌘' : '') +
    key.toUpperCase()
  );
}
