<script lang="ts">
  // Sheet/Save group (Figma 115:8941): the name (Text field, full width) and the selected checks (name in body
  // text/primary, gap 8, id in mono text/tertiary; rows gap 4). Footer: «ألغِ» · «احفظ». Saved groups appear at
  // the end of the Run menu (lib/menus.ts). The focus opens on the name field.
  import { useLocale } from '../lib/locale.ts';
  import type { CheckRef, SheetMode } from '../lib/sheets.ts';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';
  import SheetField from './SheetField.svelte';
  import TextField from './TextField.svelte';

  interface Props extends SheetMode {
    checks: readonly CheckRef[];
    name?: string;
    onsave?: (name: string) => void;
  }
  let { checks, name = $bindable(''), onsave, open, inline, oncancel }: Props = $props();
  const { t } = useLocale();
  const uid = $props.id();
</script>

<Sheet title={t('sheets.saveGroup.title')} {open} {inline} {oncancel}>
  <SheetField label={t('sheets.saveGroup.name')} for="{uid}-name">
    <TextField id="{uid}-name" bind:value={name} width="fill" data-initial-focus />
  </SheetField>
  <SheetField label={t('sheets.saveGroup.selected', { count: checks.length })} labelId="{uid}-checks">
    <ul class="checks" aria-labelledby="{uid}-checks">
      {#each checks as check (check.id)}
        <li class="check">
          <span class="name">{check.name}</span>
          <code class="id" dir="ltr">{check.id}</code>
        </li>
      {/each}
    </ul>
  </SheetField>
  {#snippet footer()}
    <Button onclick={oncancel}>{t('ui.action.cancel')}</Button>
    <Button kind="primary" disabled={name.trim() === ''} onclick={() => onsave?.(name.trim())}>{t('sheets.saveGroup.save')}</Button>
  {/snippet}
</Sheet>

<style>
  .checks {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .name {
    font: var(--type-body);
    color: var(--text-primary);
  }
  .id {
    font: var(--type-mono);
    color: var(--text-tertiary);
    unicode-bidi: isolate;
  }
</style>
