<script lang="ts">
  import type { Outcome } from '@ayar-spike/engine';

  interface Props {
    label: string;
    outcome: Outcome;
    count?: number;
  }
  let { label, outcome, count = 0 }: Props = $props();
  const text = $derived(`${label}: ${count}`);
</script>

<p class="row" data-outcome={outcome}>{text}</p>
