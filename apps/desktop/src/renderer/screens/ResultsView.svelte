<script lang="ts">
  // Screen 7 · نتائج التشغيل (13.3, 12.2–12.7, D-40; Figma 7.1–7.11, and screen 8 «للنموذج» 160:52480/160:53028):
  // the run's head (its id, kind, date and duration, commit, profile and environment; «أعد الفاشل» «أعد غير
  // المكتمل» «صدّر التقرير…» «قارن بتشغيل…») beside the purity card — or, for a partial or cancelled run, the
  // results summary (no karat for a run that is not a full round, 11.5) —, the one copy bar, and one of six views
  // (D-DES4-07): «لك» and «للنموذج» in the bar's segmented control, «الاكتشافات» «الفحوص» «الأدلة» «الآثار الجانبية»
  // in the tabs. «لك» reads `report/1` with the report's own message keys; «للنموذج» shows exactly what is copied.
  // Copying is the engine's model text through the main process (FR-44, AT-23): nothing reaches the clipboard
  // before the user presses «انسخ للنموذج».
  import type { Lang } from '@ayar/i18n';
  import type { CheckRunDetail, CommandPayload, Finding, PlanItem, ReportBuilt, ResultsPage, ReviewTarget, RunDetail, RunView } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import CopyForModelBar from '../components/CopyForModelBar.svelte';
  import Icon from '../components/Icon.svelte';
  import Inspector from '../components/Inspector.svelte';
  import LtrText from '../components/LtrText.svelte';
  import PurityCard from '../components/PurityCard.svelte';
  import ResultBadge from '../components/ResultBadge.svelte';
  import SheetExportReport from '../components/SheetExportReport.svelte';
  import SheetHumanReview from '../components/SheetHumanReview.svelte';
  import SheetReRun from '../components/SheetReRun.svelte';
  import SheetScoringDetails from '../components/SheetScoringDetails.svelte';
  import Tabs from '../components/Tabs.svelte';
  import type { InspectorCheck, InspectorFinding, InspectorTab } from '../lib/inspector.ts';
  import type { CopyScope, ReportView } from '../lib/results.ts';
  import { rerunDefaults, type ExportChoice, type RerunStatus, type RerunVariant, type ReviewRecord } from '../lib/sheets.ts';
  import { useLocale } from '../lib/locale.ts';
  import { attempt, copyText, on } from '../app/client.ts';
  import { argvText, commandOf, reasonsOf } from '../app/specs.ts';
  import { badgeOf, checkTexts, checkTitle, clockMs, countsInOrder, day, dayTime, readinessOf, reasonText, runKind, textOr, time } from '../app/format.ts';
  import { logLines, logSegments, redactionKinds } from '../app/logs.ts';
  import { blockingOf, integrityHold, missingForPure, scoringOf } from '../app/purity.ts';
  import { directAction, evidenceRows, findingTitle, outcomesOf, rerunCounts, sideEffectRows, type FindingGrouping, type NextItem } from '../app/results.ts';
  import { useApp } from '../app/state.svelte.ts';
  import ChecksTab from './results/ChecksTab.svelte';
  import EvidenceTab from './results/EvidenceTab.svelte';
  import FindingsTab from './results/FindingsTab.svelte';
  import ForModel from './results/ForModel.svelte';
  import ForYou from './results/ForYou.svelte';
  import ModelReportText from './results/ModelReportText.svelte';
  import SideEffectsTab from './results/SideEffectsTab.svelte';

  let { projectId, runId }: { projectId: string; runId: string } = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  type View = ReportView | 'findings' | 'checks' | 'evidence' | 'sideEffects';
  const TAB_VIEWS = ['findings', 'checks', 'evidence', 'sideEffects'] as const;

  let detail = $state<RunDetail | null>(null);
  let page = $state<ResultsPage | null>(null);
  let runs = $state<RunView[]>([]);
  let round = $state<RunDetail | null>(null);
  let profileChecks = $state<Awaited<ReturnType<typeof loadProfile>>>([]);
  let runReport = $state<ReportBuilt | null>(null);
  let copyReport = $state<ReportBuilt | null>(null);
  let reportError = $state<string | null>(null);

  let view = $state<View>('for-you');
  let scope = $state<CopyScope>('all-findings');
  let selected = $state<string[]>([]);
  let createCard = $state(false);
  let reportLang = $state<Lang>(lang);
  let longEvidence = $state(false);
  let grouping = $state<FindingGrouping>('section');
  let evidenceCheck = $state<string | null>(null);

  async function loadProfile() {
    const r = await attempt('profile.get', { projectId });
    return r.ok ? r.result.checks : [];
  }

  async function load(): Promise<void> {
    const [d, q, list, prof] = await Promise.all([
      app.runs.load(runId),
      attempt('results.query', { projectId, filters: { runId, includeExcluded: true, limit: 1000 } }),
      attempt('runs.list', { projectId }),
      loadProfile(),
    ]);
    detail = d;
    page = q.ok ? q.result : null;
    runs = list.ok ? list.result.runs : [];
    profileChecks = prof;
    // A partial or cancelled run computes no karat: the latest full round speaks for the project (11.5, 13.3).
    if (d && !d.purity) {
      const full = runs.find((r) => r.kind === 'full' && r.state === 'finished' && r.purity && r.runId !== runId);
      const got = full ? await attempt('run.get', { runId: full.runId }) : null;
      round = got?.ok ? got.result : null;
    }
  }
  $effect(() => {
    void load();
  });

  // A run's results change when a review is recorded or a later run re-reads the round: read them again.
  $effect(() => on('run.summary', (m) => m.payload.runId === runId && void load()));

  type ReportTarget = CommandPayload<'report.build'>['target'];
  const target = (findingIds: readonly string[]): ReportTarget => (findingIds.length ? { kind: 'findings', findingIds: [...findingIds] } : { kind: 'run', runId });

  // «لك» and the head read the whole run's report in the UI's language.
  $effect(() => {
    const l = lang;
    void attempt('report.build', { target: { kind: 'run', runId }, options: { lang: l, scope: 'wholeRun' } }).then((r) => {
      if (r.ok) runReport = r.result;
      else reportError = r.error.code;
    });
  });
  // The copy's report: its scope, language and appendix (12.6); its counters and the «للنموذج» preview.
  const copyIds = $derived(scope === 'selected' ? selected : []);
  $effect(() => {
    const ids = [...copyIds];
    const options = { lang: reportLang, scope: scope === 'whole-run' ? ('wholeRun' as const) : ('allFindings' as const), longEvidence };
    if (scope === 'selected' && !ids.length) {
      copyReport = null;
      return;
    }
    void attempt('report.build', { target: target(ids), options }).then((r) => {
      if (r.ok) copyReport = r.result;
      else reportError = r.error.code;
    });
  });

  async function copy(): Promise<void> {
    if (!copyReport || copyReport.blocked) return;
    let id = copyReport.reportId;
    if (createCard) {
      const r = await attempt('report.build', { target: target(copyIds), options: { lang: reportLang, scope: scope === 'whole-run' ? 'wholeRun' : 'allFindings', longEvidence, createVerificationCards: true } });
      if (!r.ok || r.result.blocked) return;
      id = r.result.reportId;
    }
    const c = await attempt('clipboard.copy', { kind: 'report', id });
    if (c.ok) app.showToast({ kind: 'report', count: c.result.chars });
  }
  // ⇧⌘C (13.7): the same one copy.
  $effect(() => {
    const handler = () => void copy();
    window.addEventListener('ayar:copy-for-model', handler);
    return () => window.removeEventListener('ayar:copy-for-model', handler);
  });

  // ── the head ──────────────────────────────────────────────────────────────────────────────────────────────
  const run = $derived(detail?.run ?? app.runs.runs[runId] ?? null);
  const plan = $derived(detail?.plan ?? null);
  const checks = $derived<CheckRunDetail[]>(detail?.checks ?? []);
  const items = $derived(new Map<string, PlanItem>((plan?.items ?? []).map((i) => [i.instance, i])));
  const order = $derived(new Map<string, number>((plan?.order ?? []).map((k, i) => [k, i])));
  const findings = $derived<Finding[]>(page?.findings ?? []);
  const purity = $derived(detail?.purity ?? null);
  const head = $derived(runReport?.report.head ?? null);
  const cancelled = $derived(run?.cancelReason !== null && run?.cancelReason !== undefined);
  const counts = $derived(run ? countsInOrder(run.counts.byOutcome) : []);

  /** 13.5: a later partial run read another state of the code than the round did — the round's card is «قديم». */
  const stale = $derived(!!round?.purity && !!head?.state.snapshotId && round.purity.meta.snapshotId !== head.state.snapshotId);
  const cardPurity = $derived(purity ?? (stale ? (round?.purity ?? null) : null));
  const cardRun = $derived(purity ? run : stale ? (round?.run ?? null) : null);

  const metaLine = $derived.by(() => {
    if (!run) return '';
    const date = run.startedAt ? t('resultsui.meta.date', { day: day(run.startedAt, lang), time: time(run.startedAt, lang) }) : '';
    const duration = clockMs(run.startedAt && run.finishedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : 0);
    return t(cancelled ? 'resultsui.meta.cancelled' : 'resultsui.meta.line', { kind: runKind(t, run, plan), date, duration });
  });
  const stateLine = $derived.by(() => {
    if (!head) return '';
    const parts: string[] = [];
    if (head.state.commit) parts.push(t(stale ? 'resultsui.meta.commitChanged' : 'resultsui.meta.commit', { commit: head.state.commit.slice(0, 7) }));
    if (head.versions.profile !== null) parts.push(t('resultsui.meta.profile', { version: head.versions.profile }));
    if (head.environment.source) parts.push(t('resultsui.meta.env', { source: textOr(t, lang, `environment.source.${head.environment.source}`, head.environment.source) }));
    return parts.join(' · ');
  });
  const roundRef = $derived(round?.run.purity?.roundDisplayId ?? round?.run.displayId ?? null);

  // The title bar's primary action stays «ابدأ الفحص الكامل» (13.7: the plan first).
  $effect(() => {
    app.primary = { label: t('ui.action.startFullScan'), onclick: () => app.navigate({ name: 'scan', projectId, runId: null }) };
    return () => (app.primary = null);
  });

  // ── the scoring details ───────────────────────────────────────────────────────────────────────────────────
  let scoring = $state(false);
  const scoringData = $derived(cardPurity ? scoringOf(t, lang, cardPurity, head?.versions.ayar ?? '') : null);

  // ── re-runs (9.5 point 3): the sheet's counts, the checks the re-run adds first, then a new run ───────────────
  let rerun = $state<RerunVariant | null>(null);
  let rerunDeps = $state<string[]>([]);
  const rerunCountsOf = $derived(rerunCounts(checks));
  async function openRerun(variant: RerunVariant): Promise<void> {
    rerun = variant;
    rerunDeps = [];
    const statuses = rerunDefaults(variant, rerunCountsOf);
    if (!statuses.length) return;
    const p = await attempt('run.rerun', { runId, filter: { mode: variant, outcomes: outcomesOf(statuses) } });
    if (p.ok) rerunDeps = p.result.items.filter((i) => i.origin === 'dependency').map((i) => checkTitle(t, lang, i.checkId));
  }
  async function startRerun(statuses: RerunStatus[]): Promise<void> {
    const variant = rerun;
    rerun = null;
    if (!variant || !statuses.length) return;
    const p = await attempt('run.rerun', { runId, filter: { mode: variant, outcomes: outcomesOf(statuses) } });
    if (p.ok) await startPlan(p.result.id);
  }
  async function startPlan(planId: string): Promise<void> {
    const s = await attempt('run.start', { planId });
    if (!s.ok) return;
    await app.runs.load(s.result.runId);
    app.navigate({ name: 'scan', projectId, runId: s.result.runId });
  }
  async function recheck(instances: readonly string[]): Promise<void> {
    const uniq = [...new Set(instances)];
    if (!uniq.length) return;
    const selection = uniq.length === 1 ? { kind: 'check' as const, instance: uniq[0]! } : { kind: 'group' as const, instances: uniq };
    const p = await attempt('run.plan', { projectId, selection });
    if (p.ok) await startPlan(p.result.id);
  }
  const instanceOfFinding = (id: string) => checks.find((c) => c.checkRunId === findings.find((f) => f.id === id)?.checkRunId)?.instance;
  // ⇧⌘R (13.7): «أعد الفاشل» on this page.
  $effect(() => {
    const handler = () => void openRerun('failed');
    window.addEventListener('ayar:rerun-failed', handler);
    return () => window.removeEventListener('ayar:rerun-failed', handler);
  });

  // ── export (C-23) ─────────────────────────────────────────────────────────────────────────────────────────
  let exporting = $state(false);
  async function exportReport(choice: ExportChoice): Promise<void> {
    exporting = false;
    const ext = choice.format === 'markdown' ? 'md' : choice.format === 'html' ? 'html' : choice.format === 'json' ? 'json' : 'tar';
    const dest = await attempt('dialog.pickDestination', { purpose: 'report.export', suggestedName: `${run?.displayId ?? 'report'}.${ext}` });
    if (!dest.ok || 'cancelled' in dest.result) return;
    await attempt('report.export', {
      target: target(scope === 'selected' ? selected : []),
      format: choice.format,
      lang: choice.language,
      destinationToken: dest.result.destinationToken,
      includeScreenshots: choice.includeScreenshots,
      content: choice.content === 'you' ? 'human' : choice.content,
    });
  }

  // ── reviews (FR-34): a check that needs a decision, a finding, from «راجع وقرّر» or «سجّل مراجعة» ─────────────
  let reviewing = $state<{ target: ReviewTarget; subject: string; scope?: string } | null>(null);
  async function record(r: ReviewRecord): Promise<void> {
    const what = reviewing;
    reviewing = null;
    if (!what) return;
    const decision = r.decision === 'false-alarm' ? 'false_positive' : r.decision === 'convert-to-card' ? 'card' : r.decision === 'not-an-issue' ? 'not_issue' : r.decision;
    const done = await attempt('review.record', { target: what.target, decision, note: r.note });
    if (done.ok) await load();
  }
  function reviewCheck(checkRunId: string): void {
    const c = checks.find((x) => x.checkRunId === checkRunId);
    if (c) reviewing = { target: { type: 'check', id: c.checkRunId }, subject: checkTitle(t, lang, c.checkId), scope: c.component };
  }
  function reviewFinding(id: string): void {
    const f = findings.find((x) => x.id === id);
    if (f) reviewing = { target: { type: 'finding', id: f.id }, subject: findingTitle(t, lang, f), ...(f.location?.path ? { scope: f.location.path } : {}) };
  }
  function reviewItem(item: NextItem): void {
    if (item.findingId) reviewFinding(item.findingId);
    else if (item.checkRunId) reviewCheck(item.checkRunId);
  }
  /** A direct step: setup and installs go to the plan's setup panel, approvals to the profile, a recheck reruns it. */
  function direct(item: NextItem): void {
    if (item.action === 'recheck' && item.instance) void recheck([item.instance]);
    else if (item.action === 'approve' || item.action === 'define') app.navigate({ name: 'profile', projectId });
    else app.navigate({ name: 'scan', projectId, runId: null });
  }
  function selectForCopy(findingId: string): void {
    if (!selected.includes(findingId)) selected = [...selected, findingId];
    scope = 'selected';
  }

  // ── the inspector: a finding (with its own copy), or a check (Details | Log) ─────────────────────────────────
  let inspected = $state<{ kind: 'finding'; id: string } | { kind: 'check'; checkRunId: string } | null>(null);
  let inspectorTab = $state<InspectorTab>('details');
  let inspectorCard = $state(false);
  let findingReport = $state<ReportBuilt | null>(null);
  let checkLog = $state<{ lines: ReturnType<typeof logLines>; totalLines: number } | null>(null);

  function openFinding(id: string): void {
    inspected = { kind: 'finding', id };
    findingReport = null;
    void attempt('report.build', { target: { kind: 'findings', findingIds: [id] }, options: { lang: reportLang } }).then((r) => {
      if (r.ok && inspected?.kind === 'finding' && inspected.id === id) findingReport = r.result;
    });
  }
  function openCheck(checkRunId: string, tab: InspectorTab): void {
    inspected = { kind: 'check', checkRunId };
    inspectorTab = tab;
    checkLog = null;
    void attempt('check.tail', { checkRunId, maxLines: 200 }).then((r) => {
      if (r.ok && inspected?.kind === 'check' && inspected.checkRunId === checkRunId) checkLog = { lines: logLines(t, lang, r.result.lines, r.result.totalLines), totalLines: r.result.totalLines };
    });
  }

  const displayOf = (id: string | null) => (id ? (runs.find((r) => r.runId === id)?.displayId ?? (id === runId ? (run?.displayId ?? id) : id)) : '—');
  const kindOf = { direct: 'handle-directly', model: 'needs-model', review: 'needs-review', none: 'nothing-required' } as const;

  const findingContent = $derived.by<InspectorFinding | null>(() => {
    if (inspected?.kind !== 'finding') return null;
    const id = inspected.id;
    const f = findings.find((x) => x.id === id);
    if (!f) return null;
    const rf = runReport?.report.findings.find((x) => x.id === id) ?? findingReport?.report.findings.find((x) => x.id === id);
    const next = rf?.nextStep;
    const params = { path: f.location?.path ?? '', actual: f.actual ?? '', expected: f.expected ?? '' };
    const impact = (rf?.impactKey ? textOr(t, lang, rf.impactKey, '', params) : '') || textOr(t, lang, `catalog.check.${f.checkId}.why`);
    // The excerpt line at the finding's place, from the report's bounded excerpt (12.5 rule 2).
    const ex = rf?.evidence;
    let excerpt = undefined as ReturnType<typeof logSegments> | undefined;
    if (ex) {
      const lines = ex.text.split('\n');
      const start = Number(/L(\d+)/.exec(ex.range)?.[1] ?? '1');
      const at = f.location?.line ? f.location.line - start : 0;
      const line = lines[at] ?? lines.find((l) => l.trim()) ?? '';
      excerpt = logSegments(t, lang, f.location?.line ? `${f.location.line}  ${line}` : line);
    }
    const kinds = redactionKinds(t, lang, findingReport?.model.redactions.byRule ?? {});
    return {
      kind: 'finding',
      title: findingTitle(t, lang, f),
      id: f.displayId,
      severity: f.severity,
      proof: f.proof,
      origin: f.origin,
      nextStep: next
        ? { kind: kindOf[next.kind], impact, ...(next.kind === 'direct' ? { action: directAction(next.action) } : {}), ...(next.kind === 'none' ? { reason: reasonText(t, lang, next.reason) } : {}) }
        : { kind: 'nothing-required', impact, reason: '' },
      copy: { characters: findingReport?.model.chars ?? 0, redactions: findingReport?.model.redactions.total ?? 0, ...(kinds ? { redactedKinds: kinds } : {}) },
      location: { path: f.location?.path ?? f.location?.key ?? '', ...(f.location?.line ? { line: f.location.line } : {}) },
      expected: f.expected ?? '',
      actual: f.actual ?? f.message,
      ...(excerpt ? { excerpt } : {}),
      ...(rf?.reproduce.command ? { reproduce: { command: rf.reproduce.command } } : {}),
      rule: [`${f.ruleId}@${f.ruleVersion}`, f.toolRuleId].filter(Boolean).join(' · '),
      limits: checkTexts(t, lang, f.checkId).limits,
      firstSeen: displayOf(f.firstSeenRunId),
    };
  });

  const checkContent = $derived.by<InspectorCheck | null>(() => {
    if (inspected?.kind !== 'check') return null;
    const id = inspected.checkRunId;
    const c = checks.find((x) => x.checkRunId === id);
    if (!c) return null;
    const spec = profileChecks.find((s) => s.instance === c.instance);
    const item = items.get(c.instance);
    const command = spec ? commandOf(spec) : item?.command ? argvText(item.command.argv) : null;
    return {
      kind: 'check',
      name: checkTitle(t, lang, c.checkId),
      id: c.checkId,
      ...(c.outcome ? { result: badgeOf(c.outcome, { reviewed: !!c.reviewId, reason: c.outcomeReason }), runId: run?.displayId } : {}),
      ...checkTexts(t, lang, c.checkId),
      why: spec ? reasonsOf(t, lang, spec.reasons).text : reasonText(t, lang, c.outcomeReason),
      ...(command ? { command: { command, runsCode: spec?.sideEffects.runsProjectCode ?? false, writes: spec?.sideEffects.writesRepo === 'maybe', network: item?.needs.network === 'required' } } : {}),
      readiness: readinessOf(c.readiness),
      ...(checkLog ? { log: checkLog } : {}),
    };
  });

  async function createCardFor(id: string): Promise<void> {
    const r = await attempt('task.create', { projectId, source: { kind: 'fixVerification', findingId: id } });
    if (r.ok) app.showToast({ kind: 'created', id: r.result.task.displayId });
  }
  async function copyFinding(id: string): Promise<void> {
    let built = findingReport;
    if (inspectorCard) {
      const r = await attempt('report.build', { target: { kind: 'findings', findingIds: [id] }, options: { lang: reportLang, createVerificationCards: true } });
      built = r.ok ? r.result : null;
    }
    if (!built || built.blocked) return;
    const c = await attempt('clipboard.copy', { kind: 'report', id: built.reportId });
    if (c.ok) app.showToast({ kind: 'report', count: c.result.chars });
  }

  $effect(() => {
    const has = !!(findingContent || checkContent);
    app.inspector = has ? inspectorSnippet : null;
    if (has) app.inspectorOpen = true;
    return () => (app.inspector = null);
  });

  const isTab = (v: View): v is (typeof TAB_VIEWS)[number] => (TAB_VIEWS as readonly string[]).includes(v);
  const forModel = $derived(view === 'for-model');
</script>

{#snippet findingModel()}
  {#if findingReport}<ModelReportText built={findingReport} />{/if}
{/snippet}

{#snippet inspectorSnippet()}
  {#if findingContent && inspected?.kind === 'finding'}
    {@const id = inspected.id}
    <Inspector
      id="ayar-inspector"
      content={findingContent}
      bind:createCard={inspectorCard}
      oncopyid={copyText}
      oncopycommand={copyText}
      oncopypath={copyText}
      oncopy={() => void copyFinding(id)}
      onopenineditor={() => void attempt('editor.open', { findingId: id })}
      oncreatecard={() => void createCardFor(id)}
      onrecordreview={() => reviewFinding(id)}
      onrecheck={() => {
        const instance = instanceOfFinding(id);
        if (instance) void recheck([instance]);
      }}
      onnextstep={() => selectForCopy(id)}
      formodel={findingReport ? findingModel : undefined}
    />
  {:else if checkContent}
    <Inspector id="ayar-inspector" content={checkContent} tab={inspectorTab} ontabchange={(tab: InspectorTab) => (inspectorTab = tab)} oncopyid={copyText} oncopycommand={copyText} />
  {/if}
{/snippet}

{#if run}
  <div class="page" data-testid="results" data-run={run.displayId} data-view={view}>
    <header class="page-header">
      <h1 class="title">{forModel ? t('resultsui.title.forModel') : t('resultsui.title')}</h1>
      {#if forModel}<p class="subtitle"><LtrText text={copyReport && copyReport.displayId !== run.displayId ? t('resultsui.subtitle.forModel', { run: run.displayId, report: copyReport.displayId }) : run.displayId} mono /></p>{/if}
    </header>

    {#if !forModel}
      <div class="results-header">
        {#if cardPurity?.verdict && cardRun}
          <div class="purity">
            <PurityCard
              verdict={cardPurity.verdict}
              karat={cardPurity.karat}
              criteria={cardPurity.criteriaCount}
              checks={cardPurity.checksCount}
              counts={countsInOrder(cardPurity.counts.byOutcome)}
              roundId={cardRun.purity?.roundDisplayId ?? cardRun.displayId}
              roundDate={cardRun.finishedAt ? dayTime(cardRun.finishedAt, lang) : ''}
              missing={cardPurity.verdict === 'incomplete' && integrityHold(cardPurity) === 0 ? missingForPure(cardPurity) : []}
              blocking={cardPurity.verdict === 'blocked' ? blockingOf(t, lang, cardPurity) : []}
              integrityHold={cardPurity.verdict === 'incomplete' && cardPurity.karat === 24 ? integrityHold(cardPurity) : 0}
              {stale}
              narrowScope={cardPurity.narrow}
              ondetails={() => (scoring = true)}
              onfullscan={() => app.navigate({ name: 'scan', projectId, runId: null })}
            />
          </div>
        {:else}
          <section class="card summary" aria-labelledby="results-summary">
            <h2 class="sub" id="results-summary">{t(cancelled ? 'resultsui.summary.cancelled' : 'resultsui.summary.partial')}</h2>
            <div class="counts">{#each counts as x (x.result)}<ResultBadge result={x.result} size="sm" count={x.count} />{/each}</div>
            <p class="small secondary">{cancelled ? t('resultsui.summary.cancelledNoKarat') : roundRef ? t('resultsui.summary.noKaratRound', { round: roundRef }) : t('resultsui.summary.noKarat')}</p>
          </section>
        {/if}
        <div class="run-meta">
          <span class="run-id"><LtrText text={run.displayId} mono /></span>
          <p class="body">{metaLine}</p>
          {#if stateLine}<p class="small secondary">{stateLine}</p>{/if}
          <div class="actions">
            <Button kind="secondary" disabled={!rerunCountsOf.failed && !rerunCountsOf.flaky && !rerunCountsOf.unavailable && !rerunCountsOf['timed-out']} onclick={() => void openRerun('failed')}>{t('ui.action.rerunFailed')}</Button>
            <Button kind={cancelled ? 'primary' : 'secondary'} disabled={!rerunDefaults('incomplete', rerunCountsOf).length} onclick={() => void openRerun('incomplete')}>{t('ui.action.rerunIncomplete')}</Button>
          </div>
          <div class="actions">
            <Button kind="secondary" disabled={!runReport || !!runReport.blocked} onclick={() => (exporting = true)}>{t('resultsui.action.export')}</Button>
            <Button kind="quiet" disabled>{t('ui.action.compareWithRun')}</Button>
          </div>
        </div>

      </div>

      {#if stale}
        <div class="card stale-note"><Icon name="history" size={16} /><p class="body strong">{t('resultsui.stale')}</p></div>
      {/if}
    {/if}

    <CopyForModelBar
      context="results"
      bind:scope
      selectedCount={selected.length}
      characters={copyReport?.model.chars}
      redactions={copyReport?.model.redactions.total ?? 0}
      redactedKinds={copyReport ? redactionKinds(t, lang, copyReport.model.redactions.byRule) : undefined}
      bind:createCard
      disabled={!copyReport || !!copyReport.blocked}
      view={view === 'for-model' ? 'for-model' : 'for-you'}
      viewEmpty={isTab(view)}
      oncopy={() => void copy()}
      onviewchange={(v: ReportView) => (view = v)}
    />

    <Tabs kind="results" label={t('resultsui.title')} value={isTab(view) ? view : undefined} empty={!isTab(view)} panelId={() => 'results-panel'} onchange={(v: string) => (view = v as View)} />

    <div class="panel" id="results-panel">
      {#if reportError && !runReport}
        <p class="small secondary">{t('resultsui.reportFailed', { code: reportError })}</p>
      {/if}
      {#if view === 'for-you'}
        {#if runReport}<ForYou report={runReport.report} {purity} ondirect={direct} onselect={selectForCopy} onreview={reviewItem} />{/if}
      {:else if view === 'for-model'}
        <ForModel
          built={copyReport}
          {reportLang}
          {longEvidence}
          onlangchange={(l: Lang) => (reportLang = l)}
          onlongevidencechange={(v: boolean) => (longEvidence = v)}
          onsplit={() => {
            grouping = 'section';
            scope = 'selected';
            view = 'findings';
          }}
        />
      {:else if view === 'findings'}
        <FindingsTab
          {findings}
          excludedByReview={page?.excludedByReview ?? 0}
          {selected}
          {grouping}
          onselectionchange={(ids: string[]) => {
            selected = ids;
            if (ids.length) scope = 'selected';
          }}
          ongroupingchange={(g: FindingGrouping) => (grouping = g)}
          onopen={openFinding}
          onrecheck={() => void recheck(selected.map(instanceOfFinding).filter((x): x is string => !!x))}
        />
      {:else if view === 'checks'}
        <ChecksTab
          {checks}
          {items}
          {order}
          onopen={(id: string) => openCheck(id, 'details')}
          onlog={(id: string) => openCheck(id, 'log')}
          onevidence={(id: string) => {
            evidenceCheck = checks.find((c) => c.checkRunId === id)?.checkId ?? null;
            view = 'evidence';
          }}
          onreview={reviewCheck}
        />
      {:else if view === 'evidence'}
        <EvidenceTab rows={evidenceRows(checks)} checkId={evidenceCheck} />
      {:else}
        <SideEffectsTab rows={sideEffectRows(checks)} />
      {/if}
    </div>
  </div>

  {#if scoringData}
    <SheetScoringDetails open={scoring} criteria={scoringData.criteria} summary={scoringData.summary} oncancel={() => (scoring = false)} />
  {/if}
  {#if rerun}
    <SheetReRun open variant={rerun} counts={rerunCountsOf} dependencies={rerunDeps} oncancel={() => (rerun = null)} onrerun={(s: RerunStatus[]) => void startRerun(s)} />
  {/if}
  <SheetExportReport open={exporting} oncancel={() => (exporting = false)} onexport={(c: ExportChoice) => void exportReport(c)} />
  {#if reviewing}
    <SheetHumanReview open variant="check" subject={reviewing.subject} scope={reviewing.scope} oncancel={() => (reviewing = null)} onrecord={(r: ReviewRecord) => void record(r)} oncopy={copyText} />
  {/if}
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    padding: var(--space-24) var(--space-32);
  }
  .page-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  h1,
  h2,
  p {
    margin: 0;
  }
  .title {
    font: var(--type-title-page);
    color: var(--text-primary);
  }
  .subtitle {
    font: var(--type-body);
    color: var(--text-secondary);
  }
  .results-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-16);
  }
  .run-meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    flex: 1;
    min-width: 0;
  }
  .run-id {
    font: var(--type-mono);
    color: var(--text-secondary);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8);
  }
  .purity {
    flex: none;
    inline-size: 400px;
  }
  .card {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .summary {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: none;
    inline-size: 400px;
    padding: var(--space-16);
  }
  .sub {
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .stale-note {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-16);
  }
  .body {
    font: var(--type-body);
    color: var(--text-primary);
  }
  .strong {
    font: var(--type-body-strong);
  }
  .small {
    font: var(--type-body-small);
  }
  .secondary {
    color: var(--text-secondary);
  }
  .panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
</style>
