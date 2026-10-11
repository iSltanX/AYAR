<script lang="ts">
  // The app root (DEV-11): reads the settings, the window buttons' corner and the projects, then shows the frame
  // in the UI language. A change of language re-mounts the subtree (Locale is set once per subtree).
  import { onDestroy, onMount } from 'svelte';
  import Locale from './components/Locale.svelte';
  import Shell from './screens/Shell.svelte';
  import { AppState, provideApp } from './app/state.svelte.ts';

  const app = provideApp(new AppState());
  onMount(() => void app.init());
  onDestroy(() => app.destroy());
</script>

{#if app.ready}
  {#key app.lang}
    <Locale lang={app.lang}>
      <Shell />
    </Locale>
  {/key}
{/if}
