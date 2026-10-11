<script lang="ts">
  // Screen 4 · نظرة عامة (13.3; Figma 4.1 blocked 160:17209 … 4.7 scoring details 160:24050, dark 160:56044): the
  // header (name, path, tags, branch and commit for display only, last read, «أعد القراءة»), the purity card of the
  // last full round in its variant (blocked with its blocking failures first, incomplete with what is missing,
  // pure, held by integrity, stale after a later re-check, no measurable scope) or «لم يُشغَّل فحص كامل بعد»,
  // «ما يحتاج انتباهك» in its order, the seven section cards (partial karat, counts, readiness gaps; integrity's
  // «يمنع حكم ‹نقي›»), the model-checks card, and the last five runs with the quick actions.
  import type { AiChecksView, AiNeeds, CheckRunView, DiscoverySnapshot, ProfileView, PurityResult, ReadinessReport, RunDetail, RunView, TaskRecord, ToolView } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import PathPill from '../components/PathPill.svelte';
  import PurityCard from '../components/PurityCard.svelte';
  import ResultBadge from '../components/ResultBadge.svelte';
  import SectionCard from '../components/SectionCard.svelte';
  import SheetScoringDetails from '../components/SheetScoringDetails.svelte';
  import StatusSymbol from '../components/StatusSymbol.svelte';
  import TableHeaderCell from '../components/TableHeaderCell.svelte';
  import Tag from '../components/Tag.svelte';
  import VerdictBadge from '../components/VerdictBadge.svelte';
  import { useLocale } from '../lib/locale.ts';
  import type { SectionCounts } from '../lib/results.ts';
  import { NAV_SECTIONS } from '../lib/shell.ts';
  import { attempt, copyText } from '../app/client.ts';
  import { ago, checkTitle, clockMs, countsInOrder, dayTime, displayPath, homeOf, reasonText, resultOf, sectionTitle } from '../app/format.ts';
  import { projectTags } from '../app/projects.ts';
  import { blockingOf, integrityHold, missingForPure, scoringOf, sectionKarat } from '../app/purity.ts';
  import { useApp } from '../app/state.svelte.ts';
  import SetupFlow from './parts/SetupFlow.svelte';

  let { projectId }: { projectId: string } = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  let snapshot = $state<DiscoverySnapshot | null>(null);
  let runs = $state<RunView[]>([]);
  let round = $state<RunDetail | null>(null);
  let stale = $state(false);
  let profile = $state<ProfileView | null>(null);
  let readiness = $state<ReadinessReport | null>(null);
  let needs = $state<AiNeeds | null>(null);
  let ai = $state<AiChecksView | null>(null);
  let tasks = $state<TaskRecord[]>([]);
  let staleTools = $state<ToolView[]>([]);
  let scoring = $state(false);
  let setupOpen = $state(false);

  const project = $derived(app.project(projectId));

  async function load(): Promise<void> {
    const [got, list, prof, ready, aiNeeds, aiList, taskList, tools] = await Promise.all([
      attempt('project.get', { projectId }),
      attempt('runs.list', { projectId }),
      attempt('profile.get', { projectId }),
      attempt('readiness.evaluate', { projectId, probe: false }),
      attempt('aiChecks.needs', { projectId }),
      attempt('aiChecks.list', { projectId }),
      attempt('tasks.list', { projectId }),
      attempt('tools.list', {}),
    ]);
    if (got.ok) snapshot = got.result.snapshot;
    if (prof.ok) profile = prof.result;
    if (ready.ok) readiness = ready.result;
    if (aiNeeds.ok) needs = aiNeeds.result;
    if (aiList.ok) ai = aiList.result;
    if (taskList.ok) tasks = taskList.result.tasks;
    if (tools.ok) staleTools = tools.result.tools.filter((x) => x.stale);
    if (!list.ok) return;
    runs = list.result.runs;
    const full = runs.find((r) => r.kind === 'full' && r.state === 'finished' && r.purity);
    round = full ? await app.runs.load(full.runId) : null;
    // 13.5 «إعادة فحص بعد تغير الشيفرة»: a later finished run read another state of the code than the round did.
    stale = false;
    if (full && round?.purity) {
      for (const r of runs.filter((x) => x.state === 'finished' && x.finishedAt && full.finishedAt && x.finishedAt > full.finishedAt).slice(0, 5)) {
        const d = await attempt('run.get', { runId: r.runId });
        const snap = d.ok ? d.result.purity?.meta.snapshotId : null;
        if (snap && snap !== round.purity.meta.snapshotId) stale = true;
      }
    }
  }
  $effect(() => {
    void load();
  });

  // The title bar's primary action: «ابدأ الفحص الكامل» (it shows the plan first, 13.7).
  $effect(() => {
    app.primary = { label: t('ui.action.startFullScan'), onclick: () => app.navigate({ name: 'scan', projectId, runId: null }) };
    return () => (app.primary = null);
  });

  const purity = $derived<PurityResult | null>(round?.purity ?? null);
  const fullRun = $derived(round?.run ?? null);
  const tags = $derived(snapshot ? projectTags(t, snapshot.facts.filter((f) => f.component === '.')) : []);
  const git = $derived.by(() => {
    const v = snapshot?.facts.find((f) => f.key === 'git.repository')?.value as { branch?: string | null; commit?: string | null } | undefined;
    return { branch: v?.branch ?? null, commit: v?.commit ? v.commit.slice(0, 7) : null };
  });
  const metaLine = $derived(
    [git.branch ? t('overview.meta.branch', { branch: git.branch }) : null, git.commit ? t('overview.meta.commit', { commit: git.commit }) : null, snapshot ? t('overview.meta.lastRead', { ago: ago(snapshot.createdAt, lang) }) : null]
      .filter(Boolean)
      .join(' · '),
  );

  /** The section of each check instance, from the profile (the catalog names it). */
  const sectionOf = $derived(new Map((profile?.checks ?? []).map((c) => [c.instance, c.section])));
  const roundChecks = $derived<CheckRunView[]>(round?.checks ?? []);

  function countsFor(section: string): SectionCounts {
    const out: SectionCounts = {};
    for (const c of roundChecks) {
      if (c.state !== 'finished' || !c.outcome || sectionOf.get(c.instance) !== section) continue;
      const r = resultOf(c.outcome);
      out[r] = (out[r] ?? 0) + 1;
    }
    return out;
  }
  function gapsFor(section: string) {
    const items = (readiness?.items ?? []).filter((i) => sectionOf.get(i.instance) === section);
    return { setup: items.filter((i) => i.readiness === 'needs_setup').length, approval: items.filter((i) => i.readiness === 'needs_approval' || i.readiness === 'untrusted').length };
  }

  const integrityItems = $derived(
    roundChecks
      .filter((c) => c.checkId.startsWith('integ.') && c.outcomeReason)
      .map((c) => t('overview.integrity.item', { check: checkTitle(t, lang, c.checkId), reason: reasonText(t, lang, c.outcomeReason) }))
      .join(' '),
  );

  // ── 13.3 «ما يحتاج انتباهك»: blocking failures, pending approvals, missing setup, pending reviews, stale catalog, open tasks
  type Attention = { icon: 'failed' | 'file-check' | 'hammer' | 'user-search' | 'history' | 'list-todo'; text: string; action: string; onclick?: () => void };
  const attention = $derived.by<Attention[]>(() => {
    const list: Attention[] = [];
    if (purity && fullRun) {
      for (const b of purity.blockingFailures)
        list.push({ icon: 'failed', text: t('overview.attention.blocking', { check: checkTitle(t, lang, b.checkId) }), action: t('overview.attention.openResult'), onclick: () => app.navigate({ name: 'scan', projectId, runId: fullRun.runId }) });
    }
    const pending = profile?.pending.items ?? [];
    if (pending.length) {
      const names = pending.slice(0, 3).map((i) => checkTitle(t, lang, i.instance.split('@')[0]!));
      list.push({
        icon: 'file-check',
        text: pending.length <= 3 ? t('overview.attention.approval', { names: names.join('، ') }) : t('overview.attention.approvalCount', { count: pending.length }),
        action: t('overview.attention.review'),
        onclick: () => app.navigate({ name: 'profile', projectId }),
      });
    }
    const setup = (readiness?.items ?? []).filter((i) => i.readiness === 'needs_setup');
    if (setup.length) {
      const names = setup.slice(0, 3).map((i) => checkTitle(t, lang, i.instance.split('@')[0]!));
      list.push({ icon: 'hammer', text: t('overview.attention.setup', { count: setup.length, names: names.join('، ') }), action: t('ui.action.setUp'), onclick: () => (setupOpen = true) });
    }
    const reviews = purity?.counts.byOutcome.needs_review ?? 0;
    if (reviews) list.push({ icon: 'user-search', text: t('overview.attention.reviews', { count: reviews }), action: t('overview.attention.openResult'), onclick: () => fullRun && app.navigate({ name: 'scan', projectId, runId: fullRun.runId }) });
    if (staleTools.length) list.push({ icon: 'history', text: t('overview.attention.catalog', { names: staleTools.slice(0, 3).map((x) => x.key).join('، ') }), action: t('overview.attention.show') });
    const open = tasks.filter((x) => x.status === 'open');
    if (open.length) list.push({ icon: 'list-todo', text: t('overview.attention.tasks', { count: open.length, id: open[0]!.displayId }), action: t('overview.attention.openTasks') });
    return list;
  });

  const lastRuns = $derived(runs.slice(0, 5));
  const hasFailed = $derived(!!fullRun && (fullRun.counts.byOutcome.failed ?? 0) > 0);

  function runKind(run: RunView): string {
    if (run.kind === 'section') {
      const plan = app.runs.plans[run.runId];
      return t('app.runKind.section', { section: sectionTitle(t, plan?.selection.kind === 'section' ? plan.selection.section : '') });
    }
    const keys = { full: 'app.runKind.full', check: 'app.runKind.check', group: 'app.runKind.group', rerun_failed: 'app.runKind.rerunFailed', rerun_incomplete: 'app.runKind.rerunIncomplete', advisor: 'app.runKind.advisor', continue_round: 'app.runKind.continueRound' } as const;
    return t(keys[run.kind]);
  }

  const modelMetrics = $derived({
    needs: needs?.needs.filter((n) => n.applies).length ?? 0,
    generated: ai?.instructions.length ?? 0,
    reports: ai?.instructions.filter((i) => ['result_received', 'matched_partially', 'matched'].includes(i.status)).length ?? 0,
    unresolved: ai?.claims.filter((c) => c.status === 'open').length ?? 0,
  });
  const scoringData = $derived(purity ? scoringOf(t, lang, purity, '0.1.0') : null);
  const narrow = $derived(!!purity?.narrow);
</script>

{#if project}
  <div class="page">
    <header class="header">
      <div class="title-block">
        <h1 class="title">{project.displayName}</h1>
        <div class="meta">
          <PathPill path={displayPath(project.rootPath, homeOf(project.rootPath))} oncopy={copyText} />
          {#each tags as tag (tag)}<Tag>{tag}</Tag>{/each}
          {#if metaLine}<span class="meta-line">{metaLine}</span>{/if}
        </div>
      </div>
      <Button kind="secondary" onclick={async () => {
        const r = await attempt('project.rescan', { projectId });
        if (r.ok) app.navigate({ name: 'discovery', projectId, discoveryId: r.result.discoveryId, pending: null });
      }}>{t('ui.action.rescan')}</Button>
    </header>

    <div class="top">
      {#if purity && fullRun && purity.verdict}
        <PurityCard
          verdict={purity.verdict}
          karat={purity.karat}
          criteria={purity.criteriaCount}
          checks={purity.checksCount}
          counts={countsInOrder(purity.counts.byOutcome)}
          roundId={fullRun.purity?.roundDisplayId ?? fullRun.displayId}
          roundDate={fullRun.finishedAt ? dayTime(fullRun.finishedAt, lang) : ''}
          missing={purity.verdict === 'incomplete' && integrityHold(purity) === 0 ? missingForPure(purity) : []}
          blocking={purity.verdict === 'blocked' ? blockingOf(t, lang, purity) : []}
          integrityHold={purity.verdict === 'incomplete' && purity.karat === 24 ? integrityHold(purity) : 0}
          {stale}
          narrowScope={narrow}
          ondetails={() => (scoring = true)}
          onfullscan={() => app.navigate({ name: 'scan', projectId, runId: null })}
        />
      {:else}
        <section class="card no-scan" aria-labelledby="purity-title">
          <h2 class="card-title" id="purity-title">{t('glossary.purityIndex')}</h2>
          <div class="no-scan-body">
            <EmptyState kind="no-runs" title={t('overview.noScan.title')} body={t('overview.noScan.body')} onaction={() => app.navigate({ name: 'scan', projectId, runId: null })} />
          </div>
        </section>
      {/if}
      <section class="card attention" aria-labelledby="att-title">
        <h2 class="card-title" id="att-title">{t('overview.attention.title')}</h2>
        {#each attention as item, i (i)}
          <div class="attention-item">
            <span class="att-icon">{#if item.icon === 'failed'}<StatusSymbol symbol="failed" size={16} />{:else}<Icon name={item.icon} size={16} />{/if}</span>
            <span class="att-text">{item.text}</span>
            <Button kind="quiet" disabled={!item.onclick} onclick={() => item.onclick?.()}>{item.action}</Button>
          </div>
        {:else}
          <p class="none">{t('overview.attention.none')}</p>
        {/each}
      </section>
    </div>

    <div class="cards">
      {#each NAV_SECTIONS.filter((s) => s !== 'integrity') as section (section)}
        {@const k = sectionKarat(purity, section)}
        {@const counts = countsFor(section)}
        <SectionCard
          name={sectionTitle(t, section)}
          karat={k.karat}
          criteria={k.criteria}
          {counts}
          readiness={gapsFor(section)}
          note={!fullRun ? t('overview.section.notRun') : k.criteria === 0 ? t('overview.section.noCriteria') : undefined}
          disabled
        />
      {/each}
      <SectionCard
        variant="integrity"
        name={sectionTitle(t, 'integrity')}
        blocksPure={purity ? integrityHold(purity) : 0}
        openItems={fullRun ? integrityItems : t('overview.integrity.noRound')}
        readiness={gapsFor('integrity')}
        disabled
      />
      <SectionCard variant="model-checks" name={t('ui.nav.modelChecks')} metrics={modelMetrics} disabled />
    </div>

    <section class="runs" aria-labelledby="runs-title">
      <div class="runs-head">
        <h2 class="card-title" id="runs-title">{t('overview.runs.title')}</h2>
        <span class="spacer"></span>
        <div class="quick">
          <Button kind="secondary" onclick={() => app.navigate({ name: 'scan', projectId, runId: null })}>{t('ui.action.startFullScan')}</Button>
          <Button kind="secondary" disabled={!hasFailed} onclick={() => fullRun && app.navigate({ name: 'scan', projectId, runId: fullRun.runId })}>{t('ui.action.rerunFailed')}</Button>
          <Button kind="secondary" disabled>{t('ui.action.suggestChecks')}</Button>
        </div>
      </div>
      {#if lastRuns.length}
        <table class="runs-table">
          <thead>
            <tr>
              <th class="c-id" scope="col"><TableHeaderCell native label={t('overview.runs.run')} sortable={false} /></th>
              <th class="c-kind" scope="col"><TableHeaderCell native label={t('overview.runs.kind')} sortable={false} /></th>
              <th class="c-verdict" scope="col"><TableHeaderCell native label={t('overview.runs.verdict')} sortable={false} /></th>
              <th class="c-counts" scope="col"><TableHeaderCell native label={t('overview.runs.counts')} sortable={false} /></th>
              <th class="c-dur" scope="col"><TableHeaderCell native label={t('overview.runs.duration')} sortable={false} /></th>
              <th class="c-date" scope="col"><TableHeaderCell native label={t('overview.runs.date')} sortable={false} /></th>
            </tr>
          </thead>
          <tbody>
            {#each lastRuns as run (run.runId)}
              <tr tabindex="0" data-run={run.runId} onclick={() => app.navigate({ name: 'scan', projectId, runId: run.runId })} onkeydown={(e) => e.key === 'Enter' && app.navigate({ name: 'scan', projectId, runId: run.runId })}>
                <td class="c-id"><bdi class="mono" dir="ltr">{run.displayId}</bdi></td>
                <td class="c-kind">{runKind(run)}</td>
                <td class="c-verdict">
                  {#if run.state !== 'finished'}
                    <span class="muted">{t('overview.runs.running')}</span>
                  {:else if run.kind === 'full' && run.verdict}
                    <span class="verdict"><VerdictBadge verdict={run.verdict} />{#if run.purity?.karat !== null && run.purity?.karat !== undefined}<span class="karat">{t('overview.runs.karat', { karat: run.purity.karat })}</span>{/if}</span>
                  {:else if run.kind === 'full' && run.cancelReason}
                    <span class="verdict"><ResultBadge result="cancelled" size="sm" /><span class="karat">{t('overview.runs.noKarat')}</span></span>
                  {:else}
                    <span class="muted">{t('overview.runs.notFull')}</span>
                  {/if}
                </td>
                <td class="c-counts">
                  <span class="counts">
                    {#each countsInOrder(run.counts.byOutcome).filter((c) => c.result !== 'not-applicable') as c (c.result)}
                      <span class="count"><StatusSymbol symbol={c.result} size={12} alone /><span class="num">{c.count}</span></span>
                    {/each}
                  </span>
                </td>
                <td class="c-dur"><span class="num">{run.startedAt && run.finishedAt ? clockMs(Date.parse(run.finishedAt) - Date.parse(run.startedAt)) : ''}</span></td>
                <td class="c-date"><span class="date">{run.startedAt ? dayTime(run.startedAt, lang) : ''}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="none">{t('overview.runs.none')}</p>
      {/if}
    </section>
  </div>

  {#if scoringData}
    <SheetScoringDetails open={scoring} criteria={scoringData.criteria} summary={scoringData.summary} oncancel={() => (scoring = false)} />
  {/if}
  <SetupFlow {projectId} open={setupOpen} onclose={() => (setupOpen = false)} onchanged={() => void load()} />
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
    align-items: flex-start;
    gap: var(--space-16);
  }
  .title-block {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-8);
    min-inline-size: 0;
  }
  .title {
    margin: 0;
    font: var(--type-title-page);
    color: var(--text-primary);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px var(--space-8);
  }
  .meta-line {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .top {
    display: flex;
    align-items: stretch;
    gap: var(--space-16);
  }
  .card {
    display: flex;
    flex-direction: column;
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
  .attention {
    flex: 1;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .no-scan {
    flex: none;
    gap: var(--space-16);
    inline-size: 400px;
    padding: var(--space-24);
  }
  .no-scan-body {
    display: flex;
    justify-content: center;
  }
  .attention-item {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding-block: var(--space-8);
    border-block-end: 1px solid var(--border-subtle);
  }
  .att-icon {
    display: flex;
    flex: none;
    color: var(--text-primary);
  }
  .att-text {
    flex: 1;
    min-inline-size: 0;
    font: var(--type-body);
    color: var(--text-primary);
  }
  .none {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-12);
    align-items: start;
  }
  .cards :global(.section-card) {
    inline-size: auto;
    block-size: 100%;
  }
  .runs {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .runs-head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .spacer {
    flex: 1;
  }
  .quick {
    display: flex;
    gap: var(--space-8);
  }
  .runs-table {
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
    padding: var(--space-8) 0;
    border-block-end: 1px solid var(--border-subtle);
    font: var(--type-body);
    color: var(--text-primary);
    white-space: nowrap;
  }
  tbody tr {
    cursor: default;
  }
  tbody tr:hover {
    background: var(--bg-sunken);
  }
  .c-id {
    inline-size: 180px;
  }
  .c-kind {
    inline-size: 200px;
  }
  .c-verdict {
    inline-size: 180px;
  }
  .c-counts {
    inline-size: 200px;
  }
  .c-dur {
    inline-size: 80px;
  }
  .mono {
    font: var(--type-mono);
  }
  .muted {
    font: var(--type-body-small);
    color: var(--text-tertiary);
  }
  .verdict {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
  }
  .karat,
  .num {
    font: var(--type-numeric-live);
    font-variant-numeric: tabular-nums;
  }
  .counts {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .count {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
  }
  .date {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
