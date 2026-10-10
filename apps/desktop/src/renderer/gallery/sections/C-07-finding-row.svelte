<script module lang="ts">
  export const meta = { id: 'C-07', title: 'Finding row', figma: '103:3805', order: 107 };
</script>

<script lang="ts">
  import FindingRow from '../../components/FindingRow.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import type { Finding } from '../../lib/results.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang, t } = useLocale();
  const title = { ar: 'رمز وصول GitHub مكتوب في ملف الإعداد', en: 'GitHub access token written in a config file' }[lang];
  const base: Finding = {
    id: 'F-1',
    severity: 'high',
    proof: 'proven',
    title,
    location: { path: 'src/config/deploy.ts', line: 14 },
    check: 'sec.secrets',
    crossRun: 'new',
  };
  const specimens = [
    { name: 'default', finding: base, selected: false },
    { name: 'selected', finding: base, selected: true },
    { name: 'provisional', finding: { ...base, provisional: true }, selected: false },
    { name: 'model-claim · resolved', finding: { ...base, proof: 'model-claim', crossRun: 'resolved' } as Finding, selected: false },
    { name: 'arabic folders', finding: { ...base, location: { path: 'مشاريع/الإعداد/deploy.ts', line: 14 } }, selected: false },
  ];
</script>

<Row title="Finding row (103:4015) · State default / selected (hover and focus are CSS states) · Provisional · 720 wide">
  {#each specimens as s (s.name)}
    <div class="scroll">
      <Demo name="Finding row/{s.name}" figma="103:4015" h={32} w={720}>
        <div class="frame" role="table" aria-label={t('ui.tab.findings')}>
          <FindingRow finding={s.finding} selected={s.selected} />
        </div>
      </Demo>
    </div>
  {/each}
</Row>

<style>
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
