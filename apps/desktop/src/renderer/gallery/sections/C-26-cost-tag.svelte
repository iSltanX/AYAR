<script module lang="ts">
  export const meta = { id: 'C-26', title: 'Cost tag', figma: '103:2539', order: 126 };
</script>

<script lang="ts">
  import CostTag from '../../components/CostTag.svelte';
  import { COST_TAGS, type Cost } from '../../lib/tags.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const costs = Object.keys(COST_TAGS) as Cost[];
</script>

<Row title="Cost tag (103:2611)">
  {#each costs as cost (cost)}
    <Demo name="Cost tag/{cost}" figma="103:2611" h={18}><CostTag {cost} /></Demo>
  {/each}
</Row>
