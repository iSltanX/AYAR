<script lang="ts">
  // 19.4 «المراجع»: what the checks compare the project with, written by the owner (each «عرّف…» of the sections
  // lands here): the design tokens, the approved fonts and the render target; the permissions policy file and the
  // reason it gives for each permission (read from the file, never written by AYAR); the budgets; the state matrix
  // (states × sizes × themes × languages); the declared outputs and the recovery command. A reference that changes
  // what a check runs asks for approval again (D-08).
  import type { JsonValue, ProfileView, ReferenceKindName } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import Icon from '../../components/Icon.svelte';
  import RadioGroup from '../../components/RadioGroup.svelte';
  import Select from '../../components/Select.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { attempt } from '../../app/client.ts';
  import { loadCheckData } from '../../app/panels.ts';
  import { loadSection } from '../../app/sections.ts';

  let { projectId, profile, onupdated }: { projectId: string; profile: ProfileView; onupdated: (p: ProfileView) => void } = $props();
  const { t } = useLocale();

  const refs = $derived(profile.references);
  type Obj = Record<string, JsonValue>;
  const obj = (v: JsonValue | undefined): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  /** A JSON value as text: a string or a number, otherwise nothing. */
  const str = (v: JsonValue | undefined): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
  const strings = (v: JsonValue | undefined): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []);
  let error = $state<string | null>(null);
  async function save(kind: ReferenceKindName, value: JsonValue | null): Promise<void> {
    error = null;
    const r = await attempt('profile.update', { projectId, patch: { references: { [kind]: value } } });
    if (r.ok) onupdated(r.result);
    else error = t('configui.refs.invalid', { ref: t(`configui.refs.label.${kind}` as Parameters<typeof t>[0]), code: r.error.code });
  }

  // ── tokens, fonts, render target ───────────────────────────────────────────────────────────────────────────
  let editing = $state<string | null>(null);
  let tokens = $state('');
  let font = $state('');
  const fonts = $derived(strings(refs.fonts));
  const target = $derived(obj(refs.renderTarget));
  let kind = $state<'static' | 'service' | 'extension'>('static');
  let dir = $state('');
  let entry = $state('');
  let url = $state('');
  let service = $state('');
  function editTarget(): void {
    const tg = target;
    kind = tg?.kind === 'service' ? 'service' : tg?.kind === 'extension' ? 'extension' : 'static';
    dir = typeof tg?.dir === 'string' ? tg.dir : '';
    entry = typeof tg?.entry === 'string' ? tg.entry : '';
    url = typeof tg?.url === 'string' ? tg.url : '';
    service = typeof tg?.service === 'string' ? tg.service : (Object.keys(profile.services)[0] ?? '');
    editing = 'renderTarget';
  }
  /** The matrix keys a target keeps when its kind changes (sizes, themes, languages, allowed hosts). */
  const matrixOf = (tg: Obj | null): Obj => Object.fromEntries(Object.entries(tg ?? {}).filter(([k]) => ['viewports', 'themes', 'languages', 'allowHosts'].includes(k)));
  async function saveTarget(): Promise<void> {
    const m = matrixOf(target);
    const value: Obj = kind === 'service' ? { kind, service, url, ...m } : kind === 'extension' ? { kind, dir, ...m } : { kind, dir: dir || '.', ...(entry ? { entry } : {}), ...m };
    await save('renderTarget', value);
    editing = null;
  }
  const targetText = $derived.by(() => {
    const tg = target;
    if (!tg) return t('configui.refs.notSet');
    if (tg.kind === 'service') return t('configui.refs.target.serviceAt', { url: str(tg.url) });
    if (tg.kind === 'extension') return t('configui.refs.target.extensionAt', { dir: str(tg.dir) });
    return t('configui.refs.target.staticAt', { path: [str(tg.dir), str(tg.entry)].filter((x) => x && x !== '.').join('/') || '.' });
  });

  // ── the permissions policy: what the file says for each permission (sec.ext.permissions' facts) ─────────────
  let policyRows = $state<{ permission: string; reason: string | null }[]>([]);
  $effect(() => {
    void loadSection(projectId, 'security').then(async (m) => {
      const exec = m ? [...m.latest.values()].find((e) => e.check.checkId === 'sec.ext.permissions') : undefined;
      if (!exec) return;
      const d = await loadCheckData(projectId, exec);
      const table = d.report?.info.permissionsTable;
      if (Array.isArray(table)) policyRows = (table as { permission?: string; reason?: string | null }[]).map((r) => ({ permission: String(r.permission ?? ''), reason: r.reason ?? null }));
    });
  });

  // ── budgets (perf.web's, E-21; code.size's total) ──────────────────────────────────────────────────────────
  const METRICS = ['fcpMs', 'lcpMs', 'loadMs', 'taskMs', 'scriptMs', 'layoutMs', 'cls', 'bytes', 'requests'] as const;
  /** A budget key's measure, as the performance panel names it (its probe field). */
  const FIELD: Record<string, string> = { fcpMs: 'fcp', lcpMs: 'lcp', loadMs: 'load' };
  const metricLabel = (k: string) => t(`sectionui.performance.metric.${FIELD[k] ?? k}` as Parameters<typeof t>[0]);
  const budgets = $derived(obj(refs.budgets) ?? {});
  const web = $derived(obj(budgets.web) ?? {});
  let metric = $state<string>('lcpMs');
  let limit = $state('');
  async function setBudget(key: string, value: number | null): Promise<void> {
    const next: Obj = { ...web };
    if (value === null) delete next[key];
    else next[key] = value;
    const all: Obj = { ...budgets, web: next };
    if (!Object.keys(next).length) delete all.web;
    await save('budgets', Object.keys(all).length ? all : null);
  }

  // ── the state matrix ───────────────────────────────────────────────────────────────────────────────────────
  const states = $derived(obj(refs.states));
  const stateList = $derived(Array.isArray(states?.states) ? (states.states as Obj[]) : []);
  const viewports = $derived(Array.isArray(target?.viewports) ? (target.viewports as Obj[]) : []);
  const axis = (k: 'themes' | 'languages') => (obj(target?.[k]) && Array.isArray(obj(target?.[k])!.values) ? (obj(target?.[k])!.values as string[]) : []);
  let newState = $state('');
  let newPath = $state('');
  let newSize = $state('');
  let newTheme = $state('');
  let newLang = $state('');
  async function addState(): Promise<void> {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(newState) || !newPath.trim()) return;
    await save('states', { states: [...stateList, { id: newState, path: newPath.trim() }] });
    newState = '';
    newPath = '';
  }
  const removeState = (id: string) => save('states', stateList.length > 1 ? { states: stateList.filter((s) => s.id !== id) } : null);
  async function setMatrix(patch: Obj): Promise<void> {
    if (!target) return;
    const next: Obj = { ...target, ...patch };
    for (const [k, v] of Object.entries(patch)) if (v === null) delete next[k];
    await save('renderTarget', next);
  }
  async function addSize(): Promise<void> {
    const m = /^(\d{3,4})\s*[x×]\s*(\d{3,4})$/.exec(newSize.trim());
    if (!m) return;
    await setMatrix({ viewports: [...viewports, { name: `w${m[1]}`, width: Number(m[1]), height: Number(m[2]) }] });
    newSize = '';
  }
  async function addAxis(k: 'themes' | 'languages', value: string): Promise<void> {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(value)) return;
    const values = [...new Set([...axis(k), value])];
    const activation = obj(target?.[k])?.activation ?? (k === 'themes' ? { kind: 'media' } : { kind: 'query', param: 'lang' });
    await setMatrix({ [k]: { values, activation } });
    if (k === 'themes') newTheme = '';
    else newLang = '';
  }
  const removeAxis = (k: 'themes' | 'languages', value: string) => {
    const values = axis(k).filter((x) => x !== value);
    return setMatrix({ [k]: values.length ? { values, activation: obj(target?.[k])?.activation ?? { kind: 'media' } } : null });
  };
  const total = $derived(Math.max(1, stateList.length) * Math.max(1, viewports.length) * Math.max(1, axis('themes').length) * Math.max(1, axis('languages').length));

  // ── outputs and the recovery command ───────────────────────────────────────────────────────────────────────
  const outputs = $derived(strings(refs.outputs));
  let newOutput = $state('');
  const recovery = $derived(Array.isArray(refs.recoveryCommand) ? (refs.recoveryCommand as string[]).join(' ') : typeof refs.recoveryCommand === 'string' ? refs.recoveryCommand : '');
  let recoveryText = $state('');
</script>

{#snippet field(value: string, onsave: (v: string) => void, label: string)}
  <span class="row"><input class="text" dir="ltr" aria-label={label} {value} onchange={(e) => onsave(e.currentTarget.value)} /></span>
{/snippet}

<section class="card" data-testid="config-references">
  <h2 class="card-title">{t('configui.refs.design')}</h2>
  <div class="ref-row">
    <span class="key">{t('configui.refs.label.tokens')}</span>
    {#if editing === 'tokens'}
      <input class="text" dir="ltr" aria-label={t('configui.refs.label.tokens')} bind:value={tokens} />
      <Button kind="primary" onclick={() => void save('tokens', tokens.trim() || null).then(() => (editing = null))}>{t('configui.save')}</Button>
    {:else}
      <span class="val mono"><bdi dir="ltr">{strings(refs.tokens)[0] ?? t('configui.refs.notSet')}</bdi></span>
      <span class="spacer"></span>
      <Button kind="secondary" onclick={() => { tokens = strings(refs.tokens)[0] ?? ''; editing = 'tokens'; }}>{t('sectionui.design.edit')}</Button>
    {/if}
  </div>
  <div class="ref-row">
    <span class="key">{t('configui.refs.fonts')}</span>
    {#each fonts as f (f)}<button type="button" class="chip" aria-label={t('configui.remove', { item: f })} onclick={() => void save('fonts', fonts.length > 1 ? fonts.filter((x) => x !== f) : null)}>{f}<Icon name="x" size={12} /></button>{/each}
    <input class="text short" aria-label={t('configui.refs.addFont')} bind:value={font} />
    <Button kind="quiet" icon="plus" disabled={!font.trim()} onclick={() => void save('fonts', [...new Set([...fonts, font.trim()])]).then(() => (font = ''))}>{t('configui.add')}</Button>
  </div>
  <div class="ref-row">
    <span class="key">{t('configui.refs.label.renderTarget')}</span>
    {#if editing === 'renderTarget'}
      <div class="edit">
        <RadioGroup label={t('configui.refs.label.renderTarget')} bind:value={kind} options={[{ value: 'static', label: t('configui.refs.target.static') }, { value: 'service', label: t('configui.refs.target.service') }, { value: 'extension', label: t('configui.refs.target.extension') }]} />
        {#if kind === 'service'}
          <label class="field"><span>{t('configui.refs.target.url')}</span><input class="text" dir="ltr" bind:value={url} /></label>
          <label class="field"><span>{t('configui.refs.target.serviceName')}</span><Select bind:value={service} options={Object.keys(profile.services).map((s) => ({ value: s, label: s }))} width={200} /></label>
        {:else}
          <label class="field"><span>{t('configui.refs.target.dir')}</span><input class="text" dir="ltr" bind:value={dir} /></label>
          {#if kind === 'static'}<label class="field"><span>{t('configui.refs.target.entry')}</span><input class="text" dir="ltr" bind:value={entry} /></label>{/if}
        {/if}
        <span class="row"><Button kind="secondary" onclick={() => (editing = null)}>{t('ui.action.cancel')}</Button><Button kind="primary" onclick={() => void saveTarget()}>{t('configui.save')}</Button></span>
      </div>
    {:else}
      <span class="small">{targetText}</span>
      <span class="spacer"></span>
      <Button kind="secondary" onclick={editTarget}>{target ? t('sectionui.design.edit') : t('ui.action.define')}</Button>
    {/if}
  </div>
</section>

<section class="card">
  <div class="card-head">
    <h2 class="card-title">{t('configui.refs.policy')}</h2>
    <span class="spacer"></span>
    <span class="small muted">{t('configui.refs.policyFile')}</span>
    {@render field(strings(refs.permissionsPolicy)[0] ?? '', (v) => void save('permissionsPolicy', v.trim() || null), t('configui.refs.policyFile'))}
  </div>
  {#if policyRows.length}
    <table class="ptable">
      <thead><tr><th scope="col">{t('sectionui.security.permission')}</th><th scope="col">{t('configui.refs.policyReason')}</th></tr></thead>
      <tbody>
        {#each policyRows as r (r.permission)}
          <tr><td><span class="val"><bdi dir="ltr">{r.permission}</bdi></span></td><td class="small">{r.reason ?? t('configui.refs.policyMissing')}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
  <p class="small muted">{t('configui.refs.policyNote')}</p>
</section>

<section class="card">
  <h2 class="card-title">{t('configui.refs.budgets')}</h2>
  <table class="ptable">
    <thead><tr><th scope="col">{t('configui.refs.metric')}</th><th scope="col">{t('configui.refs.limit')}</th><th scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th></tr></thead>
    <tbody>
      {#each Object.entries(web) as [k, v] (k)}
        <tr><td>{metricLabel(k)}</td><td class="num">{str(v)}</td><td class="end"><Button kind="quiet" onclick={() => void setBudget(k, null)}>{t('runsui.delete')}</Button></td></tr>
      {/each}
    </tbody>
  </table>
  <span class="row">
    <Select bind:value={metric} label={t('configui.refs.metric')} options={METRICS.filter((m) => !(m in web)).map((m) => ({ value: m, label: metricLabel(m) }))} width={200} />
    <input class="text short" dir="ltr" inputmode="decimal" aria-label={t('configui.refs.limit')} bind:value={limit} />
    <Button kind="secondary" icon="plus" disabled={!(Number(limit) > 0)} onclick={() => void setBudget(metric, Number(limit)).then(() => (limit = ''))}>{t('configui.refs.addBudget')}</Button>
  </span>
  <p class="small muted">{t('configui.refs.budgetsNote')}</p>
</section>

<section class="card">
  <div class="card-head"><h2 class="card-title">{t('configui.refs.matrix')}</h2><span class="spacer"></span><span class="small muted">{t('sectionui.design.matrix', { states: stateList.length, sizes: Math.max(1, viewports.length), themes: Math.max(1, axis('themes').length), langs: Math.max(1, axis('languages').length), total })}</span></div>
  <div class="ref-row">
    <span class="key">{t('configui.refs.states')}</span>
    {#each stateList as s (str(s.id))}<button type="button" class="chip" aria-label={t('configui.remove', { item: str(s.id) })} onclick={() => void removeState(str(s.id))}><bdi dir="ltr">{str(s.id)}</bdi><Icon name="x" size={12} /></button>{/each}
    <input class="text short" dir="ltr" aria-label={t('configui.refs.stateName')} placeholder={t('configui.refs.stateName')} bind:value={newState} />
    <input class="text short" dir="ltr" aria-label={t('configui.refs.statePath')} placeholder={t('configui.refs.statePath')} bind:value={newPath} />
    <Button kind="quiet" icon="plus" onclick={() => void addState()}>{t('configui.add')}</Button>
  </div>
  {#if target}
    <div class="ref-row">
      <span class="key">{t('configui.refs.sizes')}</span>
      {#each viewports as v (str(v.name))}<button type="button" class="chip" aria-label={t('configui.remove', { item: str(v.width) })} onclick={() => void setMatrix({ viewports: viewports.length > 1 ? viewports.filter((x) => x.name !== v.name) : null })}><bdi dir="ltr">{str(v.width)}×{str(v.height)}</bdi><Icon name="x" size={12} /></button>{/each}
      <input class="text short" dir="ltr" aria-label={t('configui.refs.sizeHint')} placeholder={t('configui.refs.sizeHint')} bind:value={newSize} />
      <Button kind="quiet" icon="plus" onclick={() => void addSize()}>{t('configui.add')}</Button>
    </div>
    {#each ['themes', 'languages'] as const as k (k)}
      <div class="ref-row">
        <span class="key">{t(`configui.refs.${k}`)}</span>
        {#each axis(k) as v (v)}<button type="button" class="chip" aria-label={t('configui.remove', { item: v })} onclick={() => void removeAxis(k, v)}><bdi dir="ltr">{v}</bdi><Icon name="x" size={12} /></button>{/each}
        {#if k === 'themes'}<input class="text short" dir="ltr" aria-label={t('configui.refs.themes')} bind:value={newTheme} /><Button kind="quiet" icon="plus" onclick={() => void addAxis(k, newTheme)}>{t('configui.add')}</Button>{:else}<input class="text short" dir="ltr" aria-label={t('configui.refs.languages')} bind:value={newLang} /><Button kind="quiet" icon="plus" onclick={() => void addAxis(k, newLang)}>{t('configui.add')}</Button>{/if}
      </div>
    {/each}
  {/if}
  <p class="small muted">{t('configui.refs.expectations')}</p>
</section>

<section class="card">
  <h2 class="card-title">{t('configui.refs.other')}</h2>
  <div class="ref-row">
    <span class="key">{t('configui.refs.label.outputs')}</span>
    {#each outputs as o (o)}<button type="button" class="chip" aria-label={t('configui.remove', { item: o })} onclick={() => void save('outputs', outputs.length > 1 ? outputs.filter((x) => x !== o) : null)}><bdi dir="ltr">{o}</bdi><Icon name="x" size={12} /></button>{/each}
    <input class="text short" dir="ltr" aria-label={t('configui.refs.label.outputs')} bind:value={newOutput} />
    <Button kind="quiet" icon="plus" disabled={!newOutput.trim()} onclick={() => void save('outputs', [...new Set([...outputs, newOutput.trim()])]).then(() => (newOutput = ''))}>{t('configui.add')}</Button>
  </div>
  <div class="ref-row">
    <span class="key">{t('configui.refs.label.recoveryCommand')}</span>
    <input class="text" dir="ltr" aria-label={t('configui.refs.label.recoveryCommand')} value={recovery} oninput={(e) => (recoveryText = e.currentTarget.value)} />
    <Button kind="secondary" disabled={!recoveryText.trim()} onclick={() => void save('recoveryCommand', recoveryText.trim().split(/\s+/))}>{t('configui.save')}</Button>
  </div>
</section>
{#if error}<p class="small" role="alert">{error}</p>{/if}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .card-head,
  .ref-row,
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .ref-row {
    padding-block: var(--space-8);
    border-block-end: 1px solid var(--border-subtle);
  }
  .card-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .key {
    min-inline-size: 140px;
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .edit {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-8);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    font: var(--type-label);
    color: var(--text-primary);
  }
  .text {
    min-inline-size: 260px;
    block-size: 28px;
    padding: 0 var(--space-8);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .text.short {
    min-inline-size: 120px;
    inline-size: 140px;
  }
  .text:focus-visible,
  .chip:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    padding: 1px var(--space-8);
    border: 0;
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-primary);
    cursor: pointer;
  }
  .end {
    text-align: end;
  }
  .spacer {
    flex: 1;
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
