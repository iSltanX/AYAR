<script lang="ts">
  // Screen 15 · النزاهة (13.3; Figma 15.1, first round 15.2): no section karat; the four integrity checks with their
  // latest result and open items, then a panel each. The guard's effects — a skipped test, a lowered threshold, a
  // silenced rule, an updated snapshot or reference — each with its file, its kind and the check it touches, and
  // «راجع وقرّر»: accepting it is a review on that check («اجتاز (بمراجعة)», AT-24 ز), a false alarm excludes the
  // effect (D-35). The state's stability (what changed during the scan, outside the declared outputs). The model's
  // claims: proven by a local check, or open until you decide («حوّل إلى بطاقة» · «ليس مشكلة»); a claim is never a
  // result. And every recorded review with its scope and whether it still holds (11.4 rule 6).
  import type { AiChecksView, CheckRunDetail, CheckSpec, Finding, ModelClaim, ReviewRecord as WireReview } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import Icon from '../../components/Icon.svelte';
  import ModelClaimRow from '../../components/ModelClaimRow.svelte';
  import ResultBadge from '../../components/ResultBadge.svelte';
  import SheetHumanReview from '../../components/SheetHumanReview.svelte';
  import Tag from '../../components/Tag.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import type { ClaimDecision } from '../../lib/results.ts';
  import type { ReviewRecord } from '../../lib/sheets.ts';
  import { proveClaim } from '../../app/actions.ts';
  import { attempt, copyText } from '../../app/client.ts';
  import { badgeOf, checkTitle, day, reasonText } from '../../app/format.ts';
  import { loadPanelData, type CheckData } from '../../app/panels.ts';
  import { findingTitle } from '../../app/results.ts';
  import type { SectionModel } from '../../app/sections.ts';
  import { useApp } from '../../app/state.svelte.ts';
  import Panel from './Panel.svelte';

  interface Props {
    projectId: string;
    model: SectionModel;
    onchanged: () => void;
    /** The open items that keep the verdict from «نقي», for the page's header. */
    onblockers: (count: number) => void;
  }
  let { projectId, model, onchanged, onblockers }: Props = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  const IDS = ['integ.guard', 'integ.state', 'integ.model-claims', 'integ.reviews'] as const;
  let data = $state<Map<string, CheckData[]>>(new Map());
  /** The guard's run: its executions (the checks its effects touch) and their findings. */
  let runChecks = $state<CheckRunDetail[]>([]);
  let runFindings = $state<Finding[]>([]);
  let claims = $state<AiChecksView | null>(null);
  let reviews = $state<WireReview[]>([]);
  let tasks = $state<{ displayId: string; follows: string | null }[]>([]);
  let outputDirs = $state<string[]>([]);
  async function load(): Promise<void> {
    const d = await loadPanelData(projectId, model, IDS);
    data = d;
    const runId = d.get('integ.guard')?.[0]?.exec.check.runId;
    const [run, found, ai, rv, tk, project] = await Promise.all([
      runId ? attempt('run.get', { runId }) : null,
      runId ? attempt('results.query', { projectId, filters: { runId, includeExcluded: true, limit: 1000 } }) : null,
      attempt('aiChecks.list', { projectId }),
      attempt('reviews.list', { projectId }),
      attempt('tasks.list', { projectId }),
      attempt('project.get', { projectId }),
    ]);
    runChecks = run?.ok ? run.result.checks : [];
    runFindings = found?.ok ? found.result.findings : [];
    claims = ai.ok ? ai.result : null;
    reviews = rv.ok ? rv.result.reviews : [];
    tasks = tk.ok ? tk.result.tasks.map((x) => ({ displayId: x.displayId, follows: x.follows })) : [];
    const declared = model.profile.references.outputs;
    outputDirs = [...new Set([...(project.ok ? (project.result.snapshot?.inventory.outputDirs.map((o) => o.path) ?? []) : []), ...(Array.isArray(declared) ? declared.filter((x): x is string => typeof x === 'string') : typeof declared === 'string' ? [declared] : [])])];
  }
  $effect(() => {
    void load();
  });

  // All four, applicable or not (15.2: a check with nothing to watch yet says «غير منطبق» in its own panel).
  const specs = $derived<CheckSpec[]>(model.profile.checks.filter((s) => s.section === 'integrity'));
  const first = (checkId: string): CheckData | undefined => data.get(checkId)?.[0];
  const notApplicable = (checkId: string) => specs.some((s) => s.checkId === checkId && !s.applicable);
  const resultOf = (d: CheckData | undefined, checkId?: string) => (d?.exec.check.outcome ? badgeOf(d.exec.check.outcome, { reviewed: !!d.exec.check.reviewId, reason: d.exec.check.outcomeReason }) : checkId && notApplicable(checkId) ? 'not-applicable' : undefined);
  const live = (d: CheckData | undefined) => (d?.findings ?? []).filter((f) => f.effect !== 'excluded');

  // ── the guard (15.1) ───────────────────────────────────────────────────────────────────────────────────────
  const guard = $derived(first('integ.guard'));
  const firstRound = $derived(guard?.exec.check.outcomeReason?.key === 'integrity.reason.guardNoBaseline');
  const KINDS = ['skipped-test', 'threshold-lowered', 'silenced-rule', 'snapshot-changed', 'reference-changed'] as const;
  const kindOf = (ruleId: string) => KINDS.find((k) => ruleId === `guard.${k}`) ?? null;
  type GuardItem = { f: Finding; attached: Finding | null; checkId: string | null; check: CheckRunDetail | null; status: 'open' | 'accepted' | 'rejected' | 'excluded' };
  const reviewById = $derived(new Map(reviews.map((r) => [r.id, r])));
  /** The check each effect touches, as the guard recorded it (C-22 «الربط»): by rule and place. */
  const links = $derived.by(() => {
    const raw = guard?.report?.info.links;
    return Array.isArray(raw) ? (raw as { rule?: string; path?: string; line?: number | null; check?: string | null }[]).map((l) => ({ key: `${l.rule}|${l.path}|${l.line ?? ''}`, check: l.check ?? null })) : [];
  });
  const guardItems = $derived<GuardItem[]>(
    (guard?.findings ?? [])
      .filter((f) => f.ruleId.startsWith('guard.'))
      .map((f) => {
        // The same effect, attached to the check it touches (7.3 rule 8): same rule, same place.
        const attached = runFindings.find((x) => x.checkId !== 'integ.guard' && x.ruleId === f.ruleId && x.location?.path === f.location?.path && (x.location?.line ?? null) === (f.location?.line ?? null)) ?? null;
        const checkId = attached?.checkId ?? links.find((l) => l.key === `${f.ruleId}|${f.location?.path ?? ''}|${f.location?.line ?? ''}`)?.check ?? null;
        const check = (attached ? runChecks.find((c) => c.checkRunId === attached.checkRunId) : checkId ? runChecks.find((c) => c.checkId === checkId) : undefined) ?? null;
        const review = check?.reviewId ? reviewById.get(check.reviewId) : undefined;
        const status: GuardItem['status'] = f.effect === 'excluded' || attached?.effect === 'excluded' ? 'excluded' : review?.decision === 'accept' && review.valid ? 'accepted' : review?.decision === 'reject' && review.valid ? 'rejected' : 'open';
        return { f, attached, checkId, check, status };
      }),
  );
  const openOf = (checkId: string): number => (checkId === 'integ.guard' ? guardItems.filter((g) => g.status === 'open').length : live(first(checkId)).length);
  $effect(() => {
    if (!data.size) return;
    // What keeps the verdict from «نقي»: the open items of the integrity checks that ask for a review.
    onblockers(IDS.reduce((n, id) => n + (first(id)?.exec.check.outcome === 'needs_review' ? openOf(id) : 0), 0));
  });

  let reviewing = $state<GuardItem | null>(null);
  async function decide(r: ReviewRecord): Promise<void> {
    const item = reviewing;
    reviewing = null;
    if (!item) return;
    if (r.decision === 'false-alarm') {
      // The effect is excluded where it was found and on the check it touches, while its fingerprint holds (D-35).
      for (const f of [item.f, item.attached]) if (f) await attempt('review.record', { target: { type: 'finding', id: f.id }, decision: 'false_positive', note: r.note });
    } else if (r.decision === 'accept' || r.decision === 'reject') {
      // On the check it touches when that check ran (AT-24 ز: «اجتاز (بمراجعة)»); otherwise on the effect itself.
      const ran = item.check && item.check.outcome && !['missing', 'skipped', 'not_applicable', 'cancelled', 'interrupted', 'unavailable'].includes(item.check.outcome);
      await attempt('review.record', { target: ran ? { type: 'check', id: item.check!.checkRunId } : { type: 'finding', id: item.f.id }, decision: r.decision, note: r.note });
    }
    await load();
    onchanged();
  }

  // ── the state (9.9, 11.4 rule 8) ───────────────────────────────────────────────────────────────────────────
  const stability = $derived(first('integ.state'));
  const changedFiles = $derived(live(stability).map((f) => f.location?.path ?? '').filter(Boolean));

  // ── the model's claims (12.9, C-25 point 4) ────────────────────────────────────────────────────────────────
  const claimsCheck = $derived(first('integ.model-claims'));
  const openClaims = $derived((claims?.claims ?? []).filter((c) => c.status !== 'proven'));
  const claimChecks = $derived([...new Set((claims?.claims ?? []).map((c) => c.aiCheckDisplayId))].join(lang === 'ar' ? '، ' : ', '));
  const sectionOf = (checkId: string) => model.profile.checks.find((s) => s.checkId === checkId)?.section;
  function decisionOf(c: ModelClaim): ClaimDecision | undefined {
    if (c.status === 'decided_card') {
      const card = tasks.find((x) => x.follows === c.displayId)?.displayId;
      return card ? { kind: 'card', card } : undefined;
    }
    if (c.status === 'decided_not_issue') {
      const r = c.reviewId ? reviewById.get(c.reviewId) : undefined;
      return r ? { kind: 'not-issue', date: day(r.createdAt, lang) } : undefined;
    }
    return undefined;
  }
  let claimReviewing = $state<ModelClaim | null>(null);
  async function decideClaim(r: ReviewRecord): Promise<void> {
    const c = claimReviewing;
    claimReviewing = null;
    if (!c) return;
    await attempt('review.record', { target: { type: 'modelClaim', id: c.id }, decision: r.decision === 'convert-to-card' ? 'card' : 'not_issue', note: r.note });
    await load();
    onchanged();
  }
  /** «أثبِت بإعادة الفحص»: the local check the claim names, run now. */
  function prove(c: ModelClaim): void {
    if (c.matchedCheckId) void proveClaim(app, projectId, model.profile.checks, c.matchedCheckId);
  }

  // ── the reviews (11.4 rule 6) ──────────────────────────────────────────────────────────────────────────────
  const reviewsCheck = $derived(first('integ.reviews'));
  const findingOf = (id: string) => runFindings.find((f) => f.id === id);
  const reviewRows = $derived(
    [...reviews]
      .filter((r) => r.target.type !== 'modelClaim')
      .reverse()
      .map((r) => {
        const decision = t(`sectionui.integrity.decision.${r.decision}` as Parameters<typeof t>[0]);
        const checkId = r.target.type === 'check' ? r.targetRef.split('@')[0]!.split('#')[0]! : (findingOf(r.target.id)?.checkId ?? null);
        const f = r.target.type === 'finding' ? findingOf(r.target.id) : undefined;
        const title =
          r.target.type === 'check'
            ? t('sectionui.integrity.reviewCheck', { subject: r.target.item ? t(`sectionui.design.item.${r.target.item}` as Parameters<typeof t>[0]) : checkTitle(t, lang, checkId ?? ''), decision })
            : t('sectionui.integrity.reviewFinding', { decision, subject: r.note.trim() || (f ? findingTitle(t, lang, f) : r.targetRef.slice(0, 12)) });
        const renewed = reviews.find((x) => x.id !== r.id && x.targetRef === r.targetRef && x.createdAt > r.createdAt);
        return { r, title, checkId, renewed };
      }),
  );
</script>

{#snippet value(text: string)}<span class="val"><bdi dir="ltr">{text}</bdi></span>{/snippet}

<Panel title={t('sectionui.integrity.checks', { count: specs.length })} testid="panel-integrity-checks" note={t('sectionui.integrity.checksNote')}>
  <table class="ptable">
    <thead><tr><th scope="col">{t('scanplan.column.check')}</th><th scope="col">{t('sectionui.column.lastResult')}</th><th scope="col">{t('sectionui.integrity.openItems')}</th></tr></thead>
    <tbody>
      {#each specs as s (s.instance)}
        {@const d = first(s.checkId)}
        {@const r = resultOf(d, s.checkId)}
        <tr>
          <td><span class="stack"><span class="strong">{checkTitle(t, lang, s.checkId)}</span><bdi class="mono muted" dir="ltr">{s.checkId}</bdi></span></td>
          <td>{#if r}<ResultBadge result={r} size="sm" />{:else}<span class="muted">{t('sectionui.notRun')}</span>{/if}</td>
          <td class="num">{d ? openOf(s.checkId) : '—'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</Panel>

{#if specs.some((s) => s.checkId === 'integ.guard')}
  <Panel title={t('sectionui.integrity.guard')} checkId="integ.guard" result={resultOf(guard)} qualifier={firstRound ? t('sectionui.integrity.noBaseline') : undefined} testid="panel-guard" note={!guard ? t('sectionui.panel.notRun') : firstRound ? t('sectionui.integrity.guardFirst') : guardItems.length ? t('sectionui.integrity.guardNote') : guard.exec.check.outcomeReason?.key === 'integrity.reason.guardClean' ? t('sectionui.integrity.guardClean') : reasonText(t, lang, guard.exec.check.outcomeReason)}>
    {#each guardItems as g (g.f.id)}
      {@const kind = kindOf(g.f.ruleId)}
      <div class="row" data-status={g.status}>
        <div class="body">
          <p class="tags">
            {#if kind}<Tag>{t(`sectionui.integrity.kind.${kind}` as Parameters<typeof t>[0])}</Tag>{/if}
            {#if g.f.location?.path}{@render value(g.f.location.path + (g.f.location.line ? `:${g.f.location.line}` : ''))}{/if}
          </p>
          <p class="text"><bdi>{findingTitle(t, lang, g.f)}</bdi></p>
          {#if g.f.expected || g.f.actual}<p class="code"><bdi dir="ltr">{[g.f.expected, g.f.actual].filter(Boolean).join('  →  ')}</bdi></p>{/if}
        </div>
        <div class="linked">
          <span class="small muted">{t('sectionui.integrity.linked')}</span>
          {#if g.checkId}{@render value(g.checkId)}{:else}<span class="small muted">{t('sectionui.integrity.unlinked')}</span>{/if}
        </div>
        <div class="end">
          {#if g.status === 'open'}
            <Button kind="secondary" icon="user" onclick={() => (reviewing = g)}>{t('ui.action.reviewAndDecide')}</Button>
          {:else}
            <Tag>{t(`sectionui.integrity.${g.status}` as Parameters<typeof t>[0])}</Tag>
          {/if}
        </div>
      </div>
    {/each}
  </Panel>
{/if}

{#if specs.some((s) => s.checkId === 'integ.state')}
  <Panel title={t('sectionui.integrity.state')} checkId="integ.state" result={resultOf(stability)} testid="panel-state" note={!stability ? t('sectionui.panel.notRun') : changedFiles.length ? t('sectionui.integrity.stateChanged') : stability.exec.check.outcome === 'passed' ? t('sectionui.integrity.stateStable') : reasonText(t, lang, stability.exec.check.outcomeReason)}>
    {#if changedFiles.length}
      <p class="tags">{#each changedFiles.slice(0, 12) as p (p)}{@render value(p)}{/each}</p>
    {/if}
    {#if stability && outputDirs.length}
      <p class="tags">{#each outputDirs as o (o)}{@render value(o.endsWith('/') ? o : `${o}/`)}{/each}<span class="small muted">{t('sectionui.integrity.outputs')}</span></p>
    {/if}
  </Panel>
{/if}

{#if specs.some((s) => s.checkId === 'integ.model-claims')}
  {@const any = (claims?.claims.length ?? 0) > 0}
  <Panel title={t(any ? 'sectionui.integrity.claims' : 'sectionui.integrity.claimsEmpty')} checkId="integ.model-claims" result={resultOf(claimsCheck, 'integ.model-claims')} testid="panel-claims" note={any ? t('sectionui.integrity.claimsNote', { checks: claimChecks }) : t('sectionui.integrity.claimsNone')}>
    {#if any}
      {#each claims?.proven ?? [] as p (p.claimDisplayId)}
        {@const section = sectionOf(p.checkId)}
        <p class="proven"><Icon name="check" size={16} /><span class="strong-small">{t('sectionui.integrity.proven')}</span>{@render value(p.claimDisplayId)}<span class="small muted">{t('sectionui.integrity.provenText', { finding: p.findingDisplayId, section: section ? t(`ui.section.${section}` as Parameters<typeof t>[0]) : p.checkId })}</span></p>
      {/each}
      {#each openClaims as c (c.id)}
        <ModelClaimRow note={c.summary} claimId={c.displayId} location={{ path: c.location?.path ?? '', ...(c.location?.line ? { line: c.location.line } : {}) }} localCheck={c.matchedCheckId ?? undefined} decision={decisionOf(c)} onprove={() => prove(c)} onreview={() => (claimReviewing = c)} />
      {/each}
    {:else}
      <div><Button kind="secondary" onclick={() => app.navigate({ name: 'modelChecks', projectId })}>{t('sectionui.integrity.openModelChecks')}</Button></div>
    {/if}
  </Panel>
{/if}

{#if specs.some((s) => s.checkId === 'integ.reviews')}
  <Panel title={t('sectionui.integrity.reviews')} checkId="integ.reviews" result={resultOf(reviewsCheck, 'integ.reviews')} testid="panel-reviews" note={reviewRows.length ? t('sectionui.integrity.reviewsNote') : t('sectionui.integrity.reviewsNone')}>
    {#if reviewRows.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.integrity.review')}</th><th scope="col">{t('sectionui.integrity.scope')}</th><th scope="col">{t('sectionui.integrity.date')}</th><th scope="col">{t('sectionui.integrity.status')}</th></tr></thead>
        <tbody>
          {#each reviewRows as row (row.r.id)}
            <tr>
              <td><span class="stack"><span class="strong"><bdi>{row.title}</bdi></span>{#if row.checkId}<bdi class="mono muted" dir="ltr">{row.checkId}</bdi>{/if}</span></td>
              <td>{#if row.r.scope.files.length}{@render value(row.r.scope.files.length === 1 ? row.r.scope.files[0]! : t('sectionui.design.review.files', { count: row.r.scope.files.length }))}{:else}—{/if}</td>
              <td class="num">{day(row.r.createdAt, lang)}</td>
              <td><span class="stack"><Tag>{row.r.valid ? t('sectionui.integrity.valid') : t('sectionui.integrity.expired')}</Tag>{#if !row.r.valid && row.renewed}<span class="small muted">{t('sectionui.integrity.renewed', { date: day(row.renewed.createdAt, lang) })}</span>{/if}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Panel>
{/if}

{#if reviewing}
  <SheetHumanReview open variant="check" subject={findingTitle(t, lang, reviewing.f)} scope={reviewing.f.location?.path ?? undefined} oncancel={() => (reviewing = null)} onrecord={(r: ReviewRecord) => void decide(r)} oncopy={copyText} />
{/if}
{#if claimReviewing}
  <SheetHumanReview open variant="model-claim" claim={{ id: claimReviewing.displayId, text: claimReviewing.summary }} oncancel={() => (claimReviewing = null)} onrecord={(r: ReviewRecord) => void decideClaim(r)} oncopy={copyText} />
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-16);
    padding-block: var(--space-12);
    border-block-end: 1px solid var(--border-subtle);
  }
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .body p,
  .tags,
  .proven {
    margin: 0;
  }
  .tags,
  .proven {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .text {
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .code {
    font: var(--type-mono);
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }
  .linked {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    min-inline-size: 120px;
  }
  .end {
    display: flex;
    justify-content: flex-end;
    min-inline-size: 140px;
  }
  .proven {
    padding-block: var(--space-8);
    color: var(--text-primary);
  }
  .stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .strong {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .strong-small {
    font: var(--type-body);
    color: var(--text-primary);
  }
  .small {
    font: var(--type-body-small);
  }
  .muted {
    color: var(--text-secondary);
  }
  .mono {
    font: var(--type-mono);
  }
  .val {
    padding: 1px var(--space-8);
    border-radius: 4px;
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
