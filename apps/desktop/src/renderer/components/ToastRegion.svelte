<script lang="ts">
  // The live region of toasts (C-20, Toast 117:9781): mounted once and kept, empty until a copy happens, so the
  // polite announcement is not lost (a region created together with its text is often not read). It draws the
  // current toast, if any; the caller replaces or clears it after 4 s.
  import type { ToastMessage } from '../lib/shell.ts';
  import Toast from './Toast.svelte';

  interface Props {
    toast?: ToastMessage | null;
  }
  let { toast = null }: Props = $props();
</script>

<div class="toast-region" role="status" aria-live="polite" aria-atomic="true">
  {#if toast}<Toast {...toast} />{/if}
</div>

<style>
  .toast-region {
    display: flex;
  }
</style>
