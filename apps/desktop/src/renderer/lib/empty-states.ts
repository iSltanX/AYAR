// The five empty states of C-21 (Figma `Empty state` 113:8501; prompt §9.21): icon, texts and the single action.
import type { MessageKey } from '@ayar/i18n';
import type { LucideName } from '../design/icons.generated.ts';

export type EmptyKind = 'projects' | 'no-runs' | 'no-cards' | 'no-model-needs' | 'no-matching-findings';

interface EmptySpec {
  icon: LucideName;
  title: MessageKey;
  body: MessageKey;
  /** At most one action; «أضف مشروعًا…» is the primary one (⌘O), the others are secondary. */
  action?: { label: MessageKey; kind: 'primary' | 'secondary' };
}

/** The five empty states of Figma `Empty state` (113:8501), prompt §9.21. */
export const EMPTY_STATES: Record<EmptyKind, EmptySpec> = {
  projects: {
    icon: 'folder-open',
    title: 'controls.empty.projects.title',
    body: 'controls.empty.projects.body',
    action: { label: 'controls.empty.projects.action', kind: 'primary' },
  },
  'no-runs': {
    icon: 'history',
    title: 'controls.empty.noRuns.title',
    body: 'controls.empty.noRuns.body',
    action: { label: 'controls.empty.noRuns.action', kind: 'secondary' },
  },
  'no-cards': {
    icon: 'list-todo',
    title: 'controls.empty.noCards.title',
    body: 'controls.empty.noCards.body',
    action: { label: 'ui.action.suggestChecks', kind: 'secondary' },
  },
  'no-model-needs': {
    icon: 'sparkles',
    title: 'controls.empty.noModelNeeds.title',
    body: 'controls.empty.noModelNeeds.body',
  },
  'no-matching-findings': {
    icon: 'list-filter',
    title: 'controls.empty.noMatchingFindings.title',
    body: 'controls.empty.noMatchingFindings.body',
    action: { label: 'controls.empty.noMatchingFindings.action', kind: 'secondary' },
  },
};
