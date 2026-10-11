<script lang="ts">
  // Screen 6 · متابعة التشغيل (9.6, 13.3, 13.6; Figma 6.1 160:47633, 6.2 cancelling 160:48666, 6.3 the engine
  // restarting 160:49709, 6.4 the computer slept 160:50751): the run's summary card (its kind and state, its id, when
  // it started, the resource meter, «ألغِ التشغيل»), the count with its marked estimate, the counts by state, the
  // «no verdict yet» note, then the checks by section, each with its own live line. Everything here is what the
  // engine's events and run.get say (C-03): no verdict before the run's own summary (FR-28), a failure shown is final
  // for its check only. The run bar is hidden on this page (D-DES4-08); the frame announces progress (13.6).
  import { untrack } from 'svelte';
  import type { CheckRunView, CheckSpec, PlanItem } from '@ayar/protocol';
  import Banner from '../components/Banner.svelte';
  import Button from '../components/Button.svelte';
  import CheckRow from '../components/CheckRow.svelte';
  import CycleIndicator from '../components/CycleIndicator.svelte';
  import Icon from '../components/Icon.svelte';
  import Inspector from '../components/Inspector.svelte';
  import LtrText from '../components/LtrText.svelte';
  import Progress from '../components/Progress.svelte';
  import ResourceMeter from '../components/ResourceMeter.svelte';
  import ResultBadge from '../components/ResultBadge.svelte';
  import TableGroupRow from '../components/TableGroupRow.svelte';
  import type { LogLine } from '../lib/evidence.ts';
  import type { InspectorCheck, InspectorTab } from '../lib/inspector.ts';
  import type { CheckRowStatus } from '../lib/results.ts';
  import type { BadgeResult } from '../lib/status.ts';
  import { useLocale } from '../lib/locale.ts';
  import { attempt, copyText } from '../app/client.ts';
  import { badgeOf, bySection, checkTexts, checkTitle, clockMs, costOf, countsInOrder, readinessOf, runKind, secondsSince, sectionOfCheck, sectionTitle, time } from '../app/format.ts';
  import { logLines } from '../app/logs.ts';
  import { countChecks } from '../app/runs.svelte.ts';
  import { argvText, commandOf, reasonsOf } from '../app/specs.ts';
  import { useApp } from '../app/state.svelte.ts';

  let { projectId, runId }: { projectId: string; runId: string } = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  /** The executor's threshold: a group using less processor than this is quiet (C-12 point 7). */
  const BUSY_CPU_PERCENT = 2;
  /** The silence note appears after this long without output while the processor is busy (9.6 point 6). */
  const SILENCE_NOTE_MS = 30_000;

  const run = $derived(app.runs.runs[runId]);
  const plan = $derived(app.runs.plans[runId] ?? null);
  // What runs, as the plan listed it: a check that does not apply to the project is in «ما لن يُشغَّل» (13.3), not here.
  const checks = $derived(app.runs.checksOf(runId).filter((c) => c.outcome !== 'not_applicable'));
  const live = $derived(countChecks(checks));
  const items = $derived(new Map<string, PlanItem>((plan?.items ?? []).map((i) => [i.instance, i])));
  const orderOf = $derived(new Map<string, number>((plan?.order ?? []).map((k, i) => [k, i])));

  // The profile's specs give the literal command the inspector shows (as the plan did).
  let specs = $state(new Map<string, CheckSpec>());
  $effect(() => {
    void attempt('profile.get', { projectId }).then((r) => {
      if (r.ok) specs = new Map(r.result.checks.map((c) => [c.instance, c]));
    });
  });

  // ── the summary card ──────────────────────────────────────────────────────────────────────────────────────
  const cycle = $derived(run?.state === 'cancelling' ? 'cancelling' : run?.state === 'queued' ? 'queued' : 'running');
  const elapsedMs = $derived(run?.startedAt ? Math.max(0, app.runs.now - Date.parse(run.startedAt)) : 0);
  const running = $derived(checks.filter((c) => c.state === 'running' || c.state === 'cancelling'));
  const cpuOf = (id: string) => Number.parseFloat(app.runs.progress[id]?.processor ?? '0') || 0;
  const cpu = $derived(running.reduce((s, c) => s + cpuOf(c.checkRunId), 0));
  const memory = $derived(running.reduce((s, c) => s + (app.runs.progress[c.checkRunId]?.memoryKb ?? 0), 0) * 1024);
  let cpuHistory = $state<number[]>([]);
  let memoryHistory = $state<number[]>([]);
  $effect(() => {
    void app.runs.now;
    const c = cpu;
    const m = memory;
    untrack(() => {
      cpuHistory = [...cpuHistory.slice(-19), c];
      memoryHistory = [...memoryHistory.slice(-19), m];
    });
  });

  /** What is left, from the estimates of what has not finished (marked «تقديري»); none when any lacks history. */
  const remainingMs = $derived.by<number | null>(() => {
    if (!plan || cycle === 'cancelling') return null;
    let left = 0;
    for (const c of checks) {
      if (c.state === 'finished') continue;
      const est = items.get(c.instance)?.estimateMs;
      if (est === null || est === undefined) return null;
      left += c.state === 'running' && c.startedAt ? Math.max(0, est - (app.runs.now - Date.parse(c.startedAt))) : est;
    }
    return left;
  });

  // FR-26: the latest time the computer slept during this run (6.4).
  const sleep = $derived.by(() => {
    const g = (app.runs.sleepGaps[runId] ?? []).at(-1);
    if (!g) return null;
    const from = Date.parse(g.at);
    return { minutes: Math.max(1, Math.round(g.ms / 60_000)), from: time(new Date(from), lang), to: time(new Date(from + g.ms), lang) };
  });
  const engineDown = $derived(app.health?.state === 'restarting' || app.health?.state === 'starting');

  // ── the checks, by section in the sidebar's order, each in the plan's order ─────────────────────────────────
  const sections = $derived(
    bySection(
      checks.toSorted((a, b) => (orderOf.get(a.instance) ?? 1e6) - (orderOf.get(b.instance) ?? 1e6)),
      (c) => items.get(c.instance)?.section ?? sectionOfCheck(c.checkId),
    ),
  );
  let collapsed = $state<string[]>([]);
  let selected = $state<string[]>([]);

  function statusOf(c: CheckRunView): CheckRowStatus {
    if (c.state === 'running') return 'running';
    if (c.state === 'cancelling') return 'cancelling';
    if (c.state === 'finished' && c.outcome) return badgeOf(c.outcome, { reviewed: !!c.reviewId, reason: c.outcomeReason });
    return 'queued';
  }

  /** «اجتاز 4 · أخفق 1 · جارٍ 1»: the outcomes in the status order, then running, cancelling, waiting. */
  function summaryOf(list: readonly CheckRunView[]): string {
    const n = countChecks(list);
    const part = (status: string, count: number) => t('monitor.sectionSummary', { status, count });
    const parts = countsInOrder(n.byOutcome).map((x) => part(t(`status.result.${x.result}`), x.count));
    if (n.running) parts.push(part(t('status.cycle.running'), n.running));
    if (n.cancelling) parts.push(part(t('status.cycle.cancelling'), n.cancelling));
    if (n.queued) parts.push(part(t('status.cycle.queued'), n.queued));
    return parts.join(' · ');
  }

  function durationOf(c: CheckRunView): string | undefined {
    if (c.durationMs !== null) return clockMs(c.durationMs);
    if (c.startedAt) return clockMs(app.runs.now - Date.parse(c.startedAt));
    return undefined;
  }

  function stepOf(c: CheckRunView): { step?: string; stepDone?: number; stepTotal?: number } {
    const p = app.runs.progress[c.checkRunId];
    if (!p) return {};
    if (p.total !== null) return { step: t('monitor.step.cells'), stepDone: p.step, stepTotal: p.total };
    return { step: t('monitor.step.lines', { count: p.linesSeen }) };
  }

  // ── the log tail of an expanded running row (check.tail, redacted by the engine) ─────────────────────────────
  let tails = $state<Record<string, LogLine[]>>({});
  /** A running row shows its tail and provisional findings when it has findings, or is the only one running. */
  const expanded = $derived(new Set(running.filter((c) => (app.runs.provisional[c.checkRunId]?.length ?? 0) > 0 || running.length === 1).map((c) => c.checkRunId)));
  $effect(() => {
    void app.runs.now;
    for (const id of expanded) {
      void attempt('check.tail', { checkRunId: id, maxLines: 3 }).then((r) => {
        if (r.ok) tails[id] = logLines(t, lang, r.result.lines, r.result.totalLines);
      });
    }
  });

  async function cancelCheck(c: CheckRunView): Promise<void> {
    await attempt('run.cancel', { target: { kind: 'checkRun', checkRunId: c.checkRunId } });
  }

  // ── the inspector: the check (Details | Log), its log read from the engine while it runs ─────────────────────
  let inspected = $state<string | null>(null);
  let inspectorTab = $state<InspectorTab>('details');
  let inspectorLog = $state<{ lines: LogLine[]; totalLines: number } | null>(null);
  const inspectedCheck = $derived(checks.find((c) => c.checkRunId === inspected) ?? null);

  function open(c: CheckRunView, tab: InspectorTab): void {
    inspected = c.checkRunId;
    inspectorTab = tab;
    inspectorLog = null;
  }
  $effect(() => {
    const c = inspectedCheck;
    void app.runs.now;
    if (!c || inspectorTab !== 'log' || !c.startedAt) return;
    void attempt('check.tail', { checkRunId: c.checkRunId, maxLines: 200 }).then((r) => {
      if (r.ok) inspectorLog = { lines: logLines(t, lang, r.result.lines, r.result.totalLines), totalLines: r.result.totalLines };
    });
  });

  const content = $derived.by<InspectorCheck | null>(() => {
    const c = inspectedCheck;
    if (!c) return null;
    const item = items.get(c.instance);
    const spec = specs.get(c.instance);
    const command = spec ? commandOf(spec) : item?.command ? argvText(item.command.argv) : null;
    return {
      kind: 'check',
      name: checkTitle(t, lang, c.checkId),
      id: c.checkId,
      ...(c.state === 'finished' && c.outcome ? { result: statusOf(c) as BadgeResult, runId: run?.displayId } : {}),
      ...checkTexts(t, lang, c.checkId),
      why: spec ? reasonsOf(t, lang, spec.reasons).text : '',
      ...(command
        ? { command: { command, runsCode: spec?.sideEffects.runsProjectCode ?? false, writes: spec?.sideEffects.writesRepo === 'maybe', network: item?.needs.network === 'required' } }
        : {}),
      readiness: readinessOf(c.readiness),
      ...(inspectorLog ? { log: inspectorLog } : {}),
    };
  });
  $effect(() => {
    const has = !!content;
    app.inspector = has ? inspectorSnippet : null;
    if (has) app.inspectorOpen = true;
    return () => (app.inspector = null);
  });
</script>

{#snippet inspectorSnippet()}
  {#if content}
    <Inspector id="ayar-inspector" {content} tab={inspectorTab} ontabchange={(tab: InspectorTab) => (inspectorTab = tab)} oncopyid={copyText} oncopycommand={copyText} />
  {/if}
{/snippet}

{#if run}
  <div class="page">
    {#if engineDown}<Banner kind="engine-restarting" />{/if}

    <div class="body">
      <section class="card summary" aria-label={runKind(t, run, plan)} data-testid="monitor-summary" data-state={cycle}>
        <div class="head">
          <CycleIndicator {cycle} label={`${runKind(t, run, plan)} · ${t(`status.cycle.${cycle}`)}`} />
          <span class="run-id"><LtrText text={run.displayId} mono /></span>
          {#if run.startedAt}<span class="small secondary">{t('monitor.started', { time: time(run.startedAt, lang), elapsed: clockMs(elapsedMs) })}</span>{/if}
          <span class="spacer"></span>
          {#if cycle !== 'queued'}<ResourceMeter cpuPercent={cpu} memoryBytes={memory} {cpuHistory} {memoryHistory} />{/if}
          <Button kind="secondary" disabled={cycle === 'cancelling'} onclick={() => (app.confirmCancel = true)}>{t('ui.action.cancelRun')}</Button>
        </div>

        <Progress kind="count" done={live.finished} total={live.total} estimate={remainingMs ? t('monitor.remaining', { duration: clockMs(remainingMs) }) : undefined} />

        <div class="counts" data-testid="monitor-counts">
          {#if live.cancelling}<CycleIndicator cycle="cancelling" size="sm" count={live.cancelling} />{/if}
          {#if live.running}<CycleIndicator cycle="running" size="sm" count={live.running} />{/if}
          {#if live.queued}<CycleIndicator cycle="queued" size="sm" count={live.queued} />{/if}
          {#each countsInOrder(live.byOutcome) as x (x.result)}<ResultBadge result={x.result} size="sm" count={x.count} />{/each}
        </div>

        {#if sleep}
          <p class="note sleep"><Icon name="info" size={16} /><span>{t('monitor.sleep', sleep)}</span></p>
        {/if}
        <p class="note">
          {#if cycle === 'cancelling'}{t('monitor.note.cancelling')}{:else if cycle === 'queued'}{t('monitor.note.queued', { position: run.queuePosition ?? 1 })}{:else}{t('monitor.note.running')}{/if}
        </p>
      </section>

      {#each sections as [section, list] (section)}
        {@const isOpen = !collapsed.includes(section)}
        <div class="group" role="grid" aria-label={sectionTitle(t, section)}>
          <TableGroupRow title={sectionTitle(t, section)} count={list.length} expanded={isOpen} controls="mon-{section}" ontoggle={(e: boolean) => (collapsed = e ? collapsed.filter((s) => s !== section) : [...collapsed, section])} />
        </div>
        {#if isOpen}
          <div class="checks" id="mon-{section}">
            <p class="section-summary">{summaryOf(list)}</p>
            {#each list as c (c.checkRunId)}
              {@const p = app.runs.progress[c.checkRunId]}
              {@const findings = app.runs.provisional[c.checkRunId] ?? []}
              {@const busy = cpuOf(c.checkRunId) >= BUSY_CPU_PERCENT}
              <CheckRow
                status={statusOf(c)}
                name={checkTitle(t, lang, c.checkId)}
                id={c.checkId}
                cost={costOf(items.get(c.instance)?.needs.network)}
                {...stepOf(c)}
                lastActivitySeconds={c.state === 'running' ? secondsSince(p?.lastActivityAt ?? c.lastActivityAt ?? c.startedAt, app.runs.now) : undefined}
                processorActive={busy}
                silentFor={busy && p && p.silentMs >= SILENCE_NOTE_MS ? clockMs(p.silentMs) : undefined}
                provisionalCount={findings.length}
                duration={durationOf(c)}
                ran={c.startedAt !== null}
                selected={selected.includes(c.checkRunId)}
                expanded={expanded.has(c.checkRunId)}
                logTail={tails[c.checkRunId] ?? []}
                provisionalFindings={findings.map((f) => f.title)}
                onselectchange={(on: boolean) => (selected = on ? [...selected, c.checkRunId] : selected.filter((x) => x !== c.checkRunId))}
                onopen={() => open(c, 'details')}
                oncancel={() => void cancelCheck(c)}
                onlog={() => open(c, 'log')}
              />
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }
  .body {
    display: flex;
    flex-direction: column;
    padding: var(--space-24) var(--space-32);
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
  .summary {
    margin-block-end: var(--space-24);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    flex-wrap: wrap;
  }
  .run-id {
    font: var(--type-mono);
    color: var(--text-secondary);
  }
  .small {
    font: var(--type-body-small);
  }
  .secondary {
    color: var(--text-secondary);
  }
  .spacer {
    flex: 1;
    min-width: 0;
  }
  .counts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .note.sleep {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    color: var(--text-primary);
  }
  .group + .checks {
    margin-block-end: var(--space-16);
  }
  .checks {
    display: flex;
    flex-direction: column;
  }
  .section-summary {
    margin: 0;
    padding: var(--space-4) var(--space-8) var(--space-8);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
