<script lang="ts">
  // Sheet/Baseline approval (Figma 116:9091): the capture (full width, 300 high, bg/surface with a border/subtle
  // edge; never mirrored), its full capture key as neutral Tags in two lines (state, size, theme, language |
  // platform, browser version, pixel density; gap 4), and the note (body/small). Footer: «ألغِ» · «اعتمد». The
  // focus opens on «ألغِ».
  import type { Snippet } from 'svelte';
  import { useLocale } from '../lib/locale.ts';
  import { CAPTURE_KEY_ROWS, type CaptureKey, type SheetMode } from '../lib/sheets.ts';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';
  import SheetField from './SheetField.svelte';
  import Tag from './Tag.svelte';

  interface Props extends SheetMode {
    /** The capture itself (an <img> of the screenshot, drawn left to right whatever the language). */
    capture: Snippet;
    captureKey: CaptureKey;
    onapprove?: () => void;
  }
  let { capture, captureKey, onapprove, open, inline, oncancel }: Props = $props();
  const { t } = useLocale();
</script>

<Sheet title={t('sheets.baseline.title')} {open} {inline} {oncancel}>
  <figure class="capture" dir="ltr" aria-label={t('sheets.baseline.capture')}>{@render capture()}</figure>
  <SheetField label={t('sheets.baseline.captureKey')}>
    <div class="key">
      {#each CAPTURE_KEY_ROWS as row, i (i)}
        <ul class="key-row">
          {#each row as [field, label] (field)}
            <li><Tag>{t(label)} {captureKey[field]}</Tag></li>
          {/each}
        </ul>
      {/each}
    </div>
  </SheetField>
  <p class="note">{t('sheets.baseline.note')}</p>
  {#snippet footer()}
    <Button data-initial-focus onclick={oncancel}>{t('ui.action.cancel')}</Button>
    <Button kind="primary" onclick={onapprove}>{t('ui.action.approve')}</Button>
  {/snippet}
</Sheet>

<style>
  .capture {
    position: relative;
    display: flex;
    block-size: 300px;
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
  }
  .key {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .key-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .key-row li {
    display: flex;
  }
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
