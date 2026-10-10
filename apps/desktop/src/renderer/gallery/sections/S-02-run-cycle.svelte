<script module lang="ts">
  export const meta = { id: 'S-02', title: 'Run cycle: cycle indicator', figma: '76:1317', order: 2 };
</script>

<script lang="ts">
  import CycleIndicator from '../../components/CycleIndicator.svelte';
  import { CYCLES } from '../../lib/status.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const motions = ['animated', 'static'] as const;
  const sizes = ['md', 'sm'] as const;
</script>

{#each motions as motion (motion)}
  <Row title="Cycle indicator (70:426) · {motion} · md, sm">
    {#each CYCLES as cycle (cycle)}
      {#each sizes as size (size)}
        <Demo name="Cycle indicator/{cycle}/{motion}/{size}" figma="70:426" h={20}><CycleIndicator {cycle} {motion} {size} /></Demo>
      {/each}
    {/each}
  </Row>
{/each}
