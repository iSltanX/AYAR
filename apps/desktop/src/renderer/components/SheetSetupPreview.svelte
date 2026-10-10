<script lang="ts">
  // Sheet/Setup preview (Figma 114:8794): what will run (Command block with its flags, at most 480 wide), the
  // network destination (mono), the size, the write location (Path pill), the install-scripts note and
  // «عطّل سكربتات التثبيت». Footer: «ألغِ» · «نفّذ…» (primary; the engine executes with a token bound to this
  // preview). The focus opens on «ألغِ».
  import { formatNumber } from '@ayar/i18n';
  import { untrack } from 'svelte';
  import { useLocale } from '../lib/locale.ts';
  import { sheetResetKey, sheetResetter, type SetupPreviewData, type SheetMode } from '../lib/sheets.ts';
  import Button from './Button.svelte';
  import Checkbox from './Checkbox.svelte';
  import CommandBlock from './CommandBlock.svelte';
  import LtrText from './LtrText.svelte';
  import PathPill from './PathPill.svelte';
  import Sheet from './Sheet.svelte';
  import SheetField from './SheetField.svelte';
  import SheetNote from './SheetNote.svelte';

  interface Props extends SheetMode {
    data: SetupPreviewData;
    disableInstallScripts?: boolean;
    onapply?: (opts: { disableInstallScripts: boolean }) => void;
    /** Receives a command or path to copy (the caller writes the clipboard). */
    oncopy?: (text: string) => void;
  }
  let { data, disableInstallScripts = $bindable(false), onapply, oncopy, open, inline, oncancel }: Props = $props();
  const { t, lang } = useLocale();

  // Reset on every opening and when the preview changes (Sheet.svelte contract).
  const shouldReset = sheetResetter();
  $effect.pre(() => {
    if (shouldReset(open, sheetResetKey(data))) untrack(() => (disableInstallScripts = false));
  });
</script>

<Sheet title={t('sheets.setupPreview.title', { action: data.action })} {open} {inline} {oncancel}>
  <SheetField label={t('sheets.setupPreview.whatRuns')}>
    <div class="command">
      <CommandBlock
        command={data.command}
        runsCode={data.runsCode}
        writes={data.writePath !== undefined}
        writesPath={data.writePath}
        network={data.networkDestination !== undefined}
        {oncopy}
      />
    </div>
  </SheetField>
  {#if data.networkDestination}
    <SheetField label={t('sheets.setupPreview.network')}>
      <span class="value mono"><LtrText text={data.networkDestination} mono /></span>
    </SheetField>
  {/if}
  <SheetField label={t('sheets.setupPreview.size')}>
    <span class="value">{t('sheets.setupPreview.sizeAbout', { mb: formatNumber(data.sizeMb, lang) })}</span>
  </SheetField>
  {#if data.writePath}
    <SheetField label={t('sheets.setupPreview.writeLocation')}>
      <PathPill path={data.writePath} {oncopy} />
    </SheetField>
  {/if}
  <SheetNote text={t('sheets.setupPreview.installScriptsNote')} />
  <Checkbox bind:checked={disableInstallScripts} label={t('sheets.setupPreview.disableInstallScripts')} />
  {#snippet footer()}
    <Button data-initial-focus onclick={oncancel}>{t('ui.action.cancel')}</Button>
    <Button kind="primary" onclick={() => onapply?.({ disableInstallScripts })}>{t('ui.action.apply')}</Button>
  {/snippet}
</Sheet>

<style>
  .command {
    display: flex;
    inline-size: 100%;
    max-inline-size: 480px;
  }
  .value {
    font: var(--type-body);
    color: var(--text-primary);
  }
  .value.mono {
    font: var(--type-mono);
  }
</style>
