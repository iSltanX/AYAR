<script module lang="ts">
  export const meta = { id: 'C-12', title: 'Command block', figma: '108:5630', order: 112 };
</script>

<script lang="ts">
  import CommandBlock from '../../components/CommandBlock.svelte';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';
</script>

<Row title="Command block (108:5868) · Runs code, Writes (dist/), Network">
  <Demo name="Command block/all flags" figma="108:5868" h={54} w={480}>
    <div class="w480"><CommandBlock command="npx vitest run --reporter=json" runsCode writes writesPath="dist/" network /></div>
  </Demo>
</Row>
<Row title="Command block · no flags">
  <Demo name="Command block/no flags" figma="108:5868" h={28} w={480}>
    <div class="w480"><CommandBlock command="npx vitest run --reporter=json" /></div>
  </Demo>
</Row>

<style>
  .w480 {
    display: flex;
    width: 480px;
  }
</style>
