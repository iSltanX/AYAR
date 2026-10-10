<script module lang="ts">
  export const meta = { id: 'C-22', title: 'Selection bar', figma: '112:8395', order: 122 };
</script>

<script lang="ts">
  import SelectionBar from '../../components/SelectionBar.svelte';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const kinds = ['checks', 'findings'] as const;
</script>

<Row title="Selection bar (112:8451) · Kind checks / findings · 720 wide">
  {#each kinds as kind (kind)}
    <div class="scroll">
      <div class="frame">
        <Demo name="Selection bar/{kind}" figma="112:8451" h={46} w={720}><SelectionBar {kind} count={3} /></Demo>
      </div>
    </div>
  {/each}
</Row>

<style>
  .scroll {
    width: 100%;
    overflow-x: auto;
    padding-block: var(--space-8);
  }
  .frame {
    width: 720px;
    padding-inline: var(--space-8);
    box-sizing: content-box;
  }
</style>
