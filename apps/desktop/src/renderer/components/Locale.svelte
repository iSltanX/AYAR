<script lang="ts">
  // Provides the UI language to its subtree and sets lang and dir on a wrapper (C-24, DES-3 §2: Direction
  // comes from dir, not from a prop).
  import type { Snippet } from 'svelte';
  import type { Lang } from '@ayar/i18n';
  import { provideLocale } from '../lib/locale.ts';

  interface Props {
    lang: Lang;
    children: Snippet;
  }
  let { lang, children }: Props = $props();
  // The provider is set once: a subtree that changes language is re-mounted ({#key lang}).
  // svelte-ignore state_referenced_locally
  const locale = provideLocale(lang);
</script>

<div class="locale" lang={locale.lang} dir={locale.dir}>
  {@render children()}
</div>

<style>
  .locale {
    display: contents;
  }
</style>
