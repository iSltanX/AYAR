<script lang="ts">
  interface Props { count: number }
  let { count }: Props = $props();
  // Deliberate type error: string assigned to number.
  const n: number = `${count}`;
</script>

<p>{n}</p>
