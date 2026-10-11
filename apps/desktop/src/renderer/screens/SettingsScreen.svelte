<script lang="ts">
  // Screen 21 · الإعدادات (13.3; Figma 21.1, purge 21.2), with the group «حول» (D-DEV12-02, the owner's decision): the
  // app's settings by group — general (language, appearance), running (parallelism, sleep, notifications, the default
  // timeouts), data (retention, the space each project uses, «امسح بيانات عِيَار» behind the main process's own
  // alert), network and privacy (every download asks; no usage measurements), secret redaction (the user's patterns,
  // tried live), the environment (the shell, its timeout, the computed PATH), the editor template, the cost (AYAR is
  // local and free; what needs the network or the user's model), the limits; and who made AYAR and where its
  // repository is.
  import type { Project, UserRedactionPattern } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import CostTag from '../components/CostTag.svelte';
  import Icon from '../components/Icon.svelte';
  import SegmentedControl from '../components/SegmentedControl.svelte';
  import Select from '../components/Select.svelte';
  import Switch from '../components/Switch.svelte';
  import { useLocale } from '../lib/locale.ts';
  import { attempt } from '../app/client.ts';
  import { sizeText } from '../app/results.ts';
  import { useApp } from '../app/state.svelte.ts';

  const app = useApp();
  const { t } = useLocale();

  type Values = {
    'ui.language': 'system' | 'ar' | 'en';
    'ui.theme': 'system' | 'light' | 'dark';
    'run.parallel': number;
    'run.preventSleep': boolean;
    'run.notify': boolean;
    'evidence.retainRuns': number;
    'environment.shell': string | null;
    'environment.timeoutSeconds': number;
    'redaction.userPatterns': UserRedactionPattern[];
    'editor.template': string | null;
    'purity.narrowThreshold': number;
  };
  const KEYS = ['ui.language', 'ui.theme', 'run.parallel', 'run.preventSleep', 'run.notify', 'evidence.retainRuns', 'environment.shell', 'environment.timeoutSeconds', 'redaction.userPatterns', 'editor.template', 'purity.narrowThreshold'] as const;
  let values = $state<Partial<Values>>({});
  let about = $state<{ version: string; repository: string } | null>(null);
  let spaces = $state<{ project: Project; bytes: number }[]>([]);
  let path = $state<string[]>([]);
  let copies = $state<number | null>(null);
  async function load(): Promise<void> {
    const [s, a] = await Promise.all([attempt('settings.get', { keys: [...KEYS] }), attempt('about.get', {})]);
    if (s.ok) values = s.result.values;
    if (a.ok) about = a.result;
    const lists = await Promise.all(app.projects.map(async (p) => ({ project: p, r: await attempt('runs.list', { projectId: p.id }) })));
    spaces = lists.flatMap((x) => (x.r.ok ? [{ project: x.project, bytes: x.r.result.spaceUsedBytes }] : []));
    const current = app.currentProject ?? app.projects[0];
    if (current) {
      const [e, c] = await Promise.all([attempt('environment.resolve', { projectId: current.id }), attempt('reports.copies', { projectId: current.id, days: 30 })]);
      if (e.ok) path = e.result.env.path;
      if (c.ok) copies = c.result.count;
    }
  }
  $effect(() => {
    void load();
  });
  async function set<K extends keyof Values>(key: K, value: Values[K]): Promise<boolean> {
    const r = await attempt('settings.set', { key, value } as never);
    if (!r.ok) return false;
    values = { ...values, [key]: value };
    if (key === 'ui.language' || key === 'ui.theme') await app.applySettings();
    return true;
  }

  const GROUPS = ['general', 'running', 'data', 'network', 'redaction', 'environment', 'editor', 'cost', 'limits', 'about'] as const;
  const ICONS = { general: 'sliders-horizontal', running: 'play', data: 'layers', network: 'globe', redaction: 'lock', environment: 'code', editor: 'file-pen-line', cost: 'scale', limits: 'gauge', about: 'info' } as const;
  let active = $state<(typeof GROUPS)[number]>('general');
  function jump(g: (typeof GROUPS)[number]): void {
    active = g;
    document.getElementById(`settings-${g}`)?.scrollIntoView({ block: 'start' });
  }

  // ── data: «امسح بيانات عِيَار» (the main process asks in its own alert first, D-DEV3-15) ─────────────────────
  async function purge(): Promise<void> {
    const c = await attempt('confirm.issue', { command: 'data.purge', target: '*' });
    if (!c.ok || 'cancelled' in c.result) return;
    const r = await attempt('data.purge', { confirmationToken: c.result.confirmationToken });
    if (r.ok) {
      await app.refreshProjects();
      app.navigate({ name: 'projects' });
    }
  }

  // ── redaction: the user's patterns, tried on a sample here before they are kept ────────────────────────────
  const patterns = $derived(values['redaction.userPatterns'] ?? []);
  let newPattern = $state('');
  let sample = $state('');
  let patternError = $state(false);
  const tried = $derived.by(() => {
    if (!sample) return null;
    for (const p of [...patterns, ...(newPattern ? [{ id: 'new', pattern: newPattern }] : [])]) {
      try {
        if (new RegExp(p.pattern, 'u').test(sample)) return p.id;
      } catch {
        /* an invalid pattern is shown on its own */
      }
    }
    return '';
  });
  async function addPattern(): Promise<void> {
    patternError = false;
    try {
      new RegExp(newPattern, 'u');
    } catch {
      patternError = true;
      return;
    }
    const id = `user-${patterns.length + 1}`;
    if (await set('redaction.userPatterns', [...patterns, { id, pattern: newPattern }])) newPattern = '';
    else patternError = true;
  }

  // ── the editor template ────────────────────────────────────────────────────────────────────────────────────
  let template = $derived(values['editor.template'] ?? '');
  let templateError = $state(false);
  async function saveTemplate(): Promise<void> {
    templateError = !(await set('editor.template', template.trim() ? template.trim() : null));
  }
</script>

<div class="page" data-testid="settings">
  <h1 class="title">{t('ui.nav.settings')}</h1>
  <div class="layout">
    <nav class="groups" aria-label={t('settingsui.groups')}>
      {#each GROUPS as g (g)}
        <button type="button" class="group" class:active={active === g} aria-current={active === g ? 'true' : undefined} onclick={() => jump(g)}><Icon name={ICONS[g]} size={16} />{t(`settingsui.group.${g}`)}</button>
      {/each}
    </nav>

    <div class="sections">
      <section class="card" id="settings-general">
        <h2 class="card-title">{t('settingsui.group.general')}</h2>
        <div class="row"><span class="key">{t('settingsui.language')}</span><span class="spacer"></span><Select width={200} value={values['ui.language'] ?? 'system'} options={[{ value: 'system', label: t('settingsui.system') }, { value: 'ar', label: t('approval.context.languages.ar') }, { value: 'en', label: t('approval.context.languages.en') }]} onchange={(e: Event & { currentTarget: HTMLSelectElement }) => void set('ui.language', e.currentTarget.value as Values['ui.language'])} /></div>
        <div class="row"><span class="key">{t('settingsui.appearance')}</span><span class="spacer"></span><SegmentedControl label={t('settingsui.appearance')} value={values['ui.theme'] ?? 'system'} options={[{ value: 'system', label: t('settingsui.system') }, { value: 'dark', label: t('settingsui.dark') }, { value: 'light', label: t('settingsui.light') }]} onchange={(v: string) => void set('ui.theme', v as Values['ui.theme'])} /></div>
      </section>

      <section class="card" id="settings-running">
        <h2 class="card-title">{t('settingsui.group.running')}</h2>
        <div class="row"><span class="key">{t('settingsui.parallel')}</span><span class="spacer"></span><Select width={240} value={String(values['run.parallel'] ?? 2)} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: t('settingsui.parallelValue', { count: n }) }))} onchange={(e: Event & { currentTarget: HTMLSelectElement }) => void set('run.parallel', Number(e.currentTarget.value))} /></div>
        <div class="row"><span class="stack"><span class="key">{t('settingsui.timeouts')}</span><span class="small muted">{t('settingsui.timeoutsNote')}</span></span></div>
        <div class="row"><span class="stack"><span class="key">{t('settingsui.preventSleep')}</span><span class="small muted">{t('settingsui.preventSleepNote')}</span></span><span class="spacer"></span><Switch label={t('settingsui.preventSleep')} showLabel={false} checked={values['run.preventSleep'] ?? true} onchange={(on: boolean) => void set('run.preventSleep', on)} /></div>
        <div class="row"><span class="stack"><span class="key">{t('settingsui.notify')}</span><span class="small muted">{t('settingsui.notifyNote')}</span></span><span class="spacer"></span><Switch label={t('settingsui.notify')} showLabel={false} checked={values['run.notify'] ?? true} onchange={(on: boolean) => void set('run.notify', on)} /></div>
      </section>

      <section class="card" id="settings-data">
        <h2 class="card-title">{t('settingsui.group.data')}</h2>
        <div class="row"><span class="key">{t('settingsui.location')}</span><span class="spacer"></span><span class="small muted">{t('settingsui.locationText')}</span></div>
        <div class="row"><span class="stack"><span class="key">{t('settingsui.retention')}</span><span class="small muted">{t('settingsui.retentionNote')}</span></span><span class="spacer"></span><Select width={240} value={String(values['evidence.retainRuns'] ?? 20)} options={[5, 10, 20, 50, 100].map((n) => ({ value: String(n), label: t('settingsui.retentionValue', { count: n }) }))} onchange={(e: Event & { currentTarget: HTMLSelectElement }) => void set('evidence.retainRuns', Number(e.currentTarget.value))} /></div>
        <div class="row"><span class="key">{t('settingsui.space')}</span><span class="spacer"></span><span class="chips">{#each spaces as s (s.project.id)}<span class="val">{t('settingsui.spaceOf', { project: s.project.displayName, size: sizeText(s.bytes) })}</span>{:else}<span class="small muted">—</span>{/each}</span></div>
        <div class="row"><span class="stack"><span class="key">{t('settingsui.purge')}</span><span class="small muted">{t('settingsui.purgeNote')}</span></span><span class="spacer"></span><Button kind="destructive" onclick={() => void purge()}>{t('settingsui.purgeButton')}</Button></div>
      </section>

      <section class="card" id="settings-network">
        <h2 class="card-title">{t('settingsui.group.network')}</h2>
        {#each ['toolDownload', 'vulnUpdate', 'externalLinks'] as const as k (k)}
          <div class="row"><span class="key">{t(`settingsui.network.${k}`)}</span><span class="spacer"></span><span class="small muted">{t('settingsui.alwaysAsk')}</span></div>
        {/each}
        <p class="row small"><Icon name="shield" size={16} />{t('settingsui.noTelemetry')}</p>
      </section>

      <section class="card" id="settings-redaction">
        <h2 class="card-title">{t('settingsui.group.redaction')}</h2>
        <div class="row">
          <span class="stack"><span class="key">{t('settingsui.patterns')}</span><span class="small muted">{t('settingsui.patternsNote')}</span></span>
          <span class="spacer"></span>
          <span class="chips">{#each patterns as p (p.id)}<button type="button" class="val chip" aria-label={t('configui.remove', { item: p.pattern })} onclick={() => void set('redaction.userPatterns', patterns.filter((x) => x.id !== p.id))}><bdi dir="ltr">{p.pattern}</bdi><Icon name="x" size={12} /></button>{/each}</span>
          <input class="text mono" dir="ltr" aria-label={t('settingsui.addPattern')} bind:value={newPattern} />
          <Button kind="quiet" icon="plus" disabled={!newPattern.trim()} onclick={() => void addPattern()}>{t('settingsui.addPattern')}</Button>
        </div>
        {#if patternError}<p class="small" role="alert">{t('settingsui.patternInvalid')}</p>{/if}
        <div class="row">
          <span class="key">{t('settingsui.try')}</span>
          <span class="spacer"></span>
          <input class="text mono" dir="ltr" aria-label={t('settingsui.try')} bind:value={sample} />
          {#if tried !== null}<span class="val">{tried ? t('settingsui.tryHidden') : t('settingsui.tryShown')}</span>{/if}
        </div>
      </section>

      <section class="card" id="settings-environment">
        <h2 class="card-title">{t('settingsui.group.environment')}</h2>
        <div class="row"><span class="key">{t('settingsui.shell')}</span><span class="spacer"></span><span class="small"><bdi dir="ltr">{values['environment.shell'] ?? t('settingsui.shellDefault')}</bdi></span></div>
        <div class="row"><span class="key">{t('settingsui.readTimeout')}</span><span class="spacer"></span><Select width={160} value={String(values['environment.timeoutSeconds'] ?? 10)} options={[5, 10, 20, 30, 60].map((n) => ({ value: String(n), label: t('settingsui.seconds', { count: n }) }))} onchange={(e: Event & { currentTarget: HTMLSelectElement }) => void set('environment.timeoutSeconds', Number(e.currentTarget.value))} /></div>
        <div class="row"><span class="key">{t('settingsui.path')}</span><span class="spacer"></span><span class="path mono" dir="ltr">{#each path as p, i (i)}<span>{p}</span>{:else}<span>—</span>{/each}</span></div>
      </section>

      <section class="card" id="settings-editor">
        <h2 class="card-title">{t('settingsui.group.editor')}</h2>
        <div class="row">
          <span class="stack"><span class="key">{t('settingsui.template')}</span><span class="small muted">{t('settingsui.templateNote')}</span></span>
          <span class="spacer"></span>
          <input class="text mono" dir="ltr" aria-label={t('settingsui.template')} bind:value={template} onchange={() => void saveTemplate()} />
        </div>
        {#if templateError}<p class="small" role="alert">{t('settingsui.templateInvalid')}</p>{/if}
      </section>

      <section class="card" id="settings-cost">
        <h2 class="card-title">{t('settingsui.group.cost')}</h2>
        <p class="row strong"><Icon name="info" size={16} />{t('settingsui.costLead')}</p>
        <div class="row"><CostTag cost="local" /><span class="small">{t('settingsui.costLocal')}</span></div>
        <div class="row"><CostTag cost="network" /><span class="small">{t('settingsui.costNetwork')}</span></div>
        <div class="row"><CostTag cost="model" /><span class="small">{t('settingsui.costModel')}</span></div>
        {#if copies !== null}<div class="row"><span class="stack"><span class="key">{t('settingsui.copies')}</span><span class="small muted">{t('settingsui.copiesNote')}</span></span><span class="spacer"></span><span class="strong">{t('settingsui.times', { count: copies })}</span></div>{/if}
      </section>

      <section class="card" id="settings-limits">
        <h2 class="card-title">{t('settingsui.group.limits')}</h2>
        <div class="row"><span class="stack"><span class="key">{t('settingsui.narrow')}</span><span class="small muted">{t('settingsui.narrowNote')}</span></span><span class="spacer"></span><Select width={200} value={String(values['purity.narrowThreshold'] ?? 3)} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: t('settingsui.narrowValue', { count: n }) }))} onchange={(e: Event & { currentTarget: HTMLSelectElement }) => void set('purity.narrowThreshold', Number(e.currentTarget.value))} /></div>
        <div class="row"><span class="stack"><span class="key">{t('settingsui.logLimit')}</span><span class="small muted">{t('settingsui.logLimitNote')}</span></span></div>
      </section>

      <section class="card" id="settings-about" data-testid="settings-about">
        <h2 class="card-title">{t('settingsui.group.about')}</h2>
        <div class="row"><span class="key">{t('settingsui.version')}</span><span class="spacer"></span><span class="val"><bdi dir="ltr">{about?.version ?? '—'}</bdi></span></div>
        <div class="row"><span class="key">{t('settingsui.madeBy')}</span><span class="spacer"></span><span class="strong">{t('settingsui.maker')}</span></div>
        <div class="row"><span class="key">{t('settingsui.repository')}</span><span class="spacer"></span><Button kind="secondary" icon="external-link" onclick={() => void attempt('about.openRepository', {})}><bdi dir="ltr">{about?.repository.replace(/^https:\/\//, '') ?? ''}</bdi></Button></div>
      </section>
    </div>
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-24);
    padding: var(--space-24) var(--space-32);
  }
  .title {
    margin: 0;
    font: var(--type-title-page);
    color: var(--text-primary);
  }
  .layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: var(--space-24);
    align-items: start;
  }
  .groups {
    position: sticky;
    inset-block-start: var(--space-16);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-8) var(--space-12);
    border: 0;
    border-radius: var(--radius-control);
    background: none;
    font: var(--type-body);
    color: var(--text-primary);
    text-align: start;
    cursor: pointer;
  }
  .group.active {
    background: var(--bg-sunken);
  }
  .group:focus-visible,
  .chip:focus-visible,
  .text:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .card-title {
    margin: 0 0 var(--space-8);
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
    padding-block: var(--space-8);
    border-block-end: 1px solid var(--border-subtle);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .key {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    border: 0;
    cursor: pointer;
  }
  .text {
    inline-size: 260px;
    block-size: 28px;
    padding: 0 var(--space-8);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .path {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--text-primary);
  }
  .spacer {
    flex: 1;
  }
  .strong {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .small {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .mono {
    font: var(--type-mono);
  }
  .muted {
    color: var(--text-secondary);
  }
  .val {
    padding: 1px var(--space-8);
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
