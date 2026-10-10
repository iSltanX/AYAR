<script module lang="ts">
  export const meta = { id: 'C-24', title: 'Copy for model button', figma: '110:6488', order: 124 };
</script>

<script lang="ts">
  import CopyForModelBar from '../../components/CopyForModelBar.svelte';
  import CopyForModelButton from '../../components/CopyForModelButton.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang, dir } = useLocale();
  const kinds = { ar: 'رمز GitHub', en: 'GitHub token' }[lang];
  const counts = { selectedCount: 3, characters: 12430, redactions: 2, redactedKinds: kinds };
  // Figma 110:6710: the English note wraps to two lines where the Arabic one fits on one.
  const bars = [
    { context: 'results', w: 720, h: { rtl: 132, ltr: 144 } },
    { context: 'inspector', w: 348, h: { rtl: 160, ltr: 180 } },
    { context: 'card-preview', w: 560, h: { rtl: 96, ltr: 108 } },
    { context: 'instructions-preview', w: 560, h: { rtl: 28, ltr: 28 } },
  ] as const;
</script>

<Row title="Copy for model button (110:6568) · default / disabled (hover, pressed, focus are CSS states)">
  <Demo name="Copy for model button/default" figma="110:6568" h={28}><CopyForModelButton /></Demo>
  <Demo name="Copy for model button/disabled" figma="110:6568" h={28}><CopyForModelButton disabled /></Demo>
</Row>

<Row title="Copy for model bar (110:6710) · Context results / inspector / card-preview / instructions-preview · Tabs on · exactly one copy button">
  {#each bars as b (b.context)}
    <div class="scroll">
      <Demo name="Copy for model bar/{b.context}" figma="110:6710" h={b.h[dir]} w={b.w}>
        <div class="frame w{b.w}"><CopyForModelBar context={b.context} {...counts} /></div>
      </Demo>
    </div>
  {/each}
</Row>

<Row title="Copy for model bar · Tabs off (the inspector places the For you / For the model control after the next-step card, D-DES3-14)">
  <div class="scroll">
    <Demo name="Copy for model bar/results/tabs-off" figma="110:6710" h={bars[0].h[dir] - 40} w={720}>
      <div class="frame w720"><CopyForModelBar context="results" tabs={false} {...counts} /></div>
    </Demo>
  </div>
</Row>

<style>
  .scroll {
    width: 100%;
    overflow-x: auto;
  }
  .frame {
    display: flex;
  }
  .w720 {
    width: 720px;
  }
  .w560 {
    width: 560px;
  }
  .w348 {
    width: 348px;
  }
</style>
