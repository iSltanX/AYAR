<script lang="ts">
  // The window frame of every page (13.2; Window frame 102:2570, D-DES4-01): the title bar with the page's
  // breadcrumb, primary action, search and inspector toggle; the sidebar at the app level (D-DES4-09) or the
  // project's; the run bar under the title bar while a run is active, except on that run's own monitor
  // (D-DES4-08); the page; the inspector the page provides; the keyboard shortcuts of 13.7; the toast region; and
  // the screen-reader announcements of 13.6 (the run's summary at most every 10 s, one at the end).
  import type { RunView } from '@ayar/protocol';
  import RunBar from '../components/RunBar.svelte';
  import SearchField from '../components/SearchField.svelte';
  import SheetCancelConfirmation from '../components/SheetCancelConfirmation.svelte';
  import Sidebar from '../components/Sidebar.svelte';
  import ToastRegion from '../components/ToastRegion.svelte';
  import WindowFrame from '../components/WindowFrame.svelte';
  import { useLocale } from '../lib/locale.ts';
  import { NAV_PROJECT, NAV_SECTIONS, type NavId, type ResultCount } from '../lib/shell.ts';
  import { attempt, on } from '../app/client.ts';
  import { countChecks, isActive } from '../app/runs.svelte.ts';
  import { countsInOrder, runKind } from '../app/format.ts';
  import { useApp } from '../app/state.svelte.ts';
  import { addDroppedProject, addProjectFromDialog } from '../app/actions.ts';
  import ProjectsScreen from './ProjectsScreen.svelte';
  import DiscoveryScreen from './DiscoveryScreen.svelte';
  import ProfileScreen from './ProfileScreen.svelte';
  import OverviewScreen from './OverviewScreen.svelte';
  import ScanScreen from './ScanScreen.svelte';

  const app = useApp();
  const { t } = useLocale();

  const INSPECTOR_ID = 'ayar-inspector';
  const project = $derived(app.currentProject);
  const route = $derived(app.route);

  /** DEV-12's pages are not built yet: their destinations show the approved disabled state. */
  const LATER: readonly NavId[] = [...NAV_SECTIONS, ...NAV_PROJECT.filter((n) => n !== 'projectConfiguration'), 'tools', 'settings'];

  const current = $derived<NavId>(
    route.name === 'projects' || route.name === 'discovery'
      ? 'projects'
      : route.name === 'profile'
        ? 'projectConfiguration'
        : route.name === 'overview'
          ? 'overview'
          : 'fullScan',
  );

  const title = $derived(
    route.name === 'projects'
      ? t('ui.nav.projects')
      : route.name === 'discovery'
        ? t('app.title.addProject')
        : route.name === 'profile'
          ? t('app.title.profile')
          : route.name === 'overview'
            ? t('ui.nav.overview')
            : route.runId && !isActive(app.runs.runs[route.runId])
              ? t('resultsui.crumb')
              : t('ui.nav.fullScan'),
  );

  const breadcrumb = $derived.by(() => {
    const crumbs: { label: string; onclick?: () => void }[] = [];
    if (route.name !== 'projects') crumbs.push({ label: t('ui.nav.projects'), onclick: () => app.navigate({ name: 'projects' }) });
    if (project && route.name !== 'discovery') crumbs.push({ label: project.displayName, onclick: () => app.navigate({ name: 'overview', projectId: project.id }) });
    return crumbs;
  });

  function navigate(id: NavId) {
    if (id === 'projects') app.navigate({ name: 'projects' });
    else if (!project) return;
    else if (id === 'overview') app.navigate({ name: 'overview', projectId: project.id });
    else if (id === 'fullScan') openScan(project.id);
    else if (id === 'projectConfiguration') app.navigate({ name: 'profile', projectId: project.id });
  }

  /** «الفحص الكامل»: the monitor of this project's active full run, or the plan. */
  function openScan(projectId: string) {
    const active = app.runs.active;
    app.navigate({ name: 'scan', projectId, runId: active && active.projectId === projectId && active.kind === 'full' ? active.runId : null });
  }

  async function projectMenu() {
    const entries = [
      { kind: 'item' as const, id: 'projects', label: t('app.projectMenu.all'), enabled: true },
      { kind: 'separator' as const },
      ...app.projects.map((p) => ({ kind: 'item' as const, id: `project:${p.id}`, label: p.displayName, enabled: p.id !== project?.id })),
    ];
    const r = await attempt('menu.popup', { entries });
    const id = r.ok ? r.result.id : null;
    if (id === 'projects') app.navigate({ name: 'projects' });
    else if (id?.startsWith('project:')) app.navigate({ name: 'overview', projectId: id.slice('project:'.length) });
  }

  // ── the run bar (C-03) ──────────────────────────────────────────────────────────────────────────────────
  const active = $derived(app.runs.active);
  const onItsMonitor = $derived(!!active && route.name === 'scan' && route.runId === active.runId);
  // The run bar counts what runs, as the monitor does (a check that does not apply is not part of the run's progress).
  const live = $derived(active ? countChecks(app.runs.checksOf(active.runId).filter((c) => c.outcome !== 'not_applicable')) : null);
  const runCounts = $derived<ResultCount[]>(live ? countsInOrder(live.byOutcome) : []);
  const elapsed = $derived(active?.startedAt ? Math.max(0, Math.floor((app.runs.now - Date.parse(active.startedAt)) / 1000)) : 0);
  const runKindLabel = (run: RunView) => runKind(t, run, app.runs.plans[run.runId]);


  // ── 13.6: what a screen reader hears while a run is active, and once at its end ────────────────────────────
  let lastAnnounced = 0;
  $effect(() => {
    const run = active;
    const counts = live;
    void app.runs.now;
    if (!run || !counts || run.state !== 'running') return;
    const at = Date.now();
    if (at - lastAnnounced < 10_000) return;
    lastAnnounced = at;
    app.announce(t('app.announce.progress', { kind: runKindLabel(run), done: counts.finished, total: counts.total }));
  });
  $effect(() =>
    app.runs.onRun((run, previous) => {
      if (!previous || previous.state === run.state || (run.state !== 'finished' && run.state !== 'interrupted')) return;
      const kind = runKindLabel(run);
      app.announce(run.verdict ? t('app.announce.finished', { kind, verdict: t(`status.verdict.${run.verdict}`) }) : t('app.announce.finishedNoVerdict', { kind }));
    }),
  );

  // C-01: a folder dropped on the window or the Dock icon arrives as a token, on any page.
  $effect(() => on('bridge.drop', (drop) => void addDroppedProject(app, drop)));

  // ── 13.7: the keyboard ──────────────────────────────────────────────────────────────────────────────────
  let searchValue = $state('');
  $effect(() => {
    app.search = searchValue;
  });
  $effect(() => {
    void app.route;
    searchValue = '';
  });

  function keydown(e: KeyboardEvent) {
    if (!e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'o' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      void addProjectFromDialog(app);
    } else if (k === 'r' && !e.altKey && project) {
      e.preventDefault();
      // ⌘R: the plan first if it has not been shown (13.7); ⇧⌘R: «أعد الفاشل» on the results page itself.
      if (!e.shiftKey) openScan(project.id);
      else window.dispatchEvent(new CustomEvent('ayar:rerun-failed'));
    } else if (e.key === '.' && active) {
      e.preventDefault();
      app.confirmCancel = true;
    } else if (k === 'f' && !e.shiftKey) {
      e.preventDefault();
      document.querySelector<HTMLInputElement>('.title-bar input[type="search"]')?.focus();
    } else if (k === 'i' && e.altKey) {
      e.preventDefault();
      app.inspectorOpen = !app.inspectorOpen;
    } else if (k === 'c' && e.shiftKey && !e.altKey) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('ayar:copy-for-model'));
    } else if (/^[1-9]$/.test(e.key) && project && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (e.key === '1') navigate('overview');
      else if (e.key === '2') navigate('fullScan');
    }
  }
</script>

<svelte:window onkeydown={keydown} />

{#snippet search()}
  <SearchField bind:value={searchValue} width={200} />
{/snippet}

{#snippet sidebar()}
  <Sidebar
    project={project && route.name !== 'discovery' ? { name: project.displayName, path: project.rootPath } : undefined}
    {current}
    disabled={LATER}
    onnavigate={navigate}
    onprojectmenu={projectMenu}
  />
{/snippet}

{#snippet runbar()}
  {#if active && live}
    <RunBar
      status={active.state === 'cancelling' ? 'cancelling' : 'running'}
      kind={runKindLabel(active)}
      done={live.finished}
      total={live.total}
      {elapsed}
      counts={runCounts}
      onshowprogress={() => app.navigate({ name: 'scan', projectId: active.projectId, runId: active.runId })}
      oncancel={() => (app.confirmCancel = true)}
    />
  {/if}
{/snippet}

{#snippet content()}
  {#if route.name === 'projects'}
    <ProjectsScreen />
  {:else if route.name === 'discovery'}
    {#key `${route.projectId}:${route.discoveryId}`}<DiscoveryScreen {route} />{/key}
  {:else if route.name === 'profile'}
    {#key route.projectId}<ProfileScreen projectId={route.projectId} />{/key}
  {:else if route.name === 'overview'}
    {#key route.projectId}<OverviewScreen projectId={route.projectId} />{/key}
  {:else if route.name === 'scan'}
    {#key `${route.projectId}:${route.runId}`}<ScanScreen projectId={route.projectId} runId={route.runId} />{/key}
  {/if}
{/snippet}

{#snippet inspector()}
  {#if app.inspector}{@render app.inspector()}{/if}
{/snippet}

<WindowFrame
  controls={app.controls}
  {title}
  {breadcrumb}
  primary={app.primary ?? undefined}
  {search}
  bind:inspectorOpen={app.inspectorOpen}
  inspectorId={app.inspector && app.inspectorOpen ? INSPECTOR_ID : undefined}
  {sidebar}
  runbar={active && !onItsMonitor ? runbar : undefined}
  {content}
  inspector={app.inspector ? inspector : undefined}
/>

<SheetCancelConfirmation open={app.confirmCancel} oncancel={() => (app.confirmCancel = false)} oncancelrun={() => void app.cancelActiveRun()} />
<ToastRegion toast={app.toast} />
<div class="visually-hidden" role="status" aria-live="polite">{app.announcement}</div>
