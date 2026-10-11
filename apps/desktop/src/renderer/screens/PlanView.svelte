<script lang="ts">
  // Screen 5 · خطة الفحص الكامل (9.4, 9.5, 13.3; Figma 5.1 160:44428, 5.2 the setup panel 160:45464, 5.3 the approval
  // alert 160:46587): the plan the engine built before anything runs (G-24) — the summary with its estimate (marked,
  // from earlier durations), the table by section (name, readiness apart from any result, the command folded,
  // resources, estimate, cost, effects), «ما لن يُشغَّل ولماذا», «جهّز الناقص» (the setup panel) and «ابدأ الفحص
  // الكامل». A required check that needs approval shows as missing (9.4 point 5) and the page says so.
  import type { CheckSpec, PlanItem, ProfileView, RunPlan } from '@ayar/protocol';
  import Banner from '../components/Banner.svelte';
  import Button from '../components/Button.svelte';
  import CommandBlock from '../components/CommandBlock.svelte';
  import CostTag from '../components/CostTag.svelte';
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import ReadinessBadge from '../components/ReadinessBadge.svelte';
  import TableGroupRow from '../components/TableGroupRow.svelte';
  import TableHeaderCell from '../components/TableHeaderCell.svelte';
  import { useLocale } from '../lib/locale.ts';
  import { attempt, copyText } from '../app/client.ts';
  import { bySection, checkTitle, clockMs, costOf, readinessOf, reasonText, sectionTitle } from '../app/format.ts';
  import { argvText, commandOf } from '../app/specs.ts';
  import { useApp } from '../app/state.svelte.ts';
  import SetupFlow from './parts/SetupFlow.svelte';

  let { projectId }: { projectId: string } = $props();
  const app = useApp();
  const { t, lang, dir } = useLocale();

  let plan = $state<RunPlan | null>(null);
  let profile = $state<ProfileView | null>(null);
  let collapsed = $state<string[]>([]);
  let expanded = $state<string[]>([]);
  let setupOpen = $state(false);
  let starting = $state(false);
  let error = $state<string | null>(null);

  async function load(): Promise<void> {
    const [p, prof] = await Promise.all([attempt('run.plan', { projectId, selection: { kind: 'full' } }), attempt('profile.get', { projectId })]);
    if (p.ok) plan = p.result;
    else error = p.error.code;
    if (prof.ok) profile = prof.result;
  }
  $effect(() => {
    void load();
  });

  const specs = $derived(new Map<string, CheckSpec>((profile?.checks ?? []).map((c) => [c.instance, c])));
  const RUNS = new Set(['run', 'shared', 'covered']);
  const MISSING = new Set(['missing', 'untrusted']);
  const rows = $derived((plan?.items ?? []).filter((i) => RUNS.has(i.status) || MISSING.has(i.status)));
  const sections = $derived(bySection(rows, (i) => i.section));
  const runCount = $derived(rows.filter((i) => RUNS.has(i.status)).length);
  const missingItems = $derived(rows.filter((i) => MISSING.has(i.status)));
  const needsApproval = $derived(missingItems.filter((i) => i.readiness === 'needs_approval'));
  const setupCount = $derived(new Set(missingItems.flatMap((i) => i.setupActions)).size);
  const notApplicable = $derived(plan?.willNotRun.filter((w) => w.status === 'not_applicable').length ?? 0);
  const notIncluded = $derived(plan?.willNotRun.filter((w) => w.status === 'not_included').length ?? 0);
  const willNotRun = $derived((plan?.willNotRun ?? []).filter((w) => w.status === 'not_included' || w.status === 'not_applicable'));

  const summary = $derived(
    [
      t('scanplan.summary.run', { count: runCount }),
      missingItems.length ? t('scanplan.summary.missing', { count: missingItems.length }) : null,
      notApplicable ? t('scanplan.summary.notApplicable', { count: notApplicable }) : null,
      notIncluded ? t('scanplan.summary.notIncluded', { count: notIncluded }) : null,
      plan?.estimateMs ? t('scanplan.summary.estimate', { duration: estimate(plan.estimateMs) }) : null,
    ]
      .filter(Boolean)
      .join(' · '),
  );

  function estimate(ms: number | null): string {
    if (ms === null) return t('scanplan.estimate.none');
    if (ms < 60_000) return t('scanplan.estimate.seconds', { seconds: Math.max(1, Math.round(ms / 1000)) });
    return t('scanplan.estimate.clock', { clock: clockMs(ms) });
  }

  function commandText(i: PlanItem): string | null {
    const spec = specs.get(i.instance);
    if (spec) return commandOf(spec);
    return i.command ? argvText(i.command.argv) : null;
  }

  async function start(): Promise<void> {
    if (!plan || starting) return;
    starting = true;
    const r = await attempt('run.start', { planId: plan.id });
    starting = false;
    if (!r.ok) {
      error = r.error.code;
      // A plan is frozen once started or stale after a profile change: build it again (G-24).
      if (r.error.code === 'plan_stale') void load();
      return;
    }
    await app.runs.load(r.result.runId);
    app.navigate({ name: 'scan', projectId, runId: r.result.runId });
  }

  const toggle = (instance: string) => (expanded = expanded.includes(instance) ? expanded.filter((x) => x !== instance) : [...expanded, instance]);
</script>

<div class="page">
  <header class="page-header">
    <h1 class="title">{t('scanplan.title')}</h1>
    <p class="subtitle">{t('scanplan.subtitle')}</p>
  </header>

  {#if needsApproval.length}
    <Banner kind="needs-approval" count={needsApproval.length} message={t('scanplan.approvalAlert', { count: needsApproval.length })} actionLabel={t('ui.action.approveNow')} onshowdiff={() => app.navigate({ name: 'profile', projectId })} />
  {/if}

  {#if plan}
    <section class="card summary" aria-label={t('scanplan.title')}>
      <div class="summary-row">
        <p class="summary-text">{summary}</p>
        <Button kind="primary" disabled={starting} onclick={() => void start()}>{t('ui.action.startFullScan')}</Button>
        {#if setupCount}<Button kind="secondary" onclick={() => (setupOpen = true)}>{t('scanplan.setupMissing', { count: setupCount })}</Button>{/if}
      </div>
      {#if missingItems.length}<p class="note">{t('scanplan.summary.note')}</p>{/if}
    </section>

    <table class="plan" data-testid="plan-table">
      <thead>
        <tr>
          <th class="c-check" scope="col"><TableHeaderCell label={t('scanplan.column.check')} sortable={false} /></th>
          <th class="c-ready" scope="col"><TableHeaderCell label={t('scanplan.column.readiness')} sortable={false} /></th>
          <th class="c-cmd" scope="col"><TableHeaderCell label={t('scanplan.column.command')} sortable={false} /></th>
          <th class="c-res" scope="col"><TableHeaderCell label={t('scanplan.column.resources')} sortable={false} /></th>
          <th class="c-dur" scope="col"><TableHeaderCell label={t('scanplan.column.duration')} sortable={false} /></th>
          <th class="c-cost" scope="col"><TableHeaderCell label={t('scanplan.column.cost')} sortable={false} /></th>
          <th class="c-fx" scope="col"><TableHeaderCell label={t('scanplan.column.effects')} sortable={false} overflow="start" /></th>
        </tr>
      </thead>
      {#each sections as [section, items] (section)}
        {@const open = !collapsed.includes(section)}
        <tbody>
          <tr class="group"><td colspan="7"><div role="grid" aria-label={sectionTitle(t, section)}><TableGroupRow title={sectionTitle(t, section)} count={items.length} expanded={open} ontoggle={(e: boolean) => (collapsed = e ? collapsed.filter((s) => s !== section) : [...collapsed, section])} /></div></td></tr>
          {#if open}
            {#each items as i (i.instance)}
              {@const spec = specs.get(i.instance)}
              {@const command = commandText(i)}
              {@const isOpen = expanded.includes(i.instance)}
              <tr data-instance={i.instance} data-status={i.status}>
                <td class="c-check"><span class="check"><span class="name">{checkTitle(t, lang, i.checkId)}</span><bdi class="id" dir="ltr">{i.checkId}{i.component !== '.' ? `@${i.component}` : ''}</bdi></span></td>
                <td class="c-ready"><ReadinessBadge readiness={readinessOf(i.readiness)} size="sm" /></td>
                <td class="c-cmd">
                  {#if command}
                    <span class="cmd">
                      <bdi class="cmd-text" dir="ltr">{command}</bdi>
                      <IconButton icon={isOpen ? 'chevron-down' : dir === 'rtl' ? 'chevron-left' : 'chevron-right'} label={t(isOpen ? 'scanplan.collapse' : 'scanplan.expand')} aria-expanded={isOpen} onclick={() => toggle(i.instance)} />
                    </span>
                  {:else}
                    <span class="muted">{t('scanplan.builtIn')}</span>
                  {/if}
                </td>
                <td class="c-res"><span class="small">{t(`scanplan.resource.${i.resourceClass}`)}</span></td>
                <td class="c-dur"><span class="num">{estimate(i.estimateMs)}</span></td>
                <td class="c-cost"><CostTag cost={costOf(i.needs.network, spec?.cost)} /></td>
                <td class="c-fx">
                  <span class="effects">
                    {#if i.needs.network === 'required'}<span class="effect" title={t('scanplan.effect.network')}><Icon name="globe" size={12} label={t('scanplan.effect.network')} /></span>{/if}
                    {#if spec?.sideEffects.writesRepo === 'maybe'}<span class="effect" title={t('scanplan.effect.writes')}><Icon name="file-text" size={12} label={t('scanplan.effect.writes')} /></span>{/if}
                  </span>
                </td>
              </tr>
              {#if isOpen && command}
                <tr class="expanded"><td colspan="7"><CommandBlock {command} runsCode={spec?.sideEffects.runsProjectCode ?? false} writes={spec?.sideEffects.writesRepo === 'maybe'} network={i.needs.network === 'required'} oncopy={copyText} /></td></tr>
              {/if}
            {/each}
          {/if}
        </tbody>
      {/each}
    </table>

    {#if willNotRun.length}
      {@const open = !collapsed.includes('__wont')}
      <table class="plan not-run" data-testid="will-not-run">
        <tbody>
          <tr class="group"><td colspan="4"><div role="grid" aria-label={t('scanplan.willNotRun')}><TableGroupRow title={t('scanplan.willNotRun')} count={willNotRun.length} expanded={open} ontoggle={(e: boolean) => (collapsed = e ? collapsed.filter((s) => s !== '__wont') : [...collapsed, '__wont'])} /></div></td></tr>
          {#if open}
            {#each willNotRun as w (w.instance)}
              {@const checkId = w.instance.split('@')[0] ?? w.instance}
              <tr data-instance={w.instance}>
                <td class="w-check"><span class="check"><span class="name">{checkTitle(t, lang, checkId)}</span><bdi class="id" dir="ltr">{checkId}</bdi></span></td>
                <td class="w-ready"><ReadinessBadge readiness={w.status === 'not_applicable' ? 'not-applicable' : 'not-included'} size="sm" /></td>
                <td class="w-reason"><span class="small">{w.reasons.map((r) => reasonText(t, lang, r)).join(' · ')}</span></td>
                <td class="w-action"></td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    {/if}
  {:else if error}
    <p class="note">{t('app.error.generic', { reason: error })}</p>
  {/if}
</div>

<SetupFlow {projectId} open={setupOpen} onclose={() => (setupOpen = false)} onchanged={() => void load()} />

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
    gap: var(--space-12);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .summary-row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
  }
  .summary-text {
    flex: 1;
    margin: 0;
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .plan {
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
    padding: 6px 0;
    border-block-end: 1px solid var(--border-subtle);
    vertical-align: middle;
    white-space: nowrap;
  }
  tr.group td {
    padding: 0;
    border: 0;
  }
  tr.expanded td {
    padding: var(--space-8) 0;
  }
  .c-ready,
  .w-ready {
    inline-size: 120px;
  }
  .c-cmd {
    inline-size: 280px;
  }
  .c-res {
    inline-size: 72px;
  }
  .c-dur {
    inline-size: 84px;
  }
  .c-cost {
    inline-size: 110px;
  }
  .c-fx {
    inline-size: 56px;
  }
  .w-reason {
    inline-size: 420px;
  }
  .w-action {
    inline-size: 120px;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    max-inline-size: 100%;
    overflow: hidden;
  }
  .name {
    font: var(--type-body);
    color: var(--text-primary);
  }
  .id {
    font: var(--type-mono);
    color: var(--text-secondary);
  }
  .cmd {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .cmd-text {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-mono);
    color: var(--text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  .small {
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .w-reason .small {
    color: var(--text-secondary);
  }
  .muted {
    font: var(--type-body-small);
    color: var(--text-tertiary);
  }
  .num {
    font: var(--type-numeric-live);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
  }
  .effects {
    display: inline-flex;
    gap: var(--space-4);
    color: var(--text-secondary);
  }
  .effect {
    display: inline-flex;
  }
</style>
