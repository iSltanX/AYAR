<script lang="ts">
  // Sidebar (Figma 101:1355, C-02): 240 wide plus a 1 px border/subtle divider on its inline-end side, bg/canvas,
  // padding 8, full height. Top (gap 2): project switcher · separator · Overview · Full scan · «Sections» and
  // the seven sections · separator · Model checks · Tasks · Runs · Project configuration. Bottom: separator ·
  // Tools · Settings. It sits on the inline-start edge, so it is on the right in Arabic and on the left in
  // English by the document direction alone.
  import { useLocale } from '../lib/locale.ts';
  import { NAV, NAV_BOTTOM, NAV_PROJECT, NAV_SECTIONS, NAV_TOP, type NavBadgeValue, type NavId } from '../lib/shell.ts';
  import NavGroupHeader from './NavGroupHeader.svelte';
  import NavItem from './NavItem.svelte';
  import ProjectSwitcher from './ProjectSwitcher.svelte';

  interface Props {
    /** The project shown; absent at the app level (D-DES4-09: the project list and adding a project). */
    project?: { name: string; path?: string };
    /** The destination shown now (selected, aria-current="page"). */
    current: NavId;
    /** Section badges: failures (count) or missing (needs setup). */
    badges?: Partial<Record<NavId, NavBadgeValue>>;
    disabled?: readonly NavId[];
    onnavigate?: (id: NavId) => void;
    onprojectmenu?: () => void;
  }
  let { project, current, badges = {}, disabled = [], onnavigate, onprojectmenu }: Props = $props();
  const { t } = useLocale();
  const uid = $props.id();
</script>

{#snippet item(id: NavId)}
  <NavItem
    label={t(NAV[id].key)}
    icon={NAV[id].icon}
    selected={id === current}
    badge={badges[id]}
    disabled={disabled.includes(id)}
    data-nav={id}
    onclick={() => onnavigate?.(id)}
  />
{/snippet}

<nav class="sidebar" aria-label={t('shell.sidebar.label')}>
  <div class="stack">
    {#if project}
      <ProjectSwitcher name={project.name} path={project.path} onclick={() => onprojectmenu?.()} />
      <hr />
      {#each NAV_TOP as id (id)}{@render item(id)}{/each}
      <div class="stack" role="group" aria-labelledby="{uid}-sections">
        <NavGroupHeader id="{uid}-sections" label={t('ui.nav.sections')} />
        {#each NAV_SECTIONS as id (id)}{@render item(id)}{/each}
      </div>
      <hr />
      {#each NAV_PROJECT as id (id)}{@render item(id)}{/each}
    {:else}
      {@render item('projects')}
    {/if}
  </div>
  <div class="stack">
    <hr />
    {#each NAV_BOTTOM as id (id)}{@render item(id)}{/each}
  </div>
</nav>

<style>
  .sidebar {
    display: flex;
    flex: none;
    flex-direction: column;
    justify-content: space-between;
    inline-size: 241px;
    block-size: 100%;
    padding: var(--space-8);
    border-inline-end: 1px solid var(--border-subtle);
    background: var(--bg-canvas);
    overflow: hidden;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  hr {
    flex: none;
    inline-size: 224px;
    max-inline-size: 100%;
    height: 1px;
    margin: 0;
    border: 0;
    background: var(--border-subtle);
  }
</style>
