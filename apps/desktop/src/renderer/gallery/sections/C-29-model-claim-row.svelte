<script module lang="ts">
  export const meta = { id: 'C-29', title: 'Model claim row', figma: '117:10108', order: 129 };
</script>

<script lang="ts">
  import ModelClaimRow from '../../components/ModelClaimRow.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import type { ClaimDecision } from '../../lib/results.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  const note = { ar: 'دالة التوحيد لا تعالج الهمزة على الواو', en: 'normalize() does not handle hamza on waw' }[lang];
  const location = { path: 'src/normalize.py', line: 42 };
  const specimens: { name: string; localCheck?: string; decision?: ClaimDecision }[] = [
    { name: 'with-local-check', localCheck: 'beh.unit' },
    { name: 'no-local-check' },
    { name: 'decided-card', localCheck: 'beh.unit', decision: { kind: 'card', card: 'TASK-0013' } },
    { name: 'decided-not-issue', localCheck: 'beh.unit', decision: { kind: 'not-issue', date: '2026-10-10' } },
  ];
</script>

<Row title="Model claim row (117:10396) · Variant (hover and focus are CSS states) · never a pass/fail badge · 720 wide">
  {#each specimens as s (s.name)}
    <div class="scroll">
      <Demo name="Model claim row/{s.name}" figma="117:10396" h={62} w={720}>
        <div class="w720"><ModelClaimRow {note} claimId="AI-LOGIC-001.3" {location} localCheck={s.localCheck} decision={s.decision} /></div>
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
  .w720 {
    display: flex;
    width: 720px;
  }
</style>
