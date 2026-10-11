<script lang="ts">
  // «الاكتشافات» (13.3, 9.17, 9.22; Figma 7.3 153:29866): the search and the filters (grouping, severity, proof), the
  // selection bar when findings are selected (their scope becomes the copy's, and «أعد فحص المحدد»), then the
  // findings table by group, and the count line. Selecting never adds a copy button: the one «انسخ للنموذج» is
  // above (D-40).
  import type { Finding, Proof, Severity } from '@ayar/protocol';
  import SearchField from '../../components/SearchField.svelte';
  import Select from '../../components/Select.svelte';
  import SelectionBar from '../../components/SelectionBar.svelte';
  import Table from '../../components/Table.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { findingGroups, findingTitle, type FindingGrouping } from '../../app/results.ts';

  interface Props {
    findings: readonly Finding[];
    excludedByReview: number;
    selected: string[];
    grouping: FindingGrouping;
    onselectionchange?: (ids: string[]) => void;
    ongroupingchange?: (grouping: FindingGrouping) => void;
    onopen?: (id: string) => void;
    onrecheck?: () => void;
  }
  let { findings, excludedByReview, selected, grouping, onselectionchange, ongroupingchange, onopen, onrecheck }: Props = $props();
  const { t, lang } = useLocale();

  let query = $state('');
  let severity = $state<'all' | Severity>('all');
  let proof = $state<'all' | Proof>('all');
  let collapsed = $state<string[]>([]);

  const shown = $derived(
    findings.filter((f) => {
      if (severity !== 'all' && f.severity !== severity) return false;
      if (proof !== 'all' && f.proof !== proof) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return [findingTitle(t, lang, f), f.displayId, f.checkId, f.location?.path ?? '', f.message].some((x) => x.toLowerCase().includes(q));
    }),
  );
  const groups = $derived(findingGroups(t, lang, shown, grouping));
  const checks = $derived(new Set(findings.map((f) => f.checkId)).size);

  type Opt<T extends string> = { value: T; label: string };
  const groupingOptions = $derived<Opt<FindingGrouping>[]>((['check', 'section', 'severity', 'none'] as const).map((g) => ({ value: g, label: t('resultsui.findings.grouping', { value: t(`resultsui.findings.grouping.${g}`) }) })));
  const severityOptions = $derived<Opt<'all' | Severity>[]>([
    { value: 'all', label: t('resultsui.findings.severity', { value: t('resultsui.findings.all') }) },
    ...(['critical', 'high', 'medium', 'low', 'info'] as const).map((s) => ({ value: s, label: t('resultsui.findings.severity', { value: t(`ui.severity.${s}`) }) })),
  ]);
  const proofOptions = $derived<Opt<'all' | Proof>[]>([
    { value: 'all', label: t('resultsui.findings.proof', { value: t('resultsui.findings.all') }) },
    ...(['proven', 'suspected', 'suggestion'] as const).map((p) => ({ value: p, label: t('resultsui.findings.proof', { value: t(`glossary.proof.${p}`) }) })),
  ]);
  type SelectEvent = Event & { currentTarget: HTMLSelectElement };
</script>

<div class="findings">
  <div class="filters">
    <SearchField bind:value={query} width="fill" />
    <Select value={grouping} options={groupingOptions} label={t('resultsui.findings.grouping', { value: '' })} onchange={(e: SelectEvent) => ongroupingchange?.(e.currentTarget.value as FindingGrouping)} />
    <Select bind:value={severity} options={severityOptions} label={t('glossary.severity')} />
    <Select bind:value={proof} options={proofOptions} label={t('results.table.column.proof')} />
  </div>

  {#if selected.length}
    <div class="selection"><SelectionBar kind="findings" count={selected.length} onrecheck={() => onrecheck?.()} onclear={() => onselectionchange?.([])} /></div>
  {/if}

  {#if !findings.length}
    <p class="empty">{t('resultsui.findings.empty')}</p>
  {:else if !shown.length}
    <p class="empty">{t('resultsui.findings.noMatch')}</p>
  {:else}
    <Table label={t('ui.tab.findings')} {groups} {selected} bind:collapsed onselectionchange={(ids: string[]) => onselectionchange?.(ids)} onopen={(id: string) => onopen?.(id)} />
    <p class="footer">{t('resultsui.findings.footer', { count: shown.length, checks, excluded: excludedByReview })}</p>
  {/if}
</div>

<style>
  .findings {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .filters > :global(:first-child) {
    flex: 1 1 240px;
  }
  .selection {
    display: flex;
    justify-content: center;
  }
  .empty,
  .footer {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
