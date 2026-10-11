<script lang="ts">
  // «الفحص الكامل» (13.3, three modes in one page): the plan before a run; a run's monitor while it is active; its
  // results once it ended. The monitor turns into the results when its run finishes (13.3 «عند الانتهاء يتحول
  // العرض إلى النتائج»); the screen-reader announcement of the end is the frame's (13.6).
  import { isActive } from '../app/runs.svelte.ts';
  import { useApp } from '../app/state.svelte.ts';
  import MonitorView from './MonitorView.svelte';
  import PlanView from './PlanView.svelte';
  import ResultsView from './ResultsView.svelte';
  import DiskFullState from './states/DiskFullState.svelte';

  let { projectId, runId }: { projectId: string; runId: string | null } = $props();
  const app = useApp();

  $effect(() => {
    if (runId && !app.runs.checks[runId]) void app.runs.load(runId);
  });
  const run = $derived(runId ? app.runs.runs[runId] : undefined);
</script>

{#if !runId}
  <PlanView {projectId} />
{:else if run && isActive(run)}
  <MonitorView {projectId} runId={runId} />
{:else if run && run.cancelReason === 'disk_full'}
  <DiskFullState {projectId} {run} />
{:else if run}
  {#key run.state}<ResultsView {projectId} runId={runId} />{/key}
{/if}
