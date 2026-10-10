<script lang="ts">
  // A note line inside a sheet (Figma "install-scripts-note" / "screenshots-note" of C-19): Lucide info 16 in
  // text/secondary, gap 8, the text in body/small text/secondary.
  import Icon from './Icon.svelte';

  interface Props {
    text: string;
  }
  let { text }: Props = $props();
</script>

<p class="note">
  <span class="icon"><Icon name="info" size={16} /></span>
  <span>{text}</span>
</p>

<style>
  .note {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .icon {
    display: inline-flex;
    flex: none;
  }
</style>
