<script lang="ts">
  // Term tooltip (Figma 113:8539, C-21): at most 280 wide, bg/elevated, border/subtle, radius/control,
  // shadow/overlay, padding 8/12, gap 4: the term (body/strong, text/primary) and its meaning from prompt §11
  // (body/small, text/secondary). role=tooltip; Term opens it on hover and on keyboard focus.
  interface Props {
    id?: string;
    term: string;
    meaning: string;
  }
  let { id, term, meaning }: Props = $props();
</script>

<div class="tooltip" role="tooltip" {id}>
  <span class="term">{term}</span>
  <span class="meaning">{meaning}</span>
</div>

<style>
  .tooltip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    inline-size: max-content;
    max-inline-size: 280px;
    padding: var(--space-8) var(--space-12);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-control);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-overlay);
    text-align: start;
  }
  .term {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .meaning {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
