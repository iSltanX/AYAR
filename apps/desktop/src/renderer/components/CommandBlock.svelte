<script lang="ts">
  // Command block (Figma 108:5868, C-12): the command line is mono, always left to right and left aligned, on
  // bg/sunken with radius/control, 28 high, padding 12 at the start of the text, gap 8; the copy icon button
  // (28×28) sits at the right end in both languages and copies the command only, through `oncopy`. Below, gap 8,
  // neutral tags for what running it does: runs project code, writes to the project (with its path, isolated left
  // to right), needs network (globe).
  import { useLocale } from '../lib/locale.ts';
  import IconButton from './IconButton.svelte';
  import LtrText from './LtrText.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    command: string;
    /** Running it executes project code. */
    runsCode?: boolean;
    /** Running it writes into the project; `writesPath` says where. */
    writes?: boolean;
    writesPath?: string;
    /** Running it needs the network. */
    network?: boolean;
    /** Receives the command text when the copy button is used (the caller writes the clipboard). */
    oncopy?: (text: string) => void;
  }
  let { command, runsCode = false, writes = false, writesPath, network = false, oncopy }: Props = $props();
  const { t } = useLocale();
</script>

<div class="command-block">
  <div class="line" dir="ltr">
    <code class="command">{command}</code>
    <IconButton icon="copy" label={t('results.command.copy')} onclick={() => oncopy?.(command)} />
  </div>
  {#if runsCode || writes || network}
    <ul class="flags">
      {#if runsCode}<li><Tag kind="neutral-icon" icon="file-text">{t('results.command.runsCode')}</Tag></li>{/if}
      {#if writes}
        <li>
          <Tag kind="neutral-icon" icon="file-text">
            {#if writesPath}{t('results.command.writesTo')} <LtrText text={writesPath} />{:else}{t('results.command.writesTo')}{/if}
          </Tag>
        </li>
      {/if}
      {#if network}<li><Tag kind="neutral-icon" icon="globe">{t('ui.cost.needsNetwork')}</Tag></li>{/if}
    </ul>
  {/if}
</div>

<style>
  .command-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
    width: 100%;
    min-width: 0;
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    align-self: stretch;
    min-height: 28px;
    padding-left: var(--space-12); /* physical: the command line is left to right in both languages */
    border-radius: var(--radius-control);
    background: var(--bg-sunken);
  }
  .command {
    flex: 1;
    min-width: 0;
    padding-block: var(--space-4);
    color: var(--text-primary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    unicode-bidi: isolate;
  }
  .flags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .flags li {
    display: flex;
  }
</style>
