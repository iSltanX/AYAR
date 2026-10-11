<script lang="ts">
  // Screen 19 · إعداد المشروع (13.3; Figma 19.1–19.8): the profile and everything that shapes a run, by tab — the
  // file (its version, where it lives, the repository copy, import and export, the versions), the checks (enable,
  // required, blocking, command, timeout), the environment (the computed tools and the withheld variables), the
  // references, the context declarations, the approval of pending changes (nothing runs before it), the companion
  // services, and the trust mode («غير موثوق»: no project command runs). Every change to what runs asks for approval
  // again (D-08).
  import type { ChangeItem, ProfileContext, ProfileVersion, ProfileView } from '@ayar/protocol';
  import Banner from '../components/Banner.svelte';
  import Button from '../components/Button.svelte';
  import Icon from '../components/Icon.svelte';
  import RadioGroup from '../components/RadioGroup.svelte';
  import Select from '../components/Select.svelte';
  import Sheet from '../components/Sheet.svelte';
  import SheetApprovalDiff from '../components/SheetApprovalDiff.svelte';
  import Tabs from '../components/Tabs.svelte';
  import Tag from '../components/Tag.svelte';
  import { useLocale } from '../lib/locale.ts';
  import { attempt } from '../app/client.ts';
  import { checkTitle, day, dayTime } from '../app/format.ts';
  import { changeOf } from '../app/specs.ts';
  import { CONFIG_TABS, useApp, type ConfigTab } from '../app/state.svelte.ts';
  import ChecksTab from './config/ChecksTab.svelte';
  import EnvironmentTab from './config/EnvironmentTab.svelte';
  import ReferencesTab from './config/ReferencesTab.svelte';
  import ServicesTab from './config/ServicesTab.svelte';

  let { projectId, tab }: { projectId: string; tab: ConfigTab } = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  let profile = $state<ProfileView | null>(null);
  let versions = $state<ProfileVersion[]>([]);
  let inRepo = $state<boolean | null>(null);
  async function load(): Promise<void> {
    let r = await attempt('profile.get', { projectId });
    if (!r.ok) r = await attempt('profile.propose', { projectId });
    if (r.ok) profile = r.result;
    const [v, p] = await Promise.all([attempt('profile.versions', { projectId }), attempt('project.get', { projectId })]);
    if (v.ok) versions = v.result.versions;
    if (p.ok) inRepo = !!p.result.snapshot?.facts.some((f) => f.key === 'ayar.repoProfile');
  }
  $effect(() => {
    void load();
  });
  const untrusted = $derived(profile?.untrusted ?? false);
  const go = (next: string) => app.navigate({ name: 'config', projectId, tab: next as ConfigTab });
  const tabs = $derived(CONFIG_TABS.map((v) => ({ value: v, label: t(`configui.tab.${v}`) })));
  const approvedAt = $derived(profile?.approvals.map((a) => a.approvedAt).sort().at(-1) ?? null);
  const updated = (p: ProfileView) => {
    profile = p;
  };

  // ── 19.1 the file ──────────────────────────────────────────────────────────────────────────────────────────
  const versionChange = (v: ProfileVersion) => {
    const parts: string[] = [];
    if (v.changes.added.length) parts.push(t('configui.file.added', { checks: v.changes.added.slice(0, 3).map((i) => checkTitle(t, lang, i.split('@')[0]!)).join(lang === 'ar' ? `${String.fromCharCode(0x60c)} ` : ', '), count: v.changes.added.length }));
    if (v.changes.changed.length) parts.push(t('configui.file.changed', { count: v.changes.changed.length }));
    if (v.changes.removed.length) parts.push(t('configui.file.removed', { count: v.changes.removed.length }));
    if (v.approved.length) parts.push(t('configui.file.approved', { count: v.approved.length }));
    return parts.join(lang === 'ar' ? `${String.fromCharCode(0x60c)} ` : '; ') || t(`configui.file.source.${v.source}`);
  };
  let preview = $state<{ previewDigest: string; existing: boolean; diff: { op: string; line: string }[] } | null>(null);
  async function openExport(): Promise<void> {
    const r = await attempt('profile.exportPreview', { projectId });
    if (r.ok) preview = r.result;
  }
  async function writeExport(): Promise<void> {
    if (!preview) return;
    const digest = preview.previewDigest;
    const dest = await attempt('dialog.pickDestination', { purpose: 'profile.export', suggestedName: 'profile.json' });
    if (!dest.ok || 'cancelled' in dest.result) return;
    const r = await attempt('profile.export', { projectId, destinationToken: dest.result.destinationToken, previewDigest: digest });
    if (r.ok) {
      preview = null;
      await load();
    }
  }
  async function importProfile(): Promise<void> {
    const src = await attempt('dialog.pickSource', { purpose: 'profile.import' });
    if (!src.ok || 'cancelled' in src.result) return;
    const r = await attempt('profile.import', { projectId, sourceToken: src.result.sourceToken });
    if (!r.ok) return;
    profile = r.result;
    // The import shows its difference before approval; nothing changed runs before it (15.2).
    go('approval');
  }

  // ── 19.5 the context ───────────────────────────────────────────────────────────────────────────────────────
  const ctx = $derived(profile?.context ?? null);
  async function setContext(patch: Partial<ProfileContext>): Promise<void> {
    const r = await attempt('profile.update', { projectId, patch: { context: patch } });
    if (r.ok) profile = r.result;
  }
  const UNKNOWN = 'unknown';
  const triState = (v: boolean | null | undefined) => (v === null || v === undefined ? UNKNOWN : v ? 'yes' : 'no');
  const fromTri = (v: string) => (v === UNKNOWN ? null : v === 'yes');
  let newLang = $state('');

  // ── 19.6 the approval ──────────────────────────────────────────────────────────────────────────────────────
  const pending = $derived<ChangeItem[]>(profile?.pending.items ?? []);
  const approvable = $derived(pending.filter((i) => i.approvable && !i.approveAlone));
  const alone = $derived(pending.filter((i) => i.approveAlone));
  let showDiff = $state(false);
  const changes = $derived(approvable.map((i) => changeOf(t, lang, i, i.instance.split('@')[0] ?? i.instance)));
  async function approve(instances: string[]): Promise<void> {
    if (!profile || !instances.length) return;
    showDiff = false;
    const r = await attempt('profile.approve', { projectId, changeSetId: profile.pending.id, instances });
    if (r.ok) {
      profile = r.result.profile;
      await app.refreshProjects();
      await load();
    }
  }
  const approveSelected = (ids: string[]) => approve(approvable.filter((i) => ids.includes(i.instance.split('@')[0] ?? i.instance)).map((i) => i.instance));

  // ── 19.8 the trust ─────────────────────────────────────────────────────────────────────────────────────────
  let trustBusy = $state(false);
  async function setTrust(trusted: boolean): Promise<void> {
    if (trustBusy || trusted === !untrusted) return;
    trustBusy = true;
    const r = await attempt('project.setTrust', { projectId, trusted });
    trustBusy = false;
    if (r.ok) {
      await app.refreshProjects();
      await load();
    }
  }
  const runsProjectCode = (c: ProfileView['checks'][number]) => c.sideEffects.runsProjectCode || c.services.length > 0 || (!!c.command && ['script', 'user', 'custom'].includes(c.command.from));
  const trustRows = $derived((profile?.checks ?? []).filter((c) => c.applicable && c.enabled && c.included));
</script>

{#if profile}
  <div class="page" data-testid="config" data-tab={tab}>
    {#if untrusted}
      <div class="trust-banner" role="status">
        <Icon name="lock" size={16} />
        <span class="strong">{t('configui.trust.banner')}</span>
        <span class="spacer"></span>
        <Button kind="secondary" disabled={trustBusy} onclick={() => go('trust')}>{t('configui.trust.make')}</Button>
      </div>
    {/if}
    {#if pending.length && tab !== 'approval'}
      <Banner kind="needs-approval" count={pending.length} onshowdiff={() => go('approval')} />
    {/if}
    <header class="header">
      <div class="title-row">
        <h1 class="title">{t('configui.title')}</h1>
        <span class="spacer"></span>
        <span class="small muted">{approvedAt ? t('configui.meta', { version: profile.version, date: dayTime(approvedAt, lang) }) : t('configui.metaNotApproved', { version: profile.version })}</span>
      </div>
      <Tabs value={tab} {tabs} label={t('configui.tabs')} onchange={(v: string) => go(v)} />
    </header>

    {#if tab === 'file'}
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">{t('configui.file.title')}</h2>
          <span class="spacer"></span>
          <Button kind="secondary" onclick={() => void importProfile()}>{t('configui.file.import')}</Button>
          <Button kind="primary" onclick={() => void openExport()}>{t('configui.file.export')}</Button>
        </div>
        <dl class="facts">
          <dt>{t('configui.file.version')}</dt><dd>{profile.version}</dd>
          <dt>{t('configui.file.date')}</dt><dd>{approvedAt ? t('configui.file.approvedOn', { date: dayTime(approvedAt, lang) }) : t('configui.file.notApproved')}</dd>
          <dt>{t('configui.file.where')}</dt><dd>{t('configui.file.whereText')}</dd>
          <dt>{t('configui.file.repo')}</dt><dd>{inRepo ? t('configui.file.inRepo') : t('configui.file.notInRepo')}</dd>
        </dl>
        <p class="small muted">{t('configui.file.importNote')}</p>
      </section>
      <section class="card">
        <h2 class="card-title">{t('configui.file.versions')}</h2>
        <table class="ptable">
          <thead><tr><th scope="col">{t('configui.file.version')}</th><th scope="col">{t('configui.file.date')}</th><th scope="col">{t('configui.file.whatChanged')}</th></tr></thead>
          <tbody>
            {#each versions as v (v.version)}
              <tr><td><span class="val">{v.version}</span></td><td>{day(v.createdAt, lang)}</td><td class="small">{versionChange(v)}</td></tr>
            {/each}
          </tbody>
        </table>
      </section>
    {:else if tab === 'checks'}
      <ChecksTab {projectId} {profile} onupdated={updated} />
    {:else if tab === 'environment'}
      <EnvironmentTab {projectId} {profile} onupdated={updated} />
    {:else if tab === 'references'}
      <ReferencesTab {projectId} {profile} onupdated={updated} />
    {:else if tab === 'context' && ctx}
      <section class="card">
        <div class="card-head"><h2 class="card-title">{t('configui.context.title')}</h2><span class="spacer"></span><span class="small muted">{t('configui.context.optional')}</span></div>
        <p class="small muted">{t('configui.context.hint')}</p>
        <RadioGroup label={t('approval.context.audience')} value={ctx.audience ?? UNKNOWN} options={[{ value: 'solo', label: t('profile.audience.solo') }, { value: 'small_group', label: t('profile.audience.small_group') }, { value: 'public', label: t('profile.audience.public') }, { value: UNKNOWN, label: t('approval.context.unknown') }]} onchange={(v: string) => void setContext({ audience: v === UNKNOWN ? null : (v as ProfileContext['audience']) })} />
        <label class="field"><span>{t('approval.context.worst')}</span><Select width={280} value={ctx.worstConsequence ?? UNKNOWN} options={[{ value: UNKNOWN, label: t('approval.context.unknown') }, { value: 'minor', label: t('approval.context.worst.minor') }, { value: 'moderate', label: t('approval.context.worst.moderate') }, { value: 'severe', label: t('approval.context.worst.severe') }]} onchange={(e: Event & { currentTarget: HTMLSelectElement }) => void setContext({ worstConsequence: e.currentTarget.value === UNKNOWN ? null : (e.currentTarget.value as ProfileContext['worstConsequence']) })} /></label>
        <RadioGroup label={t('approval.context.persistent')} value={triState(ctx.persistentData)} options={[{ value: 'yes', label: t('approval.context.yes') }, { value: 'no', label: t('approval.context.no') }, { value: UNKNOWN, label: t('approval.context.unknown') }]} onchange={(v: string) => void setContext({ persistentData: fromTri(v) })} />
        <RadioGroup label={t('approval.context.permissions')} value={triState(ctx.permissions)} options={[{ value: 'yes', label: t('approval.context.yes') }, { value: 'no', label: t('approval.context.no') }, { value: UNKNOWN, label: t('approval.context.unknown') }]} onchange={(v: string) => void setContext({ permissions: fromTri(v) })} />
        <label class="field"><span>{t('approval.context.stage')}</span><Select width={280} value={ctx.stage ?? UNKNOWN} options={[{ value: UNKNOWN, label: t('approval.context.unknown') }, { value: 'prototype', label: t('approval.context.stage.prototype') }, { value: 'active', label: t('approval.context.stage.active') }, { value: 'maintenance', label: t('approval.context.stage.maintenance') }]} onchange={(e: Event & { currentTarget: HTMLSelectElement }) => void setContext({ stage: e.currentTarget.value === UNKNOWN ? null : (e.currentTarget.value as ProfileContext['stage']) })} /></label>
        <div class="field">
          <span>{t('approval.context.languages')}</span>
          <p class="row">
            {#each ctx.uiLanguages ?? [] as l (l)}<button type="button" class="chip" aria-label={t('configui.remove', { item: l })} onclick={() => void setContext({ uiLanguages: (ctx.uiLanguages ?? []).filter((x) => x !== l) })}>{l === 'ar' ? t('approval.context.languages.ar') : l === 'en' ? t('approval.context.languages.en') : l}<Icon name="x" size={12} /></button>{/each}
            <input class="lang-input" bind:value={newLang} aria-label={t('configui.context.addLanguage')} placeholder={t('configui.context.langPlaceholder')} maxlength={8} dir="ltr" />
            <Button kind="quiet" icon="plus" disabled={!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(newLang)} onclick={() => { void setContext({ uiLanguages: [...new Set([...(ctx.uiLanguages ?? []), newLang])] }); newLang = ''; }}>{t('configui.add')}</Button>
          </p>
        </div>
      </section>
    {:else if tab === 'approval'}
      <section class="pending-head">
        <Icon name="file-diff" size={16} />
        <span class="strong">{pending.length ? t('configui.approval.needs', { count: pending.length }) : t('configui.approval.none')}</span>
        <span class="spacer"></span>
        {#if approvable.length}<Button kind="secondary" onclick={() => (showDiff = true)}>{t('configui.approval.showDiff')}</Button>{/if}
      </section>
      {#if pending.length}
        <section class="card">
          <h2 class="card-title">{t('configui.approval.pending', { count: pending.length })}</h2>
          {#each pending as i (i.instance)}
            <div class="pending-row">
              <span class="stack"><span class="strong">{checkTitle(t, lang, i.instance.split('@')[0] ?? i.instance)}</span><bdi class="mono muted" dir="ltr">{i.instance}</bdi></span>
              <span class="spacer"></span>
              {#if i.approveAlone}<Tag icon="triangle-alert">{t('configui.approval.alone')}</Tag><Button kind="secondary" onclick={() => void approve([i.instance])}>{t('configui.approval.approveOne')}</Button>{:else if !i.approvable}<Tag>{t('configui.approval.blocked')}</Tag>{/if}
            </div>
          {/each}
          <div class="row-end">
            <Button kind="secondary" disabled={!approvable.length} onclick={() => (showDiff = true)}>{t('ui.action.approveSelected')}</Button>
            <Button kind="primary" disabled={!approvable.length} onclick={() => void approve(approvable.map((i) => i.instance))}>{t('ui.action.approveAll')}</Button>
          </div>
          {#if alone.length}<p class="small muted">{t('approval.footer.dangerNote')}</p>{/if}
        </section>
      {/if}
    {:else if tab === 'services'}
      <ServicesTab {projectId} {profile} onupdated={updated} />
    {:else if tab === 'trust'}
      <section class="card">
        <h2 class="card-title">{t('configui.trust.title')}</h2>
        <RadioGroup label={t('configui.trust.title')} value={untrusted ? 'untrusted' : 'trusted'} disabled={trustBusy} options={[{ value: 'trusted', label: t('configui.trust.trusted') }, { value: 'untrusted', label: t('configui.trust.untrusted') }]} onchange={(v: string) => void setTrust(v === 'trusted')} />
        <p class="small muted">{untrusted ? t('configui.trust.untrustedNote') : t('configui.trust.trustedNote')}</p>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">{t('configui.trust.what')}</h2><span class="spacer"></span><span class="small muted">{t('configui.trust.summary', { readers: trustRows.filter((c) => !runsProjectCode(c)).length, missing: untrusted ? trustRows.filter(runsProjectCode).length : 0 })}</span></div>
        <table class="ptable">
          <thead><tr><th scope="col">{t('scanplan.column.check')}</th><th scope="col">{t('configui.trust.inPlan')}</th><th scope="col">{t('configui.trust.why')}</th></tr></thead>
          <tbody>
            {#each trustRows as c (c.instance)}
              {@const blocked = untrusted && runsProjectCode(c)}
              <tr>
                <td><span class="stack"><span class="strong">{checkTitle(t, lang, c.checkId)}</span><bdi class="mono muted" dir="ltr">{c.checkId}</bdi></span></td>
                <td>{#if blocked}<Tag icon="circle-alert">{t('configui.trust.missing')}</Tag>{:else}<Tag>{t('status.readiness.ready')}</Tag>{/if}</td>
                <td class="small">{runsProjectCode(c) ? t('configui.trust.runsCode') : t('configui.trust.reader')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  </div>

  <SheetApprovalDiff open={showDiff} {changes} oncancel={() => (showDiff = false)} onapproveall={() => void approve(approvable.map((i) => i.instance))} onapproveselected={(ids: string[]) => void approveSelected(ids)} />

  <Sheet open={preview !== null} title={t('approval.export.title')} width="wide" oncancel={() => (preview = null)}>
    {#if preview}
      <p class="small">{preview.existing ? t('approval.export.introExisting') : t('approval.export.intro')}</p>
      <div class="diff" dir="ltr">
        {#each preview.diff as line, i (i)}
          <div class="diff-line {line.op === '+' ? 'added' : line.op === '-' ? 'removed' : 'context'}"><span class="sign">{line.op === '=' ? ' ' : line.op === '-' ? '−' : '+'}</span><span>{line.line}</span></div>
        {/each}
      </div>
    {/if}
    {#snippet footer()}
      <Button kind="secondary" onclick={() => (preview = null)}>{t('ui.action.cancel')}</Button>
      <Button kind="primary" onclick={() => void writeExport()}>{t('configui.file.exportSave')}</Button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-24);
    padding: var(--space-24) var(--space-32);
  }
  .header {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }
  .title-row,
  .card-head,
  .pending-head,
  .trust-banner {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .title {
    margin: 0;
    font: var(--type-title-page);
    color: var(--text-primary);
  }
  .trust-banner,
  .pending-head {
    padding: var(--space-12) var(--space-16);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-card);
    background: var(--bg-sunken);
    color: var(--text-primary);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
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
  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-12) var(--space-24);
    margin: 0;
    font: var(--type-body);
    color: var(--text-primary);
  }
  .facts dt {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .facts dd {
    margin: 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    font: var(--type-label);
    color: var(--text-primary);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
  }
  .row-end {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-8);
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
  .chip:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .lang-input {
    inline-size: 64px;
    block-size: 24px;
    padding: 0 var(--space-8);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .pending-row {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding-block: var(--space-8);
    border-block-end: 1px solid var(--border-subtle);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .diff {
    max-block-size: 360px;
    overflow: auto;
    border-radius: var(--radius-control);
    background: var(--bg-sunken);
    font: var(--type-mono);
  }
  .diff-line {
    display: flex;
    gap: var(--space-8);
    padding: 0 var(--space-12);
    white-space: pre-wrap;
  }
  .diff-line.added,
  .diff-line.removed {
    background: var(--border-subtle);
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
