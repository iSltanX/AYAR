<script lang="ts">
  // Toast (Figma 117:9781, C-20): after a copy. 36 high, padding 0 16, bg/elevated, 1 px border/subtle,
  // radius/card, shadow/overlay, a body message and no icon or button. It names what was copied: the report for
  // the model with its character count, a card id or an instructions id (ids isolated left to right,
  // D-DES3-04). It is drawn inside ToastRegion, the polite live region that stays mounted so the message is
  // announced; the caller shows it for 4 s.
  import { useLocale } from '../lib/locale.ts';
  import { SLOT, splitAround, type ToastMessage } from '../lib/shell.ts';
  import LtrText from './LtrText.svelte';

  let props: ToastMessage = $props();
  const { t } = useLocale();
  const parts = $derived(
    props.kind === 'report'
      ? ([t('shell.toast.report', { count: props.count }), ''] as const)
      : splitAround(t(props.kind === 'card' ? 'shell.toast.card' : props.kind === 'created' ? 'shell.toast.created' : 'shell.toast.instructions', { id: SLOT }), SLOT),
  );
</script>

<div class="toast" data-kind={props.kind}>
  <span class="message"
    >{parts[0]}{#if props.kind !== 'report'}<LtrText text={props.id} />{/if}{parts[1]}</span
  >
</div>

<style>
  .toast {
    display: inline-flex;
    align-items: center;
    height: 36px;
    padding: 0 var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-overlay);
    color: var(--text-primary);
    font: var(--type-body);
    white-space: nowrap;
  }
</style>
