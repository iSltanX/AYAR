<script lang="ts">
  // The «للنموذج» text exactly as it is copied (D-DES4-11): read from the left in both languages — headings with
  // their «#», the template's meta comment, plain lines, and the quoted project data in Report data blocks; a
  // redaction shows as the Tag «مُخفى: …» where the copied text keeps the literal marker.
  import type { ReportBuilt } from '@ayar/protocol';
  import ReportDataBlock from '../../components/ReportDataBlock.svelte';
  import Tag from '../../components/Tag.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { parseModelReport } from '../../app/modelReport.ts';

  let { built }: { built: ReportBuilt } = $props();
  const { t, lang } = useLocale();
  const blocks = $derived(parseModelReport(t, lang, built.model.text, built.report.token));
</script>

<article class="report" dir="ltr" lang={built.lang} aria-label={t('glossary.reportForModel')}>
  {#each blocks as b, i (i)}
    {#if b.kind === 'data'}
      <ReportDataBlock opening={b.opening} lines={b.lines} closing={b.closing} />
    {:else}
      <p class={b.kind}>
        {#each b.segments as s, j (j)}{#if s.kind === 'text'}{s.text}{:else}<span class="redaction"><Tag>{t('results.log.redacted', { what: s.what })}</Tag></span>{/if}{/each}
      </p>
    {/if}
  {/each}
</article>

<style>
  .report {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    text-align: left;
  }
  p {
    margin: 0;
    font: var(--type-body);
    color: var(--text-primary);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .h1 {
    font: var(--type-title-section);
  }
  .h2 {
    font: var(--type-title-sub);
  }
  .h3 {
    font: var(--type-body-strong);
  }
  .meta {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .redaction {
    display: inline-flex;
    vertical-align: middle;
  }
</style>
