<script module lang="ts">
  export const meta = { id: 'C-20', title: 'Banners and toasts', figma: '117:9685', order: 120 };
</script>

<script lang="ts">
  import Banner from '../../components/Banner.svelte';
  import Toast from '../../components/Toast.svelte';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';
</script>

<Row title="Banner (117:9737) · Kind needs-approval / engine-restarting">
  <div class="scroll">
    <div class="frame">
      <Demo name="Banner/needs-approval" figma="117:9737" h={45} w={1120} width="fill"><Banner kind="needs-approval" count={2} /></Demo>
      <Demo name="Banner/engine-restarting" figma="117:9737" h={44} w={1120} width="fill"><Banner kind="engine-restarting" /></Demo>
    </div>
  </div>
</Row>

<Row title="Toast (117:9781) · Kind report / card / instructions">
  <Demo name="Toast/report" figma="117:9781" h={36}><Toast kind="report" count={12430} /></Demo>
  <Demo name="Toast/card" figma="117:9781" h={36}><Toast kind="card" id="TASK-0012" /></Demo>
  <Demo name="Toast/instructions" figma="117:9781" h={36}><Toast kind="instructions" id="AI-LOGIC-001" /></Demo>
</Row>

<style>
  .scroll {
    width: 100%;
    overflow-x: auto;
  }
  .frame {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    width: 1120px;
  }
</style>
