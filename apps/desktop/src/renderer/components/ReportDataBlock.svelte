<script lang="ts">
  // Report data block (Figma 139:10354, C-30, DES-4 screen 8; D-DES4-03, D-DES4-11): a quoted block of project data
  // inside the «للنموذج» report, always read from the left. bg/sunken, radius/control, padding 8 12, gap 4. The
  // header: the neutral Tag «بيانات من المشروع» and the opening AYAR-DATA marker (mono, text/secondary); the lines
  // (mono, text/primary, kept as written), where a redaction shows as the Tag «مُخفى: …» while the copied text keeps
  // the literal marker; then the closing marker (mono, text/secondary).
  import type { LogSegment } from '../lib/evidence.ts';
  import { useLocale } from '../lib/locale.ts';
  import LogLineText from './LogLineText.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    /** The opening marker as written: «<<<AYAR-DATA 7f3a9c · source · range>>>». */
    opening: string;
    lines: readonly (readonly LogSegment[])[];
    /** The closing marker: «<<<END AYAR-DATA 7f3a9c>>>». */
    closing: string;
  }
  let { opening, lines, closing }: Props = $props();
  const { t } = useLocale();
</script>

<div class="block" dir="ltr">
  <div class="header">
    <Tag>{t('controls.reportData.label')}</Tag>
    <span class="marker">{opening}</span>
  </div>
  {#each lines as segments, i (i)}
    <div class="line"><LogLineText {segments} /></div>
  {/each}
  <span class="marker">{closing}</span>
</div>

<style>
  .block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    inline-size: 100%;
    min-width: 0;
    padding: var(--space-8) var(--space-12);
    border-radius: var(--radius-control);
    background: var(--bg-sunken);
    overflow-x: auto;
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .marker {
    font: var(--type-mono);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .line {
    font: var(--type-mono);
    color: var(--text-primary);
  }
</style>
