<script lang="ts">
  // Screen 2 · إضافة مشروع والاكتشاف (9.1, 9.2, 13.3; Figma 2.1 143:912 progress, 2.2 143:1352 result, 2.3 143:1813
  // failure, 2.4 143:2231 broad path, 2.5 143:2651 the permission explanation). Reading runs nothing: the page says
  // so while it reads. The result names every fact's source on hover, the checks the project already declares, its
  // references and the warnings (sensitive files by name only, FR-08). A broad folder waits for «تابِع» before any
  // reading; a dropped folder in a protected location is explained before macOS asks (FR-59, E-05).
  import type { DiscoverySnapshot, EventPayload, Project } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import PathPill from '../components/PathPill.svelte';
  import Progress from '../components/Progress.svelte';
  import SheetPermissionExplanation from '../components/SheetPermissionExplanation.svelte';
  import Tag from '../components/Tag.svelte';
  import Term from '../components/Term.svelte';
  import { useLocale } from '../lib/locale.ts';
  import { attempt, on } from '../app/client.ts';
  import { displayPath, hasMessage, homeOf } from '../app/format.ts';
  import { existingChecks, factChips, referenceLines, warningLines } from '../app/discovery.ts';
  import { addProject, addProjectFromDialog } from '../app/actions.ts';
  import { useApp, type Route } from '../app/state.svelte.ts';

  let { route }: { route: Extract<Route, { name: 'discovery' }> } = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  type View = 'permission' | 'pending' | 'progress' | 'result' | 'failure' | 'loading';
  // The route is fixed for this instance (Shell re-mounts the page on a new route).
  // svelte-ignore state_referenced_locally
  const initial: View = route.permission ? 'permission' : route.pending ? 'pending' : route.failure ? 'failure' : route.discoveryId ? 'progress' : 'loading';
  let view = $state<View>(initial);
  // svelte-ignore state_referenced_locally
  let failure = $state<string | null>(route.failure ?? null);
  let project = $state<Project | null>(null);
  let snapshot = $state<DiscoverySnapshot | null>(null);
  let progress = $state<EventPayload<'discovery.progress'> | null>(null);
  let started = Date.now();
  let elapsed = $state(0);
  let busy = $state(false);

  const path = $derived(project ? displayPath(project.rootPath, homeOf(project.rootPath)) : '');

  async function readProject(): Promise<void> {
    if (!route.projectId) return;
    const r = await attempt('project.get', { projectId: route.projectId });
    if (!r.ok) return;
    project = r.result.project;
    if (r.result.project.pathStatus !== 'ok') {
      failure = r.result.project.pathStatus;
      view = 'failure';
      return;
    }
    // The discovery may have ended before this page listened.
    if (!r.result.project.discovery.running && r.result.snapshot && (view === 'progress' || view === 'loading')) {
      snapshot = r.result.snapshot;
      view = 'result';
    }
  }

  $effect(() => {
    if (view !== 'progress' && view !== 'loading') return;
    const offs = [
      on('discovery.progress', (m) => {
        if (m.payload.discoveryId === route.discoveryId) progress = m.payload;
      }),
      on('discovery.done', (m) => {
        if (m.payload.discoveryId === route.discoveryId) void readProject();
      }),
      on('discovery.cancelled', (m) => {
        if (m.payload.discoveryId === route.discoveryId) app.navigate({ name: 'projects' });
      }),
      on('discovery.failed', (m) => {
        if (m.payload.discoveryId !== route.discoveryId) return;
        failure = m.payload.error.code;
        view = 'failure';
      }),
    ];
    void readProject();
    const timer = setInterval(() => (elapsed = Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      for (const off of offs) off();
      clearInterval(timer);
    };
  });

  async function cancel() {
    if (route.projectId) await attempt('project.cancelDiscovery', { projectId: route.projectId });
  }

  async function rescan() {
    if (!route.projectId) return;
    const r = await attempt('project.rescan', { projectId: route.projectId });
    if (r.ok) app.navigate({ name: 'discovery', projectId: route.projectId, discoveryId: r.result.discoveryId, pending: null });
  }

  async function confirmBroad() {
    if (!route.pending || busy) return;
    busy = true;
    const r = await attempt('project.confirm', { pendingId: route.pending.pendingId });
    busy = false;
    if (!r.ok) {
      failure = r.error.code;
      view = 'failure';
      return;
    }
    await app.refreshProjects();
    if (r.result.status === 'existing') app.navigate({ name: 'overview', projectId: r.result.project.id });
    else app.navigate({ name: 'discovery', projectId: r.result.project.id, discoveryId: r.result.discoveryId, pending: null });
  }

  async function relocate() {
    if (!route.projectId) return;
    const picked = await attempt('dialog.pickFolder', { purpose: 'project.relocate' });
    if (!picked.ok || 'cancelled' in picked.result) return;
    const r = await attempt('project.relocate', { projectId: route.projectId, selectionToken: picked.result.selectionToken });
    if (!r.ok) return;
    if (r.result.status === 'relocated') app.navigate({ name: 'discovery', projectId: r.result.project.id, discoveryId: r.result.discoveryId, pending: null });
    else app.navigate({ name: 'discovery', projectId: route.projectId, discoveryId: null, pending: r.result.confirmation });
  }

  function typeLabel(key: string): string | null {
    const k = `app.projectType.${key.slice('type.'.length)}`;
    return hasMessage(lang, k) ? t(k) : null;
  }

  const chips = $derived(snapshot ? factChips(t, typeLabel, snapshot.facts) : []);
  const checks = $derived(snapshot ? existingChecks(snapshot) : null);
  const refs = $derived(snapshot ? referenceLines(snapshot) : []);
  const warnings = $derived(snapshot ? warningLines(snapshot) : null);
  const isExtension = $derived(!!snapshot?.facts.some((f) => f.key === 'type.browserExtension'));
  /** The ecosystems and tools the walker recognized by a file's name so far (9.2). */
  const MARKER_LABELS: Record<string, string> = { node: 'Node', python: 'Python', manifest: 'Manifest', typescript: 'TypeScript', rust: 'Rust', go: 'Go', swift: 'Swift', pnpm: 'pnpm', yarn: 'Yarn', npm: 'npm', uv: 'uv', poetry: 'Poetry', vite: 'Vite', vitest: 'Vitest', playwright: 'Playwright', jest: 'Jest' };
  const detected = $derived((progress?.kinds ?? []).map((k) => MARKER_LABELS[k] ?? k));
  const REF_KEYS = {
    permissions: 'discoverui.refs.permissions',
    tokens: 'discoverui.refs.tokens',
    manifest: 'discoverui.refs.manifest',
    budgets: 'discoverui.refs.budgets',
    openapi: 'discoverui.refs.openapi',
    storybook: 'discoverui.refs.storybook',
    fonts: 'discoverui.refs.fonts',
  } as const;
</script>

{#snippet header(title: string, subtitle: string, ltr?: string)}
  <div class="page-header">
    <h1 class="title">{title}</h1>
    <p class="subtitle">{#if ltr}<bdi dir="ltr">{ltr}</bdi> · {/if}{subtitle}</p>
  </div>
{/snippet}

{#if view === 'permission' && route.permission}
  {@const permission = route.permission}
  <div class="page centered">
    <EmptyState kind="projects" title={t('projectlist.empty.title')} body={t('projectlist.empty.body')} actionLabel={t('projectlist.chooseFolder')} onaction={() => void addProjectFromDialog(app)} />
  </div>
  <SheetPermissionExplanation
    open
    location={permission.location}
    path={permission.display}
    oncontinue={() => void addProject(app, permission.selectionToken)}
    onchooseother={() => void addProjectFromDialog(app)}
    oncancel={() => app.navigate({ name: 'projects' })}
  />
{:else if view === 'pending' && route.pending}
  {@const pending = route.pending}
  <div class="page centered">
    <section class="card warning" aria-labelledby="wide-title">
      <Icon name="triangle-alert" size={24} />
      {#if pending.reason === 'identity_mismatch'}
        <h2 class="card-title" id="wide-title">{t('discoverui.identity.title')}</h2>
        <p class="body">{t('projects.confirm.identity_mismatch', { expected: pending.expected ?? '', found: pending.found ?? '' })}</p>
      {:else}
        <h2 class="card-title" id="wide-title">{t(pending.reason === 'home_folder' ? 'discoverui.wide.home' : 'discoverui.wide.root')}</h2>
        <PathPill path={pending.reason === 'home_folder' ? '~/' : '/'} />
        <p class="body">{t('discoverui.wide.body')}</p>
      {/if}
      <div class="actions">
        <Button kind="primary" onclick={() => void addProjectFromDialog(app)}>{t('discoverui.wide.other')}</Button>
        <Button kind="secondary" disabled={busy} onclick={() => void confirmBroad()}>{pending.reason === 'identity_mismatch' ? t('discoverui.identity.link') : t('discoverui.wide.continue')}</Button>
      </div>
    </section>
  </div>
{:else if view === 'failure'}
  <div class="page centered">
    <section class="failure" aria-labelledby="fail-title">
      <Icon name="triangle-alert" size={24} />
      {#if failure === 'permission_denied'}
        {@const location = project?.protectedLocation ? t(`projects.location.${project.protectedLocation}`) : ''}
        <h2 class="card-title" id="fail-title">{t('projects.permission.title')}</h2>
        <p class="body">{t('projects.permission.explain', { location })}</p>
        <p class="body">{t('projects.permission.steps', { location })}</p>
        {#if path}<PathPill {path} />{/if}
        <div class="actions">
          <Button kind="primary" onclick={() => void rescan()}>{t('discoverui.failure.retry')}</Button>
          <Button kind="secondary" onclick={() => void addProjectFromDialog(app)}>{t('discoverui.failure.chooseOther')}</Button>
        </div>
      {:else}
        <h2 class="card-title" id="fail-title">{t('discoverui.failure.title')}</h2>
        <p class="body">{failure === 'missing' || failure === 'not_found' ? t('discoverui.failure.missing') : t('discoverui.failure.unreadable', { code: failure ?? '' })}</p>
        {#if path}<PathPill {path} />{/if}
        <div class="actions">
          <Button kind="primary" onclick={() => (route.projectId ? void rescan() : void addProjectFromDialog(app))}>{t('discoverui.failure.retry')}</Button>
          {#if route.projectId}<Button kind="secondary" onclick={() => void relocate()}>{t('discoverui.failure.relocate')}</Button>{/if}
        </div>
      {/if}
    </section>
  </div>
{:else if view === 'progress'}
  <div class="page">
    {@render header(t('discoverui.progress.title'), t('discoverui.readOnly'), path)}
    <section class="card progress-card" aria-live="polite" aria-busy="true">
      <Progress kind="indeterminate" step={t('discoverui.progress.files', { count: progress?.filesSeen ?? 0 })} {elapsed} />
      <div class="kv">
        <span class="key">{t('discoverui.progress.currentDir')}</span>
        <PathPill path={progress?.currentDir && progress.currentDir !== '.' ? `${progress.currentDir}/` : './'} />
      </div>
      {#if progress?.skipped}
        <div class="kv">
          <span class="key">{t('discoverui.progress.skipped')}</span>
          <span class="value">
            {#each progress.skippedDirs ?? [] as dir, i (dir)}{#if i > 0}{t('discoverui.progress.and')}{/if}<bdi dir="ltr">{dir}</bdi>{/each}
            · {t('discoverui.progress.skippedCount', { count: progress.skipped })}
          </span>
        </div>
      {/if}
      <div class="block">
        <span class="key">{t('discoverui.progress.detected')}</span>
        <div class="tags">{#each detected as tag (tag)}<Tag>{tag}</Tag>{/each}</div>
      </div>
      <p class="note"><Icon name="lock" size={16} />{t('discoverui.progress.noRun')}</p>
      <div class="footer"><Button kind="secondary" onclick={() => void cancel()}>{t('ui.action.cancel')}</Button></div>
    </section>
  </div>
{:else if view === 'result' && snapshot && project && checks && warnings}
  <div class="page">
    {@render header(t('discoverui.result.title'), t('discoverui.result.subtitle', { name: project.displayName, files: snapshot.inventory.files, seconds: Math.round(snapshot.durationMs / 1000) }))}
    <div class="columns">
      <div class="col-main">
        <section class="card" aria-labelledby="types-title">
          <h2 class="card-title" id="types-title">{t('projectlist.column.type')}</h2>
          <p class="hint">{t('discoverui.result.typeHint')}</p>
          <div class="facts">
            {#each chips as chip (chip.label)}<Term term={chip.label} meaning={chip.source}>{chip.label}</Term>{/each}
          </div>
        </section>
        <section class="card lines" aria-labelledby="checks-title">
          <h2 class="card-title" id="checks-title">{t('discoverui.checks.title')}</h2>
          {#if checks.scripts.length}
            <p class="line"><span>{t('discoverui.checks.scripts')}</span>{#each checks.scripts as s (s)}<Tag><bdi dir="ltr">{s}</bdi></Tag>{/each}</p>
          {/if}
          {#if checks.configs.length}
            <p class="line"><span>{t('discoverui.checks.configs')}</span>{#each checks.configs as c (c)}<Tag><bdi dir="ltr">{c}</bdi></Tag>{/each}</p>
          {/if}
          {#if checks.tests.count}
            <p class="line"><span>{t('discoverui.checks.tests', { count: checks.tests.count })}</span>{#each checks.tests.folders as f (f)}<Tag><bdi dir="ltr">{f}</bdi></Tag>{/each}</p>
          {:else}
            <p class="line">{t('discoverui.checks.noTests')}</p>
          {/if}
        </section>
      </div>
      <div class="col-side">
        <section class="card lines" aria-labelledby="refs-title">
          <h2 class="card-title" id="refs-title">{t('discoverui.refs.title')}</h2>
          {#each refs as r (r.key)}
            <p class="line">
              <span>{r.key === 'render' ? t(isExtension ? 'discoverui.refs.renderExtension' : 'discoverui.refs.renderBuild') : t(REF_KEYS[r.key])}</span>
              {#each r.values as v (v)}<Tag><bdi dir="ltr">{v}</bdi></Tag>{/each}
            </p>
          {/each}
          {#if !refs.some((r) => r.key === 'tokens')}<p class="line">{t('discoverui.refs.tokensNone')}</p>{/if}
        </section>
        <section class="card lines" aria-labelledby="warn-title">
          <h2 class="card-title" id="warn-title">{t('discoverui.warnings.title')}</h2>
          {#if warnings.sensitive.length}
            <p class="line warn"><Icon name="triangle-alert" size={16} /><span class="wrap"><span>{t('discoverui.warnings.sensitive', { count: warnings.sensitive.length })}</span>{#each warnings.sensitive as f (f)}<Tag><bdi dir="ltr">{f}</bdi></Tag>{/each}</span></p>
          {/if}
          {#if warnings.symlinksOutside.length}
            <p class="line warn"><Icon name="triangle-alert" size={16} /><span class="wrap"><span>{t('discoverui.warnings.symlinkOutside')}</span>{#each warnings.symlinksOutside as f (f)}<Tag><bdi dir="ltr">{f}</bdi></Tag>{/each}</span></p>
          {/if}
          {#if warnings.partial}
            <p class="line warn"><Icon name="triangle-alert" size={16} /><span>{t('discovery.partial')}</span></p>
          {/if}
          {#if !warnings.sensitive.length && !warnings.symlinksOutside.length && !warnings.partial}<p class="line">{t('discoverui.warnings.none')}</p>{/if}
        </section>
      </div>
    </div>
    <div class="footer">
      <Button kind="primary" onclick={() => app.navigate({ name: 'profile', projectId: project!.id })}>{t('discoverui.reviewProfile')}</Button>
      <Button kind="secondary" onclick={() => void rescan()}>{t('ui.action.rescan')}</Button>
    </div>
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-24);
    padding: var(--space-24) var(--space-32);
  }
  .page.centered {
    align-items: center;
    justify-content: center;
  }
  .page-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
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
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .card-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .progress-card {
    gap: var(--space-16);
    inline-size: 640px;
    max-inline-size: 100%;
    padding: var(--space-24);
  }
  .progress-card :global(.progress) {
    inline-size: 100%;
  }
  .kv {
    display: flex;
    align-items: center;
    gap: var(--space-12);
  }
  .key {
    flex: none;
    inline-size: 120px;
    font: var(--type-label);
    color: var(--text-secondary);
  }
  .block .key {
    inline-size: auto;
  }
  .value {
    font: var(--type-body);
    color: var(--text-primary);
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
  .note {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .footer,
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .columns {
    display: flex;
    align-items: flex-start;
    gap: var(--space-16);
  }
  .col-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-16);
    min-inline-size: 0;
  }
  .col-side {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--space-16);
    inline-size: 380px;
  }
  .col-main .card:first-child {
    gap: var(--space-12);
  }
  .hint {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8);
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    margin: 0;
    font: var(--type-body);
    color: var(--text-primary);
  }
  .line.warn {
    flex-wrap: nowrap;
    gap: var(--space-8);
  }
  .line .wrap {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
  }
  .warning {
    gap: var(--space-12);
    inline-size: 560px;
    padding: var(--space-24);
  }
  .failure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-12);
    inline-size: 520px;
    text-align: center;
  }
  .body {
    margin: 0;
    font: var(--type-body);
    color: var(--text-secondary);
  }
  .failure .body {
    max-inline-size: 480px;
  }
</style>
