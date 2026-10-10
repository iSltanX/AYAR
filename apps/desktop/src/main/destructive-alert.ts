// D-DEV3-15: the four destructive commands are confirmed in a native macOS alert the main process shows itself,
// before it mints their confirmation token; the renderer cannot answer it. The texts are DES-3's
// («Native alert/Destructive confirmation», 116:9399): a question, the consequence, «ألغِ» by default, and a button
// that names the act. No destructive styling (hasDestructiveAction would paint the button red, D-DES3-06).
import { createTranslator, type Lang } from '@ayar/i18n';
import type { DIRECT_CONFIRM_COMMANDS } from '@ayar/protocol';

export type DestructiveCommand = (typeof DIRECT_CONFIRM_COMMANDS)[number];

export interface DestructiveAlert {
  title: string;
  detail: string;
  confirm: string;
  cancel: string;
}

const KEYS = {
  'project.remove': 'removeProject',
  'runs.delete': 'deleteRuns',
  'tools.remove': 'removeTool',
  'data.purge': 'purgeData',
} as const satisfies Record<DestructiveCommand, string>;

export function destructiveAlert(lang: Lang, command: DestructiveCommand, subject: { name?: string; count?: number }): DestructiveAlert {
  const t = createTranslator(lang);
  const k = KEYS[command];
  const values = { name: subject.name ?? '', count: subject.count ?? 1 };
  return { title: t(`alerts.${k}.title`, values), detail: t(`alerts.${k}.detail`, values), confirm: t(`alerts.${k}.confirm`, values), cancel: t('alerts.cancel') };
}
