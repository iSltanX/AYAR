<script lang="ts">
  // Banner (Figma 117:9737, C-20): the top of the content column, full width, at least 44 high, padding 8 16,
  // gap 12, bg/sunken with a 1 px border/subtle at the bottom; neutral (no status colour). A neutral icon
  // (file-check / info) and the message in body/strong. needs-approval ends with a secondary «Show diff…»
  // (it opens the approval diff sheet); engine-restarting ends with a body/small note and has a static info
  // icon, never a spinner (D-DES3-12): spinners are for «running» and «cancelling» only.
  import { useLocale } from '../lib/locale.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  type Props = { kind: 'needs-approval'; count: number; onshowdiff?: () => void } | { kind: 'engine-restarting' };
  let props: Props = $props();
  const { t } = useLocale();
</script>

<div class="banner {props.kind}" role={props.kind === 'engine-restarting' ? 'status' : undefined} data-kind={props.kind}>
  {#if props.kind === 'needs-approval'}
    <Icon name="file-check" size={16} />
    <span class="message">{t('shell.banner.needsApproval', { count: props.count })}</span>
    <span class="spacer"></span>
    <Button kind="secondary" onclick={() => props.kind === 'needs-approval' && props.onshowdiff?.()}>{t('shell.banner.showDiff')}</Button>
  {:else}
    <Icon name="info" size={16} />
    <span class="message">{t('shell.banner.engineRestarting')}</span>
    <span class="spacer"></span>
    <span class="detail">{t('shell.banner.monitoringResumes')}</span>
  {/if}
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    inline-size: 100%;
    min-height: 44px;
    padding: var(--space-8) var(--space-16);
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-sunken);
    color: var(--text-primary);
    white-space: nowrap;
  }
  .message {
    font: var(--type-body-strong);
  }
  .spacer {
    flex: 1;
    min-width: 0;
  }
  .detail {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
