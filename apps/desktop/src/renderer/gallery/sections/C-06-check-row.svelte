<script module lang="ts">
  export const meta = { id: 'C-06', title: 'Check row', figma: '103:2672', order: 106 };
</script>

<script lang="ts">
  import CheckRow from '../../components/CheckRow.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import type { LogTailLine } from '../../lib/results.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  const S = {
    ar: { name: 'اختبارات الوحدة', step: 'يشغّل vitest', findings: ['يختلف ناتج توحيد الألف عن المتوقع', 'اختبار ينتظر ملفًا غير موجود'] },
    en: { name: 'Unit tests', step: 'Running vitest', findings: ['Alef normalisation differs from expected', 'A test waits for a missing file'] },
  }[lang];
  const logTail: LogTailLine[] = [
    { text: '✓ normalize › trims spaces (4 ms)', muted: true },
    { text: '✓ normalize › keeps diacritics (2 ms)', muted: true },
    { text: '✗ normalize › folds alef forms' },
  ];
  const running = { step: S.step, stepDone: 12, stepTotal: 40, lastActivitySeconds: 3, provisionalCount: 2, duration: '1:42' };
  const states = [false, true] as const;
</script>

<Row title="Check row (104:4196) · Status=queued · State default / selected (hover and focus are CSS states) · fills its container (720)">
  {#each states as selected (selected)}
    <div class="w720">
      <Demo name="Check row/queued/{selected ? 'selected' : 'default'}" figma="104:4196" h={40} w={720}>
        <div class="frame"><CheckRow status="queued" name={S.name} id="beh.unit" {selected} /></div>
      </Demo>
    </div>
  {/each}
</Row>

<Row title="Check row · Status=running (step · count · process activity · last activity; «2 provisional»; Cancel, Log)">
  {#each states as selected (selected)}
    <div class="w720">
      <Demo name="Check row/running/{selected ? 'selected' : 'default'}" figma="104:4196" h={56} w={720}>
        <div class="frame"><CheckRow status="running" name={S.name} id="beh.unit" {...running} {selected} /></div>
      </Demo>
    </div>
  {/each}
  <div class="w720">
    <Demo name="Check row/running/silence-note" figma="104:4196" h={76} w={720}>
      <div class="frame"><CheckRow status="running" name={S.name} id="beh.unit" {...running} silentFor="2:10" /></div>
    </Demo>
  </div>
</Row>

<Row title="Check row · Status=final (any result: Result badge sm)">
  {#each states as selected (selected)}
    <div class="w720">
      <Demo name="Check row/final/{selected ? 'selected' : 'default'}" figma="104:4196" h={40} w={720}>
        <div class="frame"><CheckRow status="failed" name={S.name} id="beh.unit" duration="2:05" {selected} /></div>
      </Demo>
    </div>
  {/each}
  <div class="w720">
    <Demo name="Check row/final/passed-reviewed" figma="104:4196" h={40} w={720}>
      <div class="frame"><CheckRow status="passed-reviewed" name={S.name} id="beh.unit" duration="2:05" /></div>
    </Demo>
  </div>
</Row>

<Row title="Check row · Status=running-expanded (log tail and provisional findings)">
  <div class="w720">
    <Demo name="Check row/running-expanded" figma="104:4196" h={256} w={720}>
      <div class="frame">
        <CheckRow status="running" name={S.name} id="beh.unit" {...running} expanded {logTail} provisionalFindings={S.findings} />
      </div>
    </Demo>
  </div>
</Row>

<style>
  .w720 {
    width: 100%;
    overflow-x: auto;
    padding: var(--space-8);
  }
  .frame {
    display: flex;
    width: 720px;
  }
</style>
