<script lang="ts">
  // Nav group header (Figma 101:893, C-02): 224x28, padding 0 8, label style in text/tertiary. Not
  // interactive; the id lets a group name itself after it (aria-labelledby).
  interface Props {
    label: string;
    id?: string;
  }
  let { label, id }: Props = $props();
</script>

<div class="group-header" {id}>{label}</div>

<style>
  .group-header {
    display: flex;
    flex: none;
    align-items: center;
    inline-size: 224px;
    max-inline-size: 100%;
    height: 28px;
    padding: 0 var(--space-8);
    color: var(--text-tertiary);
    font: var(--type-label);
  }
</style>
