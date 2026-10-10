<script module lang="ts">
  export const meta = { id: 'S-01', title: 'Status symbols, result and readiness badges', figma: '75:821', order: 1 };
</script>

<script lang="ts">
  import ReadinessBadge from '../../components/ReadinessBadge.svelte';
  import ResultBadge from '../../components/ResultBadge.svelte';
  import StatusSymbol from '../../components/StatusSymbol.svelte';
  import { BADGE_RESULTS, CYCLES, READINESS, RESULTS } from '../../lib/status.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const sizes = [12, 16, 20] as const;
</script>

{#each sizes as size (size)}
  <Row title="Status symbol (67:394) · size {size}">
    {#each [...RESULTS, ...CYCLES] as symbol (symbol)}
      <Demo name="Status symbol/{symbol}/{size}" figma="67:394" h={size} w={size}><StatusSymbol {symbol} {size} alone /></Demo>
    {/each}
  </Row>
{/each}

<Row title="Result badge (70:276) · md">
  {#each BADGE_RESULTS as result (result)}
    <Demo name="Result badge/{result}/md" figma="70:276" h={22}><ResultBadge {result} size="md" /></Demo>
  {/each}
</Row>
<Row title="Result badge (70:276) · sm">
  {#each BADGE_RESULTS as result (result)}
    <Demo name="Result badge/{result}/sm" figma="70:276" h={20}><ResultBadge {result} size="sm" /></Demo>
  {/each}
</Row>
<Row title="Readiness badge (70:317)">
  {#each READINESS as readiness (readiness)}
    <Demo name="Readiness badge/{readiness}/md" figma="70:317" h={22}><ReadinessBadge {readiness} /></Demo>
    <Demo name="Readiness badge/{readiness}/sm" figma="70:317" h={20}><ReadinessBadge {readiness} size="sm" /></Demo>
  {/each}
</Row>
