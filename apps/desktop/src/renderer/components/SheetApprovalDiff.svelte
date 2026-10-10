<script lang="ts">
  // Sheet/Approval diff (Figma 114:8898): an intro line, then per changed check its checkbox (name) and id (mono,
  // text/tertiary), and a before/after block that is always left to right: bg/surface with a border/subtle edge,
  // radius/control, padding 4 0; each line 24 high, padding 2 8, gap 8, a 16 px sign column (mono,
  // text/secondary) then the line (mono, text/primary). Removed lines sit on bg/sunken with «−», added lines on
  // border/subtle with «+»: neutral shading, never red or green (D-16). Footer: «ألغِ» · «اعتمد المحدد» ·
  // «اعتمد الكل». The focus opens on «ألغِ».
  import { useLocale } from '../lib/locale.ts';
  import { DIFF_SIGNS, type CommandChange, type SheetMode } from '../lib/sheets.ts';
  import Button from './Button.svelte';
  import Checkbox from './Checkbox.svelte';
  import Sheet from './Sheet.svelte';

  interface Props extends SheetMode {
    changes: readonly CommandChange[];
    /** The ids of the selected checks (all by default). */
    selected?: string[];
    onapproveselected?: (ids: string[]) => void;
    onapproveall?: () => void;
  }
  let { changes, selected = $bindable(changes.map((c) => c.id)), onapproveselected, onapproveall, open, inline, oncancel }: Props = $props();
  const { t } = useLocale();

  function toggle(id: string, on: boolean) {
    selected = on ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id);
  }
</script>

<Sheet title={t('sheets.approvalDiff.title', { count: changes.length })} {open} {inline} {oncancel}>
  <p class="intro">{t('sheets.approvalDiff.intro')}</p>
  {#each changes as change (change.id)}
    <div class="change">
      <div class="head">
        <Checkbox checked={selected.includes(change.id)} label={change.name} onchange={(on: boolean) => toggle(change.id, on)} />
        <code class="id" dir="ltr">{change.id}</code>
      </div>
      <div class="diff" dir="ltr" role="group" aria-label={t('sheets.approvalDiff.diffLabel', { name: change.name })}>
        {#each change.lines as line, i (i)}
          <div class="line {line.kind}">
            <span class="sign" aria-hidden="true">{DIFF_SIGNS[line.kind]}</span>
            {#if line.kind !== 'context'}
              <span class="visually-hidden">{t(line.kind === 'removed' ? 'sheets.approvalDiff.removed' : 'sheets.approvalDiff.added')}</span>
            {/if}
            <code class="text">{line.text}</code>
          </div>
        {/each}
      </div>
    </div>
  {/each}
  {#snippet footer()}
    <Button data-initial-focus onclick={oncancel}>{t('ui.action.cancel')}</Button>
    <Button disabled={selected.length === 0} onclick={() => onapproveselected?.([...selected])}>{t('ui.action.approveSelected')}</Button>
    <Button kind="primary" onclick={onapproveall}>{t('ui.action.approveAll')}</Button>
  {/snippet}
</Sheet>

<style>
  .intro {
    margin: 0;
    font: var(--type-body);
    color: var(--text-secondary);
  }
  .change {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .id {
    font: var(--type-mono);
    color: var(--text-tertiary);
    unicode-bidi: isolate;
  }
  .diff {
    display: flex;
    flex-direction: column;
    padding: var(--space-4) 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    text-align: left;
    unicode-bidi: isolate;
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    min-block-size: 24px;
    padding: 2px var(--space-8);
  }
  .removed {
    background: var(--bg-sunken);
  }
  .added {
    background: var(--border-subtle);
  }
  .sign {
    flex: none;
    inline-size: 16px;
    font: var(--type-mono);
    color: var(--text-secondary);
  }
  .text {
    min-inline-size: 0;
    color: var(--text-primary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
