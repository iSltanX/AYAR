<script lang="ts">
  // Risk notice (Figma 139:10350, C-30, DES-4 screen 3; D-DES4-03; FR-56): a neutral frame — bg/surface, a
  // border/strong edge, radius/card, padding 12 16, gap 12 — with Lucide triangle-alert (16), the title «أمر خطر: قد
  // يحذف ملفات أو يكتب خارج المشروع» (body/strong), a detail line (body/small, text/secondary) and its own «اعتمد
  // هذا الأمر» button at the end. Never red, and never part of «اعتمد الكل»: a dangerous command is approved alone.
  import { useLocale } from '../lib/locale.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    /** «اعتمد هذا الأمر»: approve this one instance on its own. */
    onapprove?: () => void;
    disabled?: boolean;
  }
  let { onapprove, disabled = false }: Props = $props();
  const { t } = useLocale();
</script>

<div class="risk-notice" role="group" aria-label={t('controls.risk.title')}>
  <span class="icon"><Icon name="triangle-alert" size={16} /></span>
  <div class="text">
    <p class="title">{t('controls.risk.title')}</p>
    <p class="detail">{t('controls.risk.detail')}</p>
  </div>
  <Button kind="secondary" {disabled} onclick={() => onapprove?.()}>{t('controls.risk.approve')}</Button>
</div>

<style>
  .risk-notice {
    display: flex;
    align-items: flex-start;
    gap: var(--space-12);
    padding: var(--space-12) var(--space-16);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .icon {
    display: flex;
    flex: none;
    padding-block-start: 4px;
    color: var(--text-primary);
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .title {
    margin: 0;
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .detail {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
