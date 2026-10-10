<script lang="ts">
  // Sheet/Setup panel (Figma 115:9207): an intro line, then one card per proposed setup action (bg/surface,
  // border/subtle, radius/card, padding 12, gap 4): the title (body/strong) with its state Tag at the end (6.7:
  // في الانتظار · جارٍ with the blue cycle symbol, the only exception · اكتمل · توقف بخطأ), what is missing and
  // how many checks wait on it (body/small, text/secondary), the «يكتب في المشروع» flag when needed, then quiet
  // «معاينة» and «السجل» and, at the end, «نفّذ…» (secondary; it opens its own confirmation). Footer: «أغلق»,
  // which also receives the focus first.
  import { useLocale } from '../lib/locale.ts';
  import type { SetupAction, SheetMode } from '../lib/sheets.ts';
  import { SETUP_TAGS, tagIcon } from '../lib/tags.ts';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';
  import Tag from './Tag.svelte';

  interface Props extends SheetMode {
    actions: readonly SetupAction[];
    onpreview?: (id: string) => void;
    onlog?: (id: string) => void;
    onapply?: (id: string) => void;
  }
  let { actions, onpreview, onlog, onapply, open, inline, oncancel }: Props = $props();
  const { t, dir } = useLocale();
</script>

<Sheet title={t('sheets.setupPanel.title')} {open} {inline} {oncancel}>
  <p class="intro">{t('sheets.setupPanel.intro')}</p>
  <ul class="actions">
    {#each actions as action (action.id)}
      {@const spec = SETUP_TAGS[action.state]}
      <li class="action">
        <div class="head">
          <h3 class="title">{action.title}</h3>
          {#if 'symbol' in spec}
            <Tag kind={spec.kind} symbol={spec.symbol}>{t(spec.key)}</Tag>
          {:else}
            <Tag kind={spec.kind} icon={tagIcon(spec, dir)}>{t(spec.key)}</Tag>
          {/if}
        </div>
        <p class="line">{t('sheets.setupPanel.missing', { what: action.missing })}</p>
        <p class="line">{t('sheets.setupPanel.waiting', { count: action.waiting })}</p>
        {#if action.writesToProject}
          <div class="flags"><Tag kind="neutral-icon" icon="file-text">{t('sheets.setupPanel.writesToProject')}</Tag></div>
        {/if}
        <div class="buttons">
          <Button kind="quiet" onclick={() => onpreview?.(action.id)}>{t('sheets.setupPanel.preview')}</Button>
          <Button kind="quiet" onclick={() => onlog?.(action.id)}>{t('controls.tab.log')}</Button>
          {#if action.canApply}
            <span class="apply"><Button onclick={() => onapply?.(action.id)}>{t('ui.action.apply')}</Button></span>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
  {#snippet footer()}
    <Button data-initial-focus onclick={oncancel}>{t('sheets.close')}</Button>
  {/snippet}
</Sheet>

<style>
  .intro {
    margin: 0;
    font: var(--type-body);
    color: var(--text-secondary);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .action {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-12);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    align-self: stretch;
    min-block-size: 24px;
  }
  .title {
    margin: 0;
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .line {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .flags {
    display: flex;
    gap: var(--space-4);
  }
  .buttons {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    align-self: stretch;
  }
  .apply {
    display: flex;
    margin-inline-start: auto;
  }
</style>
