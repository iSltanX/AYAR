<script lang="ts">
  // Screen 3 · اعتماد ملف المعايير (9.3, 13.3; Figma 3.1 146:1396, 3.2 146:2316 pending changes with the diff, 3.3
  // 146:2979 a dangerous command): the context declarations (optional, each with «لا أعرف», FR-13), the checks by
  // section in the sidebar's order (D-DES4-15) — enable switch, required/blocking/full-scan tags, the literal command
  // with what running it does, the alerts, why it was proposed — the variables withheld from checks with «اسمح
  // بتمريره» (D-47), and «اعتمد الكل» · «اعتمد المحدد» · «صدّر إلى المستودع…». A dangerous command is approved alone
  // (FR-56): it never enters «اعتمد الكل». Nothing runs before approval; every change asks again (D-08).
  import type { ChangeItem, CheckSpec, ExportPreview, ProfileContext, ProfileView, ResolvedEnv } from '@ayar/protocol';
  import Banner from '../components/Banner.svelte';
  import Button from '../components/Button.svelte';
  import CommandBlock from '../components/CommandBlock.svelte';
  import CostTag from '../components/CostTag.svelte';
  import Inspector from '../components/Inspector.svelte';
  import RiskNotice from '../components/RiskNotice.svelte';
  import Select from '../components/Select.svelte';
  import Sheet from '../components/Sheet.svelte';
  import SheetApprovalDiff from '../components/SheetApprovalDiff.svelte';
  import Switch from '../components/Switch.svelte';
  import TableGroupRow from '../components/TableGroupRow.svelte';
  import Tag from '../components/Tag.svelte';
  import { useLocale } from '../lib/locale.ts';
  import type { InspectorCheck } from '../lib/inspector.ts';
  import { attempt } from '../app/client.ts';
  import { checkTitle, costOf, sectionRank, sectionTitle, textOr } from '../app/format.ts';
  import { changeOf, commandOf, reasonsOf } from '../app/specs.ts';
  import { useApp } from '../app/state.svelte.ts';

  let { projectId }: { projectId: string } = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  let profile = $state<ProfileView | null>(null);
  let env = $state<ResolvedEnv | null>(null);
  let collapsed = $state<string[]>([]);
  let showDiff = $state(false);
  let preview = $state<ExportPreview | null>(null);
  let busy = $state(false);
  let selectedInstance = $state<string | null>(null);

  const project = $derived(app.project(projectId));

  async function load(): Promise<void> {
    let r = await attempt('profile.get', { projectId });
    if (!r.ok) r = await attempt('profile.propose', { projectId });
    if (r.ok) profile = r.result;
    const e = await attempt('environment.resolve', { projectId });
    if (e.ok) env = e.result.env;
  }
  $effect(() => {
    void load();
  });

  const approvedBefore = $derived(new Set(profile?.approvals.map((a) => a.instance) ?? []));
  const pendingBy = $derived(new Map((profile?.pending.items ?? []).map((i) => [i.instance, i])));
  const firstProposal = $derived(!!profile && profile.approvals.length === 0);
  /** What the profile proposes (13.3 «18 فحصًا مقترحًا»): the applicable checks the full scan includes, and any change. */
  const checks = $derived((profile?.checks ?? []).filter((c) => c.applicable && (c.included || pendingBy.has(c.instance))));
  const sections = $derived.by(() => {
    const by = new Map<string, CheckSpec[]>();
    for (const c of checks) by.set(c.section, [...(by.get(c.section) ?? []), c]);
    return [...by.entries()].sort((a, b) => sectionRank(a[0]) - sectionRank(b[0]));
  });
  const pendingItems = $derived(profile?.pending.items ?? []);
  const approvable = $derived(pendingItems.filter((i) => i.approvable && !i.approveAlone));
  const dangerous = $derived(pendingItems.filter((i) => i.approveAlone));
  const required = $derived(checks.filter((c) => c.required));
  const withheld = $derived((env?.withheld ?? []).filter((name) => !checks.some((c) => c.env.allowSensitive.includes(name))));

  /** The approval diff (Sheet/Approval diff): the approvable changes, by check id (instances keep their key when ids repeat). */
  const diffIds = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const i of approvable) counts.set(i.instance.split('@')[0]!, (counts.get(i.instance.split('@')[0]!) ?? 0) + 1);
    return new Map(approvable.map((i) => [i.instance, counts.get(i.instance.split('@')[0]!)! > 1 ? i.instance : i.instance.split('@')[0]!]));
  });
  const changes = $derived(approvable.map((i) => changeOf(t, lang, i, diffIds.get(i.instance)!)));

  // ── context declarations (FR-13) ─────────────────────────────────────────────────────────────────────────
  type Choice = 'unknown' | string;
  const ctx = $derived(profile?.context);
  const audienceOptions = $derived([
    { value: 'unknown', label: t('approval.context.unknown') },
    { value: 'solo', label: t('profile.audience.solo') },
    { value: 'small_group', label: t('profile.audience.small_group') },
    { value: 'public', label: t('profile.audience.public') },
  ]);
  const worstOptions = $derived([
    { value: 'unknown', label: t('approval.context.unknown') },
    { value: 'minor', label: t('approval.context.worst.minor') },
    { value: 'moderate', label: t('approval.context.worst.moderate') },
    { value: 'severe', label: t('approval.context.worst.severe') },
  ]);
  const yesNo = $derived([
    { value: 'unknown', label: t('approval.context.unknown') },
    { value: 'yes', label: t('approval.context.yes') },
    { value: 'no', label: t('approval.context.no') },
  ]);
  const stageOptions = $derived([
    { value: 'unknown', label: t('approval.context.unknown') },
    { value: 'prototype', label: t('approval.context.stage.prototype') },
    { value: 'active', label: t('approval.context.stage.active') },
    { value: 'maintenance', label: t('approval.context.stage.maintenance') },
  ]);
  const languageOptions = $derived([
    { value: 'unknown', label: t('approval.context.unknown') },
    { value: 'ar', label: t('approval.context.languages.ar') },
    { value: 'en', label: t('approval.context.languages.en') },
    { value: 'both', label: t('approval.context.languages.both') },
  ]);
  const bool = (v: boolean | null | undefined): Choice => (v === null || v === undefined ? 'unknown' : v ? 'yes' : 'no');
  const langsOf = (v: string[] | null | undefined): Choice => (!v?.length ? 'unknown' : v.includes('ar') && v.includes('en') ? 'both' : v.includes('ar') ? 'ar' : v.includes('en') ? 'en' : 'unknown');

  async function setContext(patch: Partial<ProfileContext>) {
    const r = await attempt('profile.update', { projectId, patch: { context: patch } });
    if (r.ok) profile = r.result;
  }
  const fromChoice = (v: Choice) => (v === 'unknown' ? null : v);
  const fromBool = (v: Choice) => (v === 'unknown' ? null : v === 'yes');
  const fromLangs = (v: Choice) => (v === 'unknown' ? null : v === 'both' ? ['ar', 'en'] : [v]);

  // ── actions ──────────────────────────────────────────────────────────────────────────────────────────────
  async function after(r: { ok: boolean }) {
    busy = false;
    if (r.ok) {
      await load();
      await app.refreshProjects();
    }
  }

  async function approve(instances?: string[]) {
    if (!profile || busy) return;
    busy = true;
    const r = await attempt('profile.approve', { projectId, changeSetId: profile.pending.id, ...(instances ? { instances } : {}) });
    await after(r);
  }

  async function approveAll() {
    // FR-56: «اعتمد الكل» approves every approvable change except a dangerous command, which stays for its own button.
    showDiff = false;
    if (approvable.length) await approve(approvable.map((i) => i.instance));
  }

  async function approveSelected(ids: string[]) {
    showDiff = false;
    const instances = approvable.filter((i) => ids.includes(diffIds.get(i.instance)!)).map((i) => i.instance);
    if (instances.length) await approve(instances);
  }

  async function setEnabled(spec: CheckSpec, enabled: boolean) {
    const r = await attempt('profile.update', { projectId, patch: { checks: { [spec.instance]: { enabled } } } });
    if (r.ok) profile = r.result;
  }

  async function allowVariable(name: string) {
    // D-47: passed by name, to the checks that run the project's code; each such check then asks for approval again.
    const targets = checks.filter((c) => c.sideEffects.runsProjectCode && !c.env.allowSensitive.includes(name));
    if (!targets.length || busy) return;
    busy = true;
    const r = await attempt('profile.update', { projectId, patch: { checks: Object.fromEntries(targets.map((c) => [c.instance, { allowSensitive: [...c.env.allowSensitive, name] }])) } });
    busy = false;
    if (r.ok) profile = r.result;
  }

  async function openExport() {
    const r = await attempt('profile.exportPreview', { projectId });
    if (r.ok) preview = r.result;
  }

  async function writeExport() {
    if (!preview) return;
    const digest = preview.previewDigest;
    const dest = await attempt('dialog.pickDestination', { purpose: 'profile.export', suggestedName: 'profile.json' });
    if (!dest.ok || 'cancelled' in dest.result) return;
    const r = await attempt('profile.export', { projectId, destinationToken: dest.result.destinationToken, previewDigest: digest });
    if (r.ok) preview = null;
  }

  // ── the inspector («عدّل», 13.3): the check's definition, why, limits, command and readiness ───────────────
  const selected = $derived(checks.find((c) => c.instance === selectedInstance) ?? null);
  const inspected = $derived.by<InspectorCheck | null>(() => {
    const c = selected;
    if (!c) return null;
    const key = (k: string) => `catalog.check.${c.checkId}.${k}`;
    const command = commandOf(c);
    return {
      kind: 'check',
      name: checkTitle(t, lang, c.checkId),
      id: c.checkId,
      definition: textOr(t, lang, key('why')),
      why: reasonsOf(t, lang, c.reasons).text,
      limits: textOr(t, lang, key('limits')),
      ...(command ? { command: { command, runsCode: c.sideEffects.runsProjectCode, writes: c.sideEffects.writesRepo === 'maybe', network: c.network === 'required' } } : {}),
      readiness: pendingBy.has(c.instance) ? 'needs-approval' : c.missing.length ? 'needs-setup' : 'ready',
    };
  });
  $effect(() => {
    const content = inspected;
    app.inspector = content ? inspectorSnippet : null;
    if (content) app.inspectorOpen = true;
    return () => (app.inspector = null);
  });

  function copyText(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  function edit(spec: CheckSpec) {
    selectedInstance = spec.instance;
  }

  const isNeeded = (c: CheckSpec) => pendingBy.has(c.instance) && approvedBefore.has(c.instance);
  const dangerOf = (c: CheckSpec): ChangeItem | undefined => dangerous.find((d) => d.instance === c.instance);
</script>

{#snippet inspectorSnippet()}
  {#if inspected}<Inspector id="ayar-inspector" content={inspected} oncopyid={copyText} oncopycommand={copyText} />{/if}
{/snippet}

{#snippet checkRow(c: CheckSpec)}
  {@const name = checkTitle(t, lang, c.checkId)}
  {@const command = commandOf(c)}
  {@const why = reasonsOf(t, lang, c.reasons)}
  {@const danger = dangerOf(c)}
  <article class="check" data-instance={c.instance}>
    <div class="check-head">
      <Switch checked={c.enabled} label={t('approval.enable', { name })} showLabel={false} onchange={(on) => void setEnabled(c, on)} />
      <span class="name">{name}</span>
      <span class="id"><bdi dir="ltr">{c.checkId}{c.component !== '.' ? `@${c.component}` : ''}</bdi></span>
      <span class="spacer"></span>
      {#if c.required}<Tag>{t('approval.tag.required')}</Tag>{/if}
      {#if c.blocking}<Tag>{t('approval.tag.blocking')}</Tag>{/if}
      {#if c.included && c.inIndex}<Tag>{t('approval.tag.included')}</Tag>{/if}
      {#if isNeeded(c)}<Tag>{t('approval.tag.needsApproval')}</Tag>{/if}
      <CostTag cost={costOf(c.network, c.cost)} />
      <Button kind="quiet" onclick={() => edit(c)}>{t('approval.edit')}</Button>
    </div>
    {#if command}
      <CommandBlock {command} runsCode={c.sideEffects.runsProjectCode} writes={c.sideEffects.writesRepo === 'maybe'} network={c.network === 'required'} oncopy={copyText} />
    {/if}
    {#if c.resourceClass === 'heavy' || c.resourceClass === 'very_heavy' || c.missing.length}
      <div class="alerts">
        {#if c.resourceClass === 'heavy' || c.resourceClass === 'very_heavy'}<Tag kind="neutral-icon" icon="clock">{t('approval.tag.heavy')}</Tag>{/if}
        {#each c.missing as m, i (i)}
          <Tag>{m.kind === 'configuration' ? t('profile.missing.configuration', { ref: m.ref ? t(`profile.ref.${m.ref}`) : '' }) : t(`profile.missing.${m.kind}`)}</Tag>
        {/each}
      </div>
    {/if}
    {#if danger}<RiskNotice disabled={busy} onapprove={() => void approve([c.instance])} />{/if}
    <p class="because">
      <span>{c.checkId.startsWith('custom.') ? t('approval.customBecause') : t('approval.because')}</span>
      {#if c.checkId.startsWith('custom.')}<Tag><bdi dir="ltr">.ayar/profile.json</bdi></Tag>{:else}<span>{why.text}</span>{/if}
      {#each why.refs as ref (ref)}<Tag>{ref}</Tag>{/each}
    </p>
  </article>
{/snippet}

{#if profile}
  <div class="page">
    {#if !firstProposal && pendingItems.length}
      <Banner kind="needs-approval" count={pendingItems.length} onshowdiff={() => (showDiff = true)} />
    {/if}
    <header class="page-header">
      <h1 class="title">{t(firstProposal ? 'approval.title.proposed' : 'approval.title.current', { version: profile.version })}</h1>
      <p class="subtitle">
        {#if firstProposal}{t('approval.subtitle.proposed', { name: project?.displayName ?? '' })}{:else if pendingItems.length}{t('approval.subtitle.pending', { count: pendingItems.length })}{:else}{t('approval.subtitle.approved')}{/if}
      </p>
    </header>

    {#if ctx}
      <section class="card context" aria-labelledby="ctx-title">
        <div class="card-head">
          <h2 class="card-title" id="ctx-title">{t('approval.context.title')}</h2>
          <Tag>{t('approval.context.optional')}</Tag>
        </div>
        <p class="hint">{t('approval.context.hint')}</p>
        <div class="fields">
          <label class="field"><span>{t('approval.context.audience')}</span><Select width="fill" value={ctx.audience ?? 'unknown'} options={audienceOptions} onchange={(e) => void setContext({ audience: fromChoice(e.currentTarget.value) as ProfileContext['audience'] })} /></label>
          <label class="field"><span>{t('approval.context.worst')}</span><Select width="fill" value={ctx.worstConsequence ?? 'unknown'} options={worstOptions} onchange={(e) => void setContext({ worstConsequence: fromChoice(e.currentTarget.value) as ProfileContext['worstConsequence'] })} /></label>
          <label class="field"><span>{t('approval.context.persistent')}</span><Select width="fill" value={bool(ctx.persistentData)} options={yesNo} onchange={(e) => void setContext({ persistentData: fromBool(e.currentTarget.value) })} /></label>
          <label class="field"><span>{t('approval.context.permissions')}</span><Select width="fill" value={bool(ctx.permissions)} options={yesNo} onchange={(e) => void setContext({ permissions: fromBool(e.currentTarget.value) })} /></label>
          <label class="field"><span>{t('approval.context.stage')}</span><Select width="fill" value={ctx.stage ?? 'unknown'} options={stageOptions} onchange={(e) => void setContext({ stage: fromChoice(e.currentTarget.value) as ProfileContext['stage'] })} /></label>
          <label class="field"><span>{t('approval.context.languages')}</span><Select width="fill" value={langsOf(ctx.uiLanguages)} options={languageOptions} onchange={(e) => void setContext({ uiLanguages: fromLangs(e.currentTarget.value) })} /></label>
        </div>
      </section>
    {/if}

    {#each sections as [section, list] (section)}
      {@const open = !collapsed.includes(section)}
      <div class="group" role="grid" aria-label={sectionTitle(t, section)}>
        <div role="row">
          <TableGroupRow title={sectionTitle(t, section)} count={list.length} expanded={open} controls="sec-{section}" ontoggle={(e) => (collapsed = e ? collapsed.filter((s) => s !== section) : [...collapsed, section])} />
        </div>
      </div>
      {#if open}
        <div class="checks" id="sec-{section}">
          {#each list as c (c.instance)}{@render checkRow(c)}{/each}
        </div>
      {/if}
    {/each}

    {#if withheld.length}
      <section class="card env" aria-labelledby="env-title">
        <h2 class="card-title" id="env-title">{t('approval.env.title')}</h2>
        {#each withheld as name (name)}
          <div class="env-row">
            <span class="env-name"><bdi dir="ltr">{name}</bdi></span>
            <div class="env-note">
              <span>{t('approval.env.present')}</span>
              <span>{t('approval.env.warning')}</span>
            </div>
            <Button kind="secondary" disabled={busy} onclick={() => void allowVariable(name)}>{t('approval.env.allow')}</Button>
          </div>
        {/each}
      </section>
    {/if}

    <footer class="footer">
      <Button kind="primary" disabled={busy || !approvable.length} onclick={() => void approveAll()}>{t('ui.action.approveAll')}</Button>
      <Button kind="secondary" disabled={busy || !approvable.length} onclick={() => (showDiff = true)}>{t('ui.action.approveSelected')}</Button>
      <Button kind="quiet" onclick={() => void openExport()}>{t('approval.export')}</Button>
      <span class="spacer"></span>
      <span class="summary">{dangerous.length ? t('approval.footer.dangerNote') : t('approval.footer.summary', { proposed: checks.filter((c) => c.included).length, required: required.length, blocking: required.filter((c) => c.blocking).length })}</span>
    </footer>
  </div>

  <SheetApprovalDiff open={showDiff} {changes} oncancel={() => (showDiff = false)} onapproveall={() => void approveAll()} onapproveselected={(ids) => void approveSelected(ids)} />

  <Sheet open={preview !== null} title={t('approval.export.title')} width="wide" oncancel={() => (preview = null)}>
    {#if preview}
      <p class="sheet-intro">{preview.existing ? t('approval.export.introExisting') : t('approval.export.intro')}</p>
      <div class="diff" dir="ltr">
        {#each preview.diff as line, i (i)}
          <div class="diff-line {line.op === '+' ? 'added' : line.op === '-' ? 'removed' : 'context'}"><span class="sign">{line.op === '=' ? ' ' : line.op === '-' ? '−' : '+'}</span><span class="text">{line.line}</span></div>
        {/each}
      </div>
    {/if}
    {#snippet footer()}
      <Button kind="secondary" data-initial-focus onclick={() => (preview = null)}>{t('ui.action.cancel')}</Button>
      <Button kind="primary" onclick={() => void writeExport()}>{t('approval.export.write')}</Button>
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
  .context {
    gap: var(--space-12);
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .card-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .hint {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-12) var(--space-16);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .field > span {
    font: var(--type-label);
    color: var(--text-secondary);
  }
  .group :global(.group-row) {
    inline-size: 100%;
  }
  .checks {
    display: contents;
  }
  .check {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding-block: var(--space-12);
    border-block-end: 1px solid var(--border-subtle);
  }
  .check-head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .name {
    font: var(--type-body-strong);
    color: var(--text-primary);
    white-space: nowrap;
  }
  .id {
    font: var(--type-mono);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  .alerts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
  .because {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .env-row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding-block: var(--space-8);
    border-block-end: 1px solid var(--border-subtle);
  }
  .env-name {
    font: var(--type-mono);
    color: var(--text-primary);
  }
  .env-note {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .footer {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding-block-start: var(--space-16);
    border-block-start: 1px solid var(--border-subtle);
  }
  .summary {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .sheet-intro {
    margin: 0;
    font: var(--type-body);
    color: var(--text-secondary);
  }
  .diff {
    display: flex;
    flex-direction: column;
    max-block-size: 360px;
    overflow: auto;
    padding: var(--space-4) 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    text-align: left;
  }
  .diff-line {
    display: flex;
    gap: var(--space-8);
    min-block-size: 24px;
    padding: 2px var(--space-8);
    font: var(--type-mono);
    color: var(--text-primary);
    white-space: pre;
  }
  .diff-line.removed {
    background: var(--bg-sunken);
  }
  .diff-line.added {
    background: var(--border-subtle);
  }
  .sign {
    flex: none;
    inline-size: 16px;
    color: var(--text-secondary);
  }
</style>
