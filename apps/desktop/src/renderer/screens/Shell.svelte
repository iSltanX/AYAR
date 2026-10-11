<script lang="ts">
  // The window frame of every page (13.2; Window frame 102:2570, D-DES4-01): the title bar with the page's
  // breadcrumb, primary action, search and inspector toggle; the sidebar at the app level (D-DES4-09) or the
  // project's; the run bar under the title bar while a run is active, except on that run's own monitor
  // (D-DES4-08); the page; the inspector the page provides; the keyboard shortcuts of 13.7; the toast region; and
  // the screen-reader announcements of 13.6 (the run's summary at most every 10 s, one at the end). A project
  // whose folder macOS refuses to read opens on the privacy guide at the app level (22.1), and one whose folder is
  // gone opens on «المسار غير موجود» (22.2).
  import type { RunView } from '@ayar/protocol';
  import RunBar from '../components/RunBar.svelte';
  import SearchField from '../components/SearchField.svelte';
  import SheetCancelConfirmation from '../components/SheetCancelConfirmation.svelte';
  import Sidebar from '../components/Sidebar.svelte';
  import ToastRegion from '../components/ToastRegion.svelte';
  import WindowFrame from '../components/WindowFrame.svelte';
  import { useLocale } from '../lib/locale.ts';
  import { menuLabel, runMenu, type MenuEntry } from '../lib/menus.ts';
  import { NAV, NAV_SECTIONS, type NavId, type ResultCount } from '../lib/shell.ts';
  import { attempt, on } from '../app/client.ts';
  import { countChecks, isActive } from '../app/runs.svelte.ts';
  import { countsInOrder, runKind, sectionTitle } from '../app/format.ts';
  import { useApp, type Route, type SectionId } from '../app/state.svelte.ts';
  import { addDroppedProject, addProjectFromDialog, runSelection } from '../app/actions.ts';
  import ProjectsScreen from './ProjectsScreen.svelte';
  import DiscoveryScreen from './DiscoveryScreen.svelte';
  import ProfileScreen from './ProfileScreen.svelte';
  import OverviewScreen from './OverviewScreen.svelte';
  import ScanScreen from './ScanScreen.svelte';
  import SectionScreen from './SectionScreen.svelte';
  import ModelChecksScreen from './ModelChecksScreen.svelte';
  import TasksScreen from './TasksScreen.svelte';
  import AdvisorScreen from './AdvisorScreen.svelte';
  import RunsScreen from './RunsScreen.svelte';
  import CompareScreen from './CompareScreen.svelte';
  import ConfigScreen from './ConfigScreen.svelte';
  import ToolsScreen from './ToolsScreen.svelte';
  import SettingsScreen from './SettingsScreen.svelte';
  import AccessState from './states/AccessState.svelte';

  const app = useApp();
  const { t, dir } = useLocale();

  const INSPECTOR_ID = 'ayar-inspector';
  const project = $derived(app.currentProject);
  const route = $derived(app.route);
  /** 22.1: macOS refuses to read the folder: the project is shown at the app level, on the privacy guide. */
  const denied = $derived(!!project && project.pathStatus === 'permission_denied' && route.name === 'overview');
  /** 22.2: the folder is gone: «المسار غير موجود» on its overview, the project's other pages keep what AYAR kept. */
  const missing = $derived(!!project && project.pathStatus === 'missing' && route.name === 'overview');


  const isSection = (id: NavId): id is SectionId => (NAV_SECTIONS as readonly string[]).includes(id);

  const current = $derived.by<NavId>(() => {
    switch (route.name) {
      case 'projects':
      case 'discovery':
        return 'projects';
      case 'profile':
      case 'config':
        return 'projectConfiguration';
      case 'overview':
        return denied ? 'projects' : 'overview';
      case 'scan':
        return 'fullScan';
      case 'section':
        return route.section;
      case 'modelChecks':
        return 'modelChecks';
      case 'tasks':
        return 'tasks';
      case 'runs':
      case 'compare':
        return 'runs';
      case 'tools':
        return 'tools';
      case 'settings':
        return 'settings';
    }
  });

  function titleOf(r: Route): string {
    switch (r.name) {
      case 'projects':
        return t('ui.nav.projects');
      case 'discovery':
        return t('app.title.addProject');
      case 'profile':
        return t('app.title.profile');
      case 'overview':
        return denied ? t('ui.nav.projects') : t('ui.nav.overview');
      case 'scan':
        return r.runId && !isActive(app.runs.runs[r.runId]) ? t('resultsui.crumb') : t('ui.nav.fullScan');
      case 'section':
        return sectionTitle(t, r.section);
      case 'modelChecks':
        return t('ui.nav.modelChecks');
      case 'tasks':
        return t('ui.nav.tasks');
      case 'runs':
      case 'compare':
        return t('ui.nav.runs');
      case 'config':
        return t('ui.nav.projectConfiguration');
      case 'tools':
        return t('ui.nav.tools');
      case 'settings':
        return t('ui.nav.settings');
    }
  }
  const title = $derived(titleOf(route));

  const breadcrumb = $derived.by(() => {
    const crumbs: { label: string; onclick?: () => void }[] = [];
    if (route.name === 'projects' || route.name === 'tools' || route.name === 'settings' || denied) return crumbs;
    crumbs.push({ label: t('ui.nav.projects'), onclick: () => app.navigate({ name: 'projects' }) });
    if (project && route.name !== 'discovery') crumbs.push({ label: project.displayName, onclick: () => app.navigate({ name: 'overview', projectId: project.id }) });
    return crumbs;
  });

  function navigate(id: NavId) {
    if (id === 'projects') return app.navigate({ name: 'projects' });
    if (id === 'tools') return app.navigate({ name: 'tools' });
    if (id === 'settings') return app.navigate({ name: 'settings' });
    if (!project) return;
    const projectId = project.id;
    if (id === 'overview') app.navigate({ name: 'overview', projectId });
    else if (id === 'fullScan') openScan(projectId);
    else if (isSection(id)) app.navigate({ name: 'section', projectId, section: id });
    else if (id === 'modelChecks') app.navigate({ name: 'modelChecks', projectId });
    else if (id === 'tasks') app.navigate({ name: 'tasks', projectId, advisor: null });
    else if (id === 'runs') app.navigate({ name: 'runs', projectId });
    else if (id === 'projectConfiguration') app.navigate({ name: 'config', projectId, tab: (app.project(projectId)?.pendingApprovals ?? 0) > 0 ? 'approval' : 'file' });
  }

  /** «الفحص الكامل»: the monitor of this project's active full run, or the plan. */
  function openScan(projectId: string) {
    const active = app.runs.active;
    app.navigate({ name: 'scan', projectId, runId: active && active.projectId === projectId && active.kind === 'full' ? active.runId : null });
  }

  // Every project page offers «ابدأ الفحص الكامل» in the title bar (it shows the plan first, 13.7) unless the page
  // sets its own; a project whose folder is gone or unreadable cannot be scanned (22.1, 22.2).
  // A page of a project that sets its own primary action (the overview, the results) keeps the Run menu beside it.
  const primary = $derived.by(() => {
    const ok = !!project && !denied && project.pathStatus === 'ok';
    const menu = ok && project ? { label: t('controls.runMenu.open'), onopen: (a: DOMRect) => void openRunMenu(project.id, a) } : undefined;
    if (app.primary) return menu ? { ...app.primary, menu } : app.primary;
    if (!project || denied || route.name === 'discovery' || route.name === 'scan' || route.name === 'profile') return undefined;
    return { label: t('ui.action.startFullScan'), onclick: () => openScan(project.id), disabled: !ok, menu };
  });

  // ── the Run menu (C-23, D-DES3-07; D-DEV12-04): a native menu under the chevron beside the primary action ──
  const toNative = (e: MenuEntry) => (e.kind === 'separator' ? e : e.kind === 'header' ? { kind: 'header' as const, label: menuLabel(e, t) } : { kind: 'item' as const, id: e.id, label: menuLabel(e, t), enabled: e.enabled, ...(e.accelerator ? { accelerator: e.accelerator } : {}) });
  async function openRunMenu(projectId: string, anchor: DOMRect): Promise<void> {
    const groups = await attempt('groups.list', { projectId });
    const ctx = app.runContext;
    const section = ctx && (NAV_SECTIONS as readonly string[]).includes(ctx.section) ? NAV[ctx.section as SectionId].key : undefined;
    const entries = runMenu({ section, selectedCount: ctx?.selected ?? 0, savedGroups: groups.ok ? groups.result.groups.map((g) => ({ id: g.id, name: g.name })) : [] });
    // Under the chevron, from its start edge (the menu opens toward the page's reading direction).
    const x = Math.max(0, Math.round(dir === 'rtl' ? anchor.right : anchor.left));
    const r = await attempt('menu.popup', { entries: entries.map(toNative), x, y: Math.round(anchor.bottom + 4) });
    const id = r.ok ? r.result.id : null;
    if (!id) return;
    if (id === 'run.fullScan') openScan(projectId);
    else if (id === 'run.currentSection') ctx?.runSection();
    else if (id === 'run.selected') ctx?.runSelected();
    else if (id === 'run.rerunFailed') void rerunFrom(projectId, 'failed');
    else if (id === 'run.rerunIncomplete') void rerunFrom(projectId, 'incomplete');
    else if (id.startsWith('run.savedGroup:')) void runSelection(app, projectId, { kind: 'savedGroup', groupId: id.slice('run.savedGroup:'.length) });
  }
  /** «أعد الفاشل»/«أعد غير المكتمل»: the sheet on the results of the project's latest finished run (13.4). */
  async function rerunFrom(projectId: string, variant: 'failed' | 'incomplete'): Promise<void> {
    if (route.name === 'scan' && route.runId && !isActive(app.runs.runs[route.runId])) {
      window.dispatchEvent(new CustomEvent('ayar:rerun', { detail: variant }));
      return;
    }
    const list = await attempt('runs.list', { projectId });
    const last = list.ok ? list.result.runs.find((r) => !isActive(r)) : undefined;
    if (!last) return app.announce(t('app.rerun.none'));
    app.pendingRerun = variant;
    app.navigate({ name: 'scan', projectId, runId: last.runId });
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

  /** ⌘1 to ⌘9: the overview, the full scan, then the seven sections in the sidebar's order (13.7). */
  const NUMBERED: readonly NavId[] = ['overview', 'fullScan', ...NAV_SECTIONS];

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
      else void rerunFrom(project.id, 'failed');
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
    } else if (e.key === ',' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      navigate('settings');
    } else if (/^[1-9]$/.test(e.key) && project && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const id = NUMBERED[Number(e.key) - 1];
      if (id) navigate(id);
    }
  }
</script>

<svelte:window onkeydown={keydown} />

{#snippet search()}
  <SearchField bind:value={searchValue} width={200} />
{/snippet}

{#snippet sidebar()}
  <Sidebar
    project={project && route.name !== 'discovery' && !denied ? { name: project.displayName, path: project.rootPath } : undefined}
    {current}
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
  {:else if route.name === 'overview' && project && (denied || missing)}
    {#key route.projectId}<AccessState {project} />{/key}
  {:else if route.name === 'overview'}
    {#key route.projectId}<OverviewScreen projectId={route.projectId} />{/key}
  {:else if route.name === 'scan'}
    {#key `${route.projectId}:${route.runId}`}<ScanScreen projectId={route.projectId} runId={route.runId} />{/key}
  {:else if route.name === 'section'}
    {#key `${route.projectId}:${route.section}`}<SectionScreen projectId={route.projectId} section={route.section} />{/key}
  {:else if route.name === 'modelChecks'}
    {#key route.projectId}<ModelChecksScreen projectId={route.projectId} />{/key}
  {:else if route.name === 'tasks'}
    {#if route.advisor}
      {#key `${route.projectId}:${route.advisor}`}<AdvisorScreen projectId={route.projectId} mode={route.advisor} />{/key}
    {:else}
      {#key route.projectId}<TasksScreen projectId={route.projectId} />{/key}
    {/if}
  {:else if route.name === 'runs'}
    {#key route.projectId}<RunsScreen projectId={route.projectId} />{/key}
  {:else if route.name === 'config'}
    {#key `${route.projectId}:${route.tab}`}<ConfigScreen projectId={route.projectId} tab={route.tab} />{/key}
  {:else if route.name === 'tools'}
    <ToolsScreen />
  {:else if route.name === 'settings'}
    <SettingsScreen />
  {:else if route.name === 'compare'}
    {#key `${route.fromRunId}:${route.toRunId}`}<CompareScreen projectId={route.projectId} fromRunId={route.fromRunId} toRunId={route.toRunId} />{/key}
  {/if}
{/snippet}

{#snippet inspector()}
  {#if app.inspector}{@render app.inspector()}{/if}
{/snippet}

<WindowFrame
  controls={app.controls}
  {title}
  {breadcrumb}
  primary={primary ?? undefined}
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
