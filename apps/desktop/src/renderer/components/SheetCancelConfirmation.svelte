<script lang="ts">
  // Sheet/Cancel confirmation (Figma 116:9269, 448 wide; ⌘. or «ألغِ» in the run bar): the consequence in body.
  // Footer: «ألغِ التشغيل» (secondary: outlined, no warning icon, not destructive, never red) · «تابِع» (primary,
  // the default). The focus opens on «تابِع», so Return keeps the run going.
  import { useLocale } from '../lib/locale.ts';
  import type { SheetMode } from '../lib/sheets.ts';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';

  interface Props extends SheetMode {
    /** «ألغِ التشغيل»: stop the run. */
    oncancelrun?: () => void;
  }
  let { oncancelrun, open, inline, oncancel }: Props = $props();
  const { t } = useLocale();
</script>

<Sheet title={t('sheets.cancelRun.title')} width="narrow" {open} {inline} {oncancel}>
  <p class="consequence">{t('sheets.cancelRun.consequence')}</p>
  {#snippet footer()}
    <Button onclick={oncancelrun}>{t('ui.action.cancelRun')}</Button>
    <Button kind="primary" data-initial-focus onclick={oncancel}>{t('sheets.cancelRun.continue')}</Button>
  {/snippet}
</Sheet>

<style>
  .consequence {
    margin: 0;
    font: var(--type-body);
    color: var(--text-primary);
  }
</style>
