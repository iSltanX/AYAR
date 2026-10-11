<script lang="ts">
  // Built in its own commit of DEV-11.
  let { ...rest }: Record<string, unknown> = $props();
  void rest;
</script>
