<script module lang="ts">
  export const meta = { id: 'C-17', title: 'Tables', figma: '112:7799', order: 117 };
</script>

<script lang="ts">
  import Table from '../../components/Table.svelte';
  import TableGroupRow from '../../components/TableGroupRow.svelte';
  import TableHeaderCell from '../../components/TableHeaderCell.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import type { Finding, FindingGroup } from '../../lib/results.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang, dir, t } = useLocale();
  const title = { ar: 'رمز وصول GitHub مكتوب في ملف الإعداد', en: 'GitHub access token written in a config file' }[lang];
  const finding = (id: string): Finding => ({
    id,
    severity: 'high',
    proof: 'proven',
    title,
    location: { path: 'src/config/deploy.ts', line: 14 },
    check: 'sec.secrets',
    crossRun: 'new',
  });
  const groups: FindingGroup[] = [
    { id: 'security', title: t('ui.section.security'), findings: [finding('F-1'), finding('F-2'), finding('F-3')] },
    { id: 'code', title: t('ui.section.code'), findings: [], count: 5 },
  ];
  const label = t('glossary.severity');
  const cellWidth = { rtl: { plain: 50, sorted: 70 }, ltr: { plain: 61, sorted: 81 } }[dir];
  const sorts = [
    { name: 'default', sort: undefined, w: cellWidth.plain },
    { name: 'sorted-asc', sort: 'asc', w: cellWidth.sorted },
    { name: 'sorted-desc', sort: 'desc', w: cellWidth.sorted },
  ] as const;
</script>

<Row title="Table header cell (112:7887) · State default / sorted-asc / sorted-desc (hover shows arrow-up-down; focus is a CSS state) · aria-sort">
  {#each sorts as s (s.name)}
    <Demo name="Table header cell/{s.name}" figma="112:7887" h={32} w={s.w}>
      <div class="inline" role="table" aria-label={label}>
        <div class="inline" role="row"><TableHeaderCell {label} sort={s.sort} /></div>
      </div>
    </Demo>
  {/each}
</Row>

<Row title="Table group row (112:7977) · Expanded true / false (hover and focus are CSS states) · 720 wide">
  {#each [true, false] as expanded (expanded)}
    <div class="scroll">
      <Demo name="Table group row/{expanded ? 'expanded' : 'collapsed'}" figma="112:7977" h={32} w={720}>
        <div class="frame" role="grid" aria-label={t('ui.tab.findings')}>
          <TableGroupRow title={t('ui.section.security')} count={3} {expanded} />
        </div>
      </Demo>
    </div>
  {/each}
</Row>

<Row title="Table (112:8213) · Kind=findings: select all (mixed), sorted by severity, an expanded and a collapsed group, one selected row">
  <div class="scroll">
    <Demo name="Table/findings" figma="112:8213" h={193} w={720}>
      <div class="frame">
        <Table label={t('ui.tab.findings')} {groups} selected={['F-2']} collapsed={['code']} sort={{ column: 'severity', direction: 'desc' }} />
      </div>
    </Demo>
  </div>
</Row>

<style>
  .inline {
    display: inline-flex;
  }
  .scroll {
    width: 100%;
    overflow-x: auto;
    padding: var(--space-8);
  }
  .frame {
    display: flex;
    width: 720px;
  }
</style>
