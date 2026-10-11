<script lang="ts">
  // One panel of a section page (13.3 «لوحات خاصة بكل قسم»; Figma 10.2–15.1): its title, the check it reads with its
  // latest result at the end of the head, an optional line that says what the panel shows and what it does not judge,
  // and its body. A check that has not run says so, and a panel never shows a result it did not read.
  import type { Snippet } from 'svelte';
  import ResultBadge from '../../components/ResultBadge.svelte';
  import type { BadgeResult } from '../../lib/status.ts';

  interface Props {
    title: string;
    /** The check id the panel reads (mono, left to right). */
    checkId?: string;
    result?: BadgeResult;
    /** Extra tags beside the result (a cost tag: «يحتاج شبكة»). */
    tags?: Snippet;
    note?: string;
    actions?: Snippet;
    testid?: string;
    children: Snippet;
  }
  let { title, checkId, result, tags, note, actions, testid, children }: Props = $props();
  const uid = $props.id();
</script>

<section class="panel" aria-labelledby="{uid}-title" data-testid={testid} data-check={checkId}>
  <div class="head">
    <h2 class="title" id="{uid}-title">{title}</h2>
    <span class="spacer"></span>
    {#if actions}{@render actions()}{/if}
    {#if tags}{@render tags()}{/if}
    {#if result}<ResultBadge {result} size="sm" />{/if}
    {#if checkId}<bdi class="id" dir="ltr">{checkId}</bdi>{/if}
  </div>
  {#if note}<p class="note">{note}</p>{/if}
  {@render children()}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .spacer {
    flex: 1;
  }
  .id {
    font: var(--type-mono);
    color: var(--text-secondary);
  }
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
