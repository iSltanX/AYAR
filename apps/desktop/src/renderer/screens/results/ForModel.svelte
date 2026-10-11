<script lang="ts">
  // «للنموذج» (12.3, 12.4, 12.6, D-DES4-11; Figma 8.1 160:52480, 8.2 the limit notice 160:53028): the exact text
  // «انسخ للنموذج» copies for the chosen scope, read from the left: its options (the report's language, the longer
  // evidence appendix), the preview note, the limit notice when the engine cut it (12.5 rule 2, with the way to
  // split it), and the text itself — headings, lines and the quoted project data in Report data blocks.
  import type { Lang } from '@ayar/i18n';
  import type { ReportBuilt } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import Icon from '../../components/Icon.svelte';
  import Select from '../../components/Select.svelte';
  import Switch from '../../components/Switch.svelte';
  import LtrText from '../../components/LtrText.svelte';
  import { SLOT, splitAround } from '../../lib/shell.ts';
  import { useLocale } from '../../lib/locale.ts';
  import { reasonText } from '../../app/format.ts';
  import ModelReportText from './ModelReportText.svelte';

  interface Props {
    built: ReportBuilt | null;
    reportLang: Lang;
    longEvidence: boolean;
    onlangchange?: (lang: Lang) => void;
    onlongevidencechange?: (on: boolean) => void;
    /** «قسّم حسب القسم». */
    onsplit?: () => void;
  }
  let { built, reportLang, longEvidence, onlangchange, onlongevidencechange, onsplit }: Props = $props();
  const { t, lang } = useLocale();

  const options = $derived((['ar', 'en'] as const).map((l) => ({ value: l, label: t('resultsui.forModel.language', { lang: t(`resultsui.forModel.lang.${l}`) }) })));
  const marker = '⟦redacted:github-token⟧';
  const preview = $derived(splitAround(t('resultsui.forModel.preview', { marker: SLOT }), SLOT));
</script>

<div class="for-model">
  <div class="options">
    <Select value={reportLang} {options} label={t('resultsui.forModel.language', { lang: '' })} onchange={(e: Event & { currentTarget: HTMLSelectElement }) => onlangchange?.(e.currentTarget.value === 'en' ? 'en' : 'ar')} />
    <Switch checked={longEvidence} label={t('resultsui.forModel.longEvidence')} onchange={(on: boolean) => onlongevidencechange?.(on)} />
  </div>
  <p class="note">{preview[0]}<LtrText text={marker} />{preview[1]}</p>

  {#if built?.blocked}
    <div class="card notice" role="alert">
      <Icon name="triangle-alert" size={16} />
      <p class="body">{t('resultsui.forModel.blocked', { where: built.blocked.where })}</p>
    </div>
  {:else if built?.model.truncated}
    <div class="card notice">
      <Icon name="info" size={16} />
      <p class="body">{reasonText(t, lang, built.model.splitSuggestion)}</p>
      <Button kind="secondary" onclick={() => onsplit?.()}>{t('resultsui.forModel.split')}</Button>
    </div>
  {/if}

  {#if built}
    <div class="card report"><ModelReportText {built} /></div>
  {/if}
</div>

<style>
  .for-model {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }
  .options {
    display: flex;
    align-items: center;
    gap: var(--space-16);
  }
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .card {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .notice {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-16);
  }
  .notice .body {
    flex: 1;
    min-width: 0;
    margin: 0;
    font: var(--type-body);
  }
  .report {
    padding: var(--space-24);
  }
</style>
