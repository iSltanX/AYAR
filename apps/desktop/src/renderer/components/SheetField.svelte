<script lang="ts">
  // A labelled field inside a sheet (Figma "field" frames of C-19): the key in the label style (text/secondary),
  // gap 4, then the value or control, aligned to the start. `for` ties the key to a form control.
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    /** The id of the control the key labels (a <label for>); otherwise the key is plain text. */
    for?: string;
    /** An id for the key, for controls labelled with aria-labelledby (a radio group). */
    labelId?: string;
    children: Snippet;
  }
  let { label, for: forId, labelId, children }: Props = $props();
</script>

<div class="field">
  {#if forId}
    <label class="key" for={forId} id={labelId}>{label}</label>
  {:else}
    <span class="key" id={labelId}>{label}</span>
  {/if}
  {@render children()}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .key {
    font: var(--type-label);
    color: var(--text-secondary);
  }
</style>
