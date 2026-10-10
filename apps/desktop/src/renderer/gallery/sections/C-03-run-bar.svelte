<script module lang="ts">
  export const meta = { id: 'C-03', title: 'Run bar', figma: '102:1316', order: 103 };
</script>

<script lang="ts">
  import RunBar from '../../components/RunBar.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import type { ResultCount, RunBarStatus } from '../../lib/shell.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { t } = useLocale();
  const statuses: RunBarStatus[] = ['running', 'cancelling'];
  const counts: ResultCount[] = [
    { result: 'passed', count: 5 },
    { result: 'failed', count: 1 },
    { result: 'warning', count: 1 },
  ];
</script>

<Row title="Run bar (102:1452) · Status running / cancelling">
  {#each statuses as status (status)}
    <div class="scroll">
      <div class="frame">
        <Demo name="Run bar/{status}" figma="102:1452" h={40} w={1120} width="fill">
          <RunBar {status} kind={t('shell.runBar.kind.fullScan')} done={7} total={18} elapsed={134} {counts} />
        </Demo>
      </div>
    </div>
  {/each}
</Row>

<style>
  .scroll {
    width: 100%;
    overflow-x: auto;
  }
  .frame {
    width: 1120px;
  }
</style>
