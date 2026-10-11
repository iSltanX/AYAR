<script lang="ts">
  // Built in its own commit of DEV-11.
  let { projectId, runId }: { projectId: string; runId: string } = $props();
</script>

<p hidden>{projectId}{runId}</p>
