<script lang="ts">
  // The gallery page: a toolbar (language, theme, section) and every section rendered once per chosen
  // language and theme. Each panel sets data-theme (tokens.css redeclares every colour there) and a <Locale>.
  import type { Lang } from '@ayar/i18n';
  import Locale from '../components/Locale.svelte';
  import { SECTIONS } from './sections.ts';

  type Choice<T> = T | 'both';
  let lang = $state<Choice<Lang>>('both');
  let theme = $state<Choice<'light' | 'dark'>>('light');
  let only = $state<string>('all');

  const langs = $derived<Lang[]>(lang === 'both' ? ['ar', 'en'] : [lang]);
  const themes = $derived<('light' | 'dark')[]>(theme === 'both' ? ['light', 'dark'] : [theme]);
  const shown = $derived(only === 'all' ? SECTIONS : SECTIONS.filter((s) => s.id === only));

  const langChoices: Choice<Lang>[] = ['ar', 'en', 'both'];
  const themeChoices: Choice<'light' | 'dark'>[] = ['light', 'dark', 'both'];
</script>

<div class="gallery" dir="ltr" lang="en">
  <header class="toolbar">
    <h1>AYAR · component gallery <span>(development only, DEV-10)</span></h1>
    <div class="group" role="group" aria-label="Language">
      {#each langChoices as c (c)}
        <button type="button" aria-pressed={lang === c} data-testid="lang-{c}" onclick={() => (lang = c)}>{c}</button>
      {/each}
    </div>
    <div class="group" role="group" aria-label="Theme">
      {#each themeChoices as c (c)}
        <button type="button" aria-pressed={theme === c} data-testid="theme-{c}" onclick={() => (theme = c)}>{c}</button>
      {/each}
    </div>
    <label class="group">
      <span>Section</span>
      <select bind:value={only} data-testid="section">
        <option value="all">all ({SECTIONS.length})</option>
        {#each SECTIONS as s (s.id)}
          <option value={s.id}>{s.id} · {s.title}</option>
        {/each}
      </select>
    </label>
  </header>

  <div class="sections">
    {#each shown as s (s.id)}
      <section class="section" data-section={s.id} aria-labelledby="h-{s.id}">
        <h2 id="h-{s.id}">{s.id} · {s.title} <code>{s.figma}</code></h2>
        <div class="panels">
          {#each themes as th (th)}
            {#each langs as l (l)}
              <div class="panel" data-theme={th} data-lang={l} data-panel="{s.id}/{l}/{th}">
                {#key l}
                  <Locale lang={l}>
                    <s.component />
                  </Locale>
                {/key}
              </div>
            {/each}
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .gallery {
    min-height: 100vh;
    background: var(--bg-sunken);
    color: var(--text-primary);
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-16);
    padding: var(--space-12) var(--space-24);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
  }
  h1 {
    margin: 0;
    font: var(--type-title-sub);
  }
  h1 span {
    font: var(--type-body-small);
    color: var(--text-tertiary);
  }
  .group {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    font: var(--type-label);
  }
  .group button,
  .group select {
    height: 28px;
    padding: 0 var(--space-8);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    font: var(--type-label);
  }
  .group button[aria-pressed='true'] {
    background: var(--text-primary);
    color: var(--text-inverse);
  }
  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-32);
    padding: var(--space-24);
  }
  h2 {
    margin: 0 0 var(--space-12);
    font: var(--type-title-section);
  }
  h2 code {
    font: var(--type-mono);
    color: var(--text-tertiary);
  }
  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(760px, 1fr));
    gap: var(--space-16);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-24);
    min-width: 0;
    padding: var(--space-24);
    border-radius: var(--radius-card);
    background: var(--bg-canvas);
    color: var(--text-primary);
    font: var(--type-body);
  }
</style>
