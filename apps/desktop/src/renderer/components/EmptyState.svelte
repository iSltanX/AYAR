<script lang="ts">
  // Empty state (Figma 113:8501, C-21): 480 wide, centred, padding 32, gap 12: a Lucide icon (24, text/secondary,
  // a 1.5 px stroke as in Figma), the title
  // (title/sub), one sentence (body, text/secondary, max 400) and at most one button. No illustration.
  import { EMPTY_STATES, type EmptyKind } from '../lib/empty-states.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import { useLocale } from '../lib/locale.ts';

  interface Props {
    kind: EmptyKind;
    /** The single action (add a project, show the plan, suggest checks, clear the filters). */
    onaction?: () => void;
  }
  let { kind, onaction }: Props = $props();
  const { t } = useLocale();
  const spec = $derived(EMPTY_STATES[kind]);
</script>

<div class="empty">
  <span class="icon"><Icon name={spec.icon} size={24} /></span>
  <p class="title">{t(spec.title)}</p>
  <p class="body">{t(spec.body)}</p>
  {#if spec.action}
    <Button kind={spec.action.kind} onclick={onaction}>{t(spec.action.label)}</Button>
  {/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-12);
    inline-size: 480px;
    max-inline-size: 100%;
    padding: var(--space-32);
    text-align: center;
  }
  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: 24px;
    block-size: 24px;
    color: var(--text-secondary);
  }
  .title,
  .body {
    inline-size: 100%;
    max-inline-size: 400px;
    margin: 0;
  }
  .title {
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .body {
    font: var(--type-body);
    color: var(--text-secondary);
  }
</style>
