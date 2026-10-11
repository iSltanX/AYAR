<script lang="ts">
  // Screen 1 · المشاريع (13.3; Figma 1.1 160:16137 and 1.2 160:16549, EN 160:53587 and 160:53999): the empty state
  // with «اختر مجلدًا…» and the drop zone, or the list: name and path (isolated left to right), type and
  // technologies, the last verdict with its karat and date (the scope in a tooltip, never the number alone), the
  // readiness alerts, «افتح» and the native actions menu (open, rescan, Finder, remove with the native alert:
  // D-DEV3-15), sorted by last scan, name or verdict. The path is shown, never sent: actions name the project id.
  import type { Project, RunView } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import DropZone from '../components/DropZone.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import IconButton from '../components/IconButton.svelte';
  import KaratDial from '../components/KaratDial.svelte';
  import PathPill from '../components/PathPill.svelte';
  import ReadinessBadge from '../components/ReadinessBadge.svelte';
  import Select from '../components/Select.svelte';
  import Tag from '../components/Tag.svelte';
  import TableHeaderCell from '../components/TableHeaderCell.svelte';
  import TermTooltip from '../components/TermTooltip.svelte';
  import VerdictBadge from '../components/VerdictBadge.svelte';
  import { useLocale } from '../lib/locale.ts';
  import { attempt, copyText } from '../app/client.ts';
  import { day, displayPath, homeOf } from '../app/format.ts';
  import { projectTags } from '../app/projects.ts';
  import { addProjectFromDialog } from '../app/actions.ts';
  import { useApp } from '../app/state.svelte.ts';

  const app = useApp();
  const { t, lang } = useLocale();

  type Readiness = { kind: 'approval' } | { kind: 'tool' } | { kind: 'setup' } | { kind: 'none' } | { kind: 'path'; status: 'missing' | 'permission_denied' };
  interface RowInfo {
    tags: string[];
    lastFull: RunView | null;
    readiness: Readiness;
  }
  let info = $state<Record<string, RowInfo>>({});
  type Sort = 'lastScan' | 'name' | 'verdict';
  let sort = $state<Sort>('lastScan');
  let dragging = $state(0);
  let tip = $state<string | null>(null);

  const empty = $derived(app.projectsLoaded && app.projects.length === 0);

  async function load(p: Project): Promise<void> {
    const [got, runs, ready] = await Promise.all([attempt('project.get', { projectId: p.id }), attempt('runs.list', { projectId: p.id }), attempt('readiness.evaluate', { projectId: p.id, probe: false })]);
    const tags = got.ok && got.result.snapshot ? projectTags(t, got.result.snapshot.facts.filter((f) => f.component === '.')) : [];
    const lastFull = runs.ok ? (runs.result.runs.find((r) => r.kind === 'full' && r.state === 'finished' && r.purity) ?? null) : null;
    let readiness: Readiness = { kind: 'none' };
    if (p.pathStatus !== 'ok') readiness = { kind: 'path', status: p.pathStatus };
    else if (p.pendingApprovals > 0) readiness = { kind: 'approval' };
    else if (ready.ok) {
      const setup = ready.result.items.filter((i) => i.readiness === 'needs_setup');
      if (setup.some((i) => i.reasons.some((r) => /toolMissing|toolNotFound|browserMissing|osvDbMissing/.test(r.key)))) readiness = { kind: 'tool' };
      else if (setup.length) readiness = { kind: 'setup' };
      else if (ready.result.items.some((i) => i.readiness === 'needs_approval')) readiness = { kind: 'approval' };
    }
    info[p.id] = { tags, lastFull, readiness };
  }

  $effect(() => {
    for (const p of app.projects) void load(p);
  });

  // The page's primary action in the title bar: «اختر مجلدًا…» beside the list (1.2), none on the empty page (1.1).
  $effect(() => {
    app.primary = empty || !app.projectsLoaded ? null : { label: t('projectlist.chooseFolder'), onclick: () => void addProjectFromDialog(app) };
    return () => (app.primary = null);
  });

  const VERDICT_RANK = { blocked: 0, incomplete: 1, pure: 2 } as const;
  const rows = $derived.by(() => {
    const q = app.search.trim().toLowerCase();
    const list = app.projects.filter((p) => !q || p.displayName.toLowerCase().includes(q) || p.rootPath.toLowerCase().includes(q));
    const last = (p: Project) => info[p.id]?.lastFull?.finishedAt ?? '';
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.displayName.localeCompare(b.displayName, lang);
      if (sort === 'verdict') {
        const va = info[a.id]?.lastFull?.verdict;
        const vb = info[b.id]?.lastFull?.verdict;
        return (va ? VERDICT_RANK[va] : 3) - (vb ? VERDICT_RANK[vb] : 3) || a.displayName.localeCompare(b.displayName, lang);
      }
      return last(b).localeCompare(last(a)) || (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt);
    });
  });

  const sortOptions = $derived([
    { value: 'lastScan' as const, label: t('projectlist.sort.lastScan') },
    { value: 'name' as const, label: t('projectlist.sort.name') },
    { value: 'verdict' as const, label: t('projectlist.sort.verdict') },
  ]);

  function open(p: Project) {
    app.navigate({ name: 'overview', projectId: p.id });
  }

  async function rescan(p: Project) {
    const r = await attempt('project.rescan', { projectId: p.id });
    if (r.ok) app.navigate({ name: 'discovery', projectId: p.id, discoveryId: r.result.discoveryId, pending: null });
  }

  async function remove(p: Project) {
    // D-DEV3-15: the main process asks in its own native alert; only its confirm button mints the token.
    const c = await attempt('confirm.issue', { command: 'project.remove', target: p.id });
    if (!c.ok || 'cancelled' in c.result) return;
    const r = await attempt('project.remove', { projectId: p.id, confirmationToken: c.result.confirmationToken });
    if (r.ok) {
      delete info[p.id];
      await app.refreshProjects();
    }
  }

  async function menu(p: Project, e: MouseEvent) {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const r = await attempt('menu.popup', {
      entries: [
        { kind: 'item', id: 'open', label: t('projectlist.menu.open'), enabled: true },
        { kind: 'item', id: 'rescan', label: t('projectlist.menu.rescan'), enabled: p.pathStatus === 'ok' && !p.discovery.running },
        { kind: 'separator' },
        { kind: 'item', id: 'reveal', label: t('projectlist.menu.reveal'), enabled: p.pathStatus === 'ok' },
        { kind: 'item', id: 'remove', label: t('projectlist.menu.remove'), enabled: true },
      ],
      x: Math.max(0, Math.round(box.left)),
      y: Math.max(0, Math.round(box.bottom + 4)),
    });
    const id = r.ok ? r.result.id : null;
    if (id === 'open') open(p);
    else if (id === 'rescan') void rescan(p);
    else if (id === 'reveal') void attempt('project.reveal', { projectId: p.id });
    else if (id === 'remove') void remove(p);
  }
</script>

<svelte:window
  ondragenter={(e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) dragging += 1;
  }}
  ondragleave={() => (dragging = Math.max(0, dragging - 1))}
  ondrop={() => (dragging = 0)}
/>

{#if empty}
  <div class="page empty">
    <EmptyState kind="projects" title={t('projectlist.empty.title')} body={t('projectlist.empty.body')} actionLabel={t('projectlist.chooseFolder')} onaction={() => void addProjectFromDialog(app)} />
    <DropZone active={dragging > 0} />
  </div>
{:else if app.projectsLoaded}
  <div class="page">
    <header class="header">
      <div class="page-header">
        <h1 class="title">{t('ui.nav.projects')}</h1>
        <p class="subtitle">{t('projectlist.subtitle', { count: app.projects.length })}</p>
      </div>
      <Select bind:value={sort} options={sortOptions} label={t('projectlist.sort.label')} />
    </header>

    <table class="projects" data-testid="projects-table">
      <thead>
        <tr>
          <th class="c-name" scope="col"><TableHeaderCell label={t('projectlist.column.project')} sortable={false} /></th>
          <th class="c-type" scope="col"><TableHeaderCell label={t('projectlist.column.type')} sortable={false} /></th>
          <th class="c-verdict" scope="col"><TableHeaderCell label={t('projectlist.column.verdict')} sortable={false} /></th>
          <th class="c-readiness" scope="col"><TableHeaderCell label={t('projectlist.column.readiness')} sortable={false} /></th>
          <th class="c-actions" scope="col"><span class="visually-hidden">{t('projectlist.column.actions')}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as p (p.id)}
          {@const row = info[p.id]}
          <tr data-project={p.id}>
            <td class="c-name">
              <div class="name">
                <span class="project-name">{p.displayName}</span>
                <PathPill path={displayPath(p.rootPath, homeOf(p.rootPath))} oncopy={copyText} />
              </div>
            </td>
            <td class="c-type">
              <div class="tags">
                {#each row?.tags ?? [] as tag (tag)}<Tag>{tag}</Tag>{/each}
              </div>
            </td>
            <td class="c-verdict">
              {#if row?.lastFull?.purity && row.lastFull.verdict}
                {@const run = row.lastFull}
                {@const purity = row.lastFull.purity}
                <div class="verdict">
                  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                  <div
                    class="verdict-line"
                    tabindex="0"
                    role="group"
                    aria-describedby="scope-{p.id}"
                    onmouseenter={() => (tip = p.id)}
                    onmouseleave={() => (tip = null)}
                    onfocus={() => (tip = p.id)}
                    onblur={() => (tip = null)}
                  >
                    <VerdictBadge verdict={row.lastFull.verdict} />
                    <KaratDial value={purity.karat} size="sm" />
                    {#if purity.karat !== null}<span class="karat">{t('projectlist.karat', { karat: purity.karat })}</span>{/if}
                    <span class="tip" hidden={tip !== p.id}>
                      <TermTooltip
                        id="scope-{p.id}"
                        term={t('projectlist.scope.term')}
                        meaning={t('projectlist.scope.meaning', { criteria: purity.criteriaCount, checks: purity.checksCount, round: purity.roundId ?? run.displayId })}
                      />
                    </span>
                  </div>
                  {#if run.finishedAt}<span class="date">{day(run.finishedAt, lang)}</span>{/if}
                </div>
              {:else if row}
                <span class="note">{t('projectlist.noFullScan')}</span>
              {/if}
            </td>
            <td class="c-readiness">
              {#if row?.readiness.kind === 'approval'}
                <ReadinessBadge readiness="needs-approval" size="sm" />
              {:else if row?.readiness.kind === 'tool'}
                <ReadinessBadge readiness="needs-setup" size="sm" label={t('projectlist.readiness.missingTool')} />
              {:else if row?.readiness.kind === 'setup'}
                <ReadinessBadge readiness="needs-setup" size="sm" />
              {:else if row?.readiness.kind === 'path'}
                <span class="note">{t(`projects.pathStatus.${row.readiness.status}`)}</span>
              {:else if row}
                <span class="note">{t('projectlist.readiness.none')}</span>
              {/if}
            </td>
            <td class="c-actions">
              <div class="actions">
                <Button kind="secondary" onclick={() => open(p)}>{t('projectlist.open')}</Button>
                <IconButton icon="ellipsis" label={t('projectlist.more', { name: p.displayName })} onclick={(e: MouseEvent) => void menu(p, e)} />
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-24);
    padding: var(--space-24) var(--space-32);
  }
  .page.empty {
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: var(--space-16);
  }
  .header {
    display: flex;
    align-items: flex-end;
    gap: var(--space-16);
  }
  .page-header {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .title {
    margin: 0;
    font: var(--type-title-page);
    color: var(--text-primary);
  }
  .subtitle {
    margin: 0;
    font: var(--type-body);
    color: var(--text-secondary);
  }
  .projects {
    inline-size: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th {
    padding: 0;
    border-block-end: 1px solid var(--border-subtle);
    text-align: start;
    font-weight: inherit;
  }
  td {
    padding: var(--space-12) 0;
    border-block-end: 1px solid var(--border-subtle);
    vertical-align: middle;
  }
  .c-type {
    inline-size: 330px;
  }
  .c-verdict {
    inline-size: 200px;
  }
  .c-readiness {
    inline-size: 140px;
  }
  .c-actions {
    inline-size: 120px;
  }
  .name {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .project-name {
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    padding-inline-end: var(--space-16);
  }
  .verdict {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
  }
  .verdict-line {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-8);
    border-radius: var(--radius-control);
  }
  .karat {
    font: var(--type-label);
    color: var(--text-primary);
    white-space: nowrap;
  }
  .tip {
    position: absolute;
    inset-block-start: 100%;
    inset-inline-start: 0;
    z-index: 20;
    padding-block-start: var(--space-4);
    inline-size: 280px;
  }
  .tip[hidden] {
    display: none;
  }
  .date,
  .note {
    font: var(--type-body-small);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
</style>
