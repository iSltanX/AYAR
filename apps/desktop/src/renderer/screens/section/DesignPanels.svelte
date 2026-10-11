<script lang="ts">
  // Screen 10 · التصميم والواجهة (13.3; Figma 10.2 181:17018, 10.3 181:36998; the reference board is DesignReference):
  // the gallery of captures with its filters (a «حساسة» state is never captured); the diff of
  // a capture against its reference, approved explicitly or reviewed; the accessibility results by rule; the
  // direction problems; and the human review, item by item (the keyboard, the screen reader, the 200% zoom, the
  // states without colour), each with its decision, date and scope.
  import type { CaptureView, CheckSpec, Finding, ReviewRecord as WireReview, UncapturedView } from '@ayar/protocol';
  import { A11Y_REVIEW_ITEMS, type A11yReviewItem } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import CaptureTile from '../../components/CaptureTile.svelte';
  import Icon from '../../components/Icon.svelte';
  import ImageDiffViewer from '../../components/ImageDiffViewer.svelte';
  import Select from '../../components/Select.svelte';
  import Severity from '../../components/Severity.svelte';
  import SheetBaselineApproval from '../../components/SheetBaselineApproval.svelte';
  import SheetHumanReview from '../../components/SheetHumanReview.svelte';
  import Tag from '../../components/Tag.svelte';
  import type { CaptureKey, EvidenceImage } from '../../lib/evidence.ts';
  import { useLocale } from '../../lib/locale.ts';
  import type { ReviewRecord } from '../../lib/sheets.ts';
  import type { BadgeResult } from '../../lib/status.ts';
  import { attempt, copyText } from '../../app/client.ts';
  import { badgeOf, day } from '../../app/format.ts';
  import { groupBy, loadPanelData, type CheckData } from '../../app/panels.ts';
  import { findingTitle } from '../../app/results.ts';
  import type { SectionModel } from '../../app/sections.ts';
  import Panel from './Panel.svelte';

  interface Props {
    projectId: string;
    model: SectionModel;
    onchanged: () => void;
  }
  let { projectId, model, onchanged }: Props = $props();
  const { t, lang } = useLocale();

  const PROBE = ['design.visual', 'design.states', 'design.a11y', 'design.rtl.render'] as const;
  const IDS = [...PROBE, 'design.rtl.static', 'design.a11y.review'] as const;
  let data = $state<Map<string, CheckData[]>>(new Map());
  let captures = $state<CaptureView[]>([]);
  let uncaptured = $state<UncapturedView[]>([]);
  let reviews = $state<WireReview[]>([]);
  async function load(): Promise<void> {
    const d = await loadPanelData(projectId, model, IDS);
    data = d;
    // The gallery reads the probe execution that captured: the visual comparison first (it compares with references).
    for (const id of PROBE) {
      const exec = d.get(id)?.[0];
      if (!exec) continue;
      const c = await attempt('captures.list', { checkRunId: exec.exec.check.checkRunId });
      if (c.ok && (c.result.captures.length || c.result.uncaptured.length)) {
        captures = c.result.captures;
        uncaptured = c.result.uncaptured;
        break;
      }
    }
    const r = await attempt('reviews.list', { projectId });
    if (r.ok) reviews = r.result.reviews;
  }
  $effect(() => {
    void load();
  });

  const first = (checkId: string): CheckData | undefined => data.get(checkId)?.[0];
  const resultOf = (d: CheckData | undefined) => (d?.exec.check.outcome ? badgeOf(d.exec.check.outcome, { reviewed: !!d.exec.check.reviewId, reason: d.exec.check.outcomeReason }) : undefined);

  const designSpecs = $derived<CheckSpec[]>(model.profile.checks.filter((s) => s.section === 'design'));

  // ── images (single-use evidence tokens, G-DEV5-03) ─────────────────────────────────────────────────────────
  let images = $state<Record<string, EvidenceImage>>({});
  async function image(evidenceId: string | null, width: number, height: number): Promise<void> {
    if (!evidenceId || images[evidenceId]) return;
    const r = await attempt('evidence.token', { evidenceId });
    if (r.ok) images = { ...images, [evidenceId]: { src: `ayar-evidence://e/${r.result.token}`, width, height } };
  }

  // ── the gallery ────────────────────────────────────────────────────────────────────────────────────────────
  let fState = $state('all');
  let fSize = $state('all');
  let fTheme = $state('all');
  let fLang = $state('all');
  let showAll = $state(false);
  const values = (pick: (c: CaptureView) => string) => [...new Set(captures.map(pick))];
  const option = (key: 'sectionui.design.allStates' | 'sectionui.design.allSizes' | 'sectionui.design.allThemes' | 'sectionui.design.allLangs', vals: string[]) => [{ value: 'all', label: t(key, { count: vals.length }) }, ...vals.map((v) => ({ value: v, label: v }))];
  const shown = $derived(captures.filter((c) => (fState === 'all' || c.key.state === fState) && (fSize === 'all' || c.key.viewport === fSize) && (fTheme === 'all' || c.key.theme === fTheme) && (fLang === 'all' || c.key.lang === fLang)));
  const visible = $derived(showAll ? shown : shown.slice(0, 12));
  $effect(() => {
    for (const c of visible) void image(c.id, c.width, c.height);
  });
  const tileResult = (c: CaptureView): BadgeResult => (c.comparison === 'differs' ? 'needs-review' : c.comparison === 'match' ? 'passed' : c.comparison === 'no_reference' ? 'missing-configuration' : 'skipped');
  const tags = (k: { state: string; viewport: string; theme: string; lang: string }) => [k.state, k.viewport, k.theme, k.lang.toUpperCase()];
  const keyText = (c: CaptureView) => [c.key.state, c.key.viewport, c.key.theme, c.key.lang, c.key.platform, c.key.browser, `${c.key.density}x`, c.key.mode].join(' · ');

  // ── the diff ───────────────────────────────────────────────────────────────────────────────────────────────
  let selected = $state<string | null>(null);
  const diffCapture = $derived(captures.find((c) => c.id === selected) ?? captures.find((c) => c.comparison === 'differs') ?? null);
  $effect(() => {
    const c = diffCapture;
    if (!c) return;
    void image(c.id, c.width, c.height);
    void image(c.baselineId, c.width, c.height);
  });
  const captureKey = (c: CaptureView): CaptureKey => ({ state: c.key.state, size: c.key.viewport, theme: c.key.theme, language: c.key.lang, platform: c.key.platform, browser: c.key.browser, pixelDensity: `${c.key.density}x` });
  const visualFinding = (c: CaptureView): Finding | undefined => (first('design.visual')?.findings ?? []).find((f) => f.location?.state === c.key.state && (f.location?.viewport ?? c.key.viewport) === c.key.viewport && (f.location?.theme ?? c.key.theme) === c.key.theme && (f.location?.lang ?? c.key.lang) === c.key.lang);

  let approving = $state<CaptureView | null>(null);
  async function approve(): Promise<void> {
    const c = approving;
    approving = null;
    if (!c) return;
    const r = await attempt('baseline.approve', { projectId, captureIds: [c.id] });
    if (r.ok) await load();
  }

  // ── accessibility and direction ────────────────────────────────────────────────────────────────────────────
  const a11y = $derived(first('design.a11y'));
  const RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  const a11yRules = $derived(
    groupBy((a11y?.findings ?? []).filter((f) => f.ruleId === 'a11y.violation' && f.effect !== 'excluded'), (f) => f.toolRuleId ?? f.ruleId).map(([rule, fs]) => {
      const top = [...fs].sort((a, b) => RANK[a.severity] - RANK[b.severity])[0]!;
      const where = [top.location?.page, top.location?.state].filter(Boolean).join(' · ');
      return { rule, impact: top.message, severity: top.severity, count: fs.length, where, snippet: top.actual ?? '' };
    }),
  );
  const rtl = $derived([...(first('design.rtl.render')?.findings ?? []), ...(first('design.rtl.static')?.findings ?? [])].filter((f) => f.effect !== 'excluded'));
  const rtlResult = $derived(resultOf(first('design.rtl.render') ?? first('design.rtl.static')));
  const rtlCheck = $derived(first('design.rtl.render') ? 'design.rtl.render' : 'design.rtl.static');

  // ── the human review, item by item (10.3) ──────────────────────────────────────────────────────────────────
  const review = $derived(first('design.a11y.review'));
  const reviewSpec = $derived(designSpecs.find((s) => s.checkId === 'design.a11y.review' && s.applicable));
  const itemReview = (item: A11yReviewItem): WireReview | undefined => reviews.find((r) => r.target.type === 'check' && r.target.item === item && reviewSpec && r.targetRef === `${reviewSpec.instance}#${item}`);
  let reviewing = $state<A11yReviewItem | null>(null);
  let reviewError = $state<string | null>(null);
  async function record(r: ReviewRecord): Promise<void> {
    const item = reviewing;
    reviewing = null;
    reviewError = null;
    if (!item || !review) return;
    if (r.decision !== 'accept' && r.decision !== 'reject') {
      reviewError = t('sectionui.design.review.itemsOnly');
      return;
    }
    const done = await attempt('review.record', { target: { type: 'check', id: review.exec.check.checkRunId, item }, decision: r.decision, note: r.note });
    if (done.ok) {
      await load();
      onchanged();
    }
  }
  /** «سجّل مراجعة» on a visual change: a decision on its finding (accept, reject, or a false alarm that excludes it). */
  let reviewingFinding = $state<Finding | null>(null);
  async function recordFinding(r: ReviewRecord): Promise<void> {
    const f = reviewingFinding;
    reviewingFinding = null;
    if (!f) return;
    const decision = r.decision === 'false-alarm' ? 'false_positive' : r.decision === 'reject' ? 'reject' : 'accept';
    const done = await attempt('review.record', { target: { type: 'finding', id: f.id }, decision, note: r.note });
    if (done.ok) {
      await load();
      onchanged();
    }
  }
  const scopeText = (r: WireReview) => (r.scope.files.length === 1 ? r.scope.files[0]! : t('sectionui.design.review.files', { count: r.scope.files.length }));
</script>

{#snippet value(text: string, mono = false)}<span class="val" class:mono><bdi dir="ltr">{text}</bdi></span>{/snippet}

{#if captures.length || uncaptured.length}
  <Panel title={t('sectionui.design.gallery', { count: captures.length + uncaptured.length })} testid="panel-gallery" note={t('sectionui.design.galleryNote', { shown: visible.length, total: captures.length + uncaptured.length })}>
    <div class="filters">
      <label class="filter"><span>{t('sectionui.design.state')}</span><Select bind:value={fState} options={option('sectionui.design.allStates', values((c) => c.key.state))} width={170} /></label>
      <label class="filter"><span>{t('sectionui.design.size')}</span><Select bind:value={fSize} options={option('sectionui.design.allSizes', values((c) => c.key.viewport))} width={150} /></label>
      <label class="filter"><span>{t('sectionui.design.theme')}</span><Select bind:value={fTheme} options={option('sectionui.design.allThemes', values((c) => c.key.theme))} width={150} /></label>
      <label class="filter"><span>{t('sectionui.design.lang')}</span><Select bind:value={fLang} options={option('sectionui.design.allLangs', values((c) => c.key.lang))} width={170} /></label>
    </div>
    <div class="tiles">
      {#each visible as c (c.id)}
        <div class="tile" class:selected={diffCapture?.id === c.id}><CaptureTile image={images[c.id]} tags={tags(c.key)} fullKey={keyText(c)} result={tileResult(c)} onclick={() => (selected = c.id)} /></div>
      {/each}
      {#each uncaptured as u (`${u.state}|${u.viewport}|${u.theme}|${u.lang}`)}
        <div class="tile"><CaptureTile sensitive tags={tags(u)} fullKey={[u.state, u.viewport, u.theme, u.lang].join(' · ')} result="skipped" /></div>
      {/each}
    </div>
    {#if shown.length > visible.length}<div class="more"><Button kind="quiet" onclick={() => (showAll = true)}>{t('sectionui.design.showAll', { count: shown.length })}</Button></div>{/if}
  </Panel>
{/if}

{#if diffCapture && diffCapture.baselineId}
  {@const f = visualFinding(diffCapture)}
  <Panel title={t('sectionui.design.diff', { key: tags(diffCapture.key).join(' · ') })} testid="panel-diff" note={diffCapture.diffRatio !== null ? t('sectionui.design.diffNote', { ratio: Math.round(diffCapture.diffRatio * 1000) / 10 }) : undefined}>
    {#snippet actions()}
      <Button kind="secondary" onclick={() => (approving = diffCapture)}>{t('sectionui.design.approveBaseline')}</Button>
      {#if f}<Button kind="secondary" onclick={() => (reviewingFinding = f)}>{t('ui.action.recordReview')}</Button>{/if}
    {/snippet}
    {#if images[diffCapture.id] && images[diffCapture.baselineId]}
      <ImageDiffViewer baseline={images[diffCapture.baselineId]!} current={images[diffCapture.id]!} captureKey={captureKey(diffCapture)} result={tileResult(diffCapture)} />
    {/if}
  </Panel>
{/if}

{#if designSpecs.some((s) => s.checkId === 'design.a11y' && s.applicable)}
  <Panel title={t('sectionui.design.a11y')} checkId="design.a11y" result={resultOf(a11y)} testid="panel-a11y" note={a11y ? (a11yRules.length ? undefined : t('sectionui.design.a11yNone')) : t('sectionui.panel.notRun')}>
    {#if a11yRules.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.security.rule')}</th><th scope="col">{t('sectionui.security.impact')}</th><th scope="col">{t('sectionui.security.severity')}</th><th scope="col">{t('sectionui.design.elements')}</th><th scope="col">{t('sectionui.design.pageState')}</th><th scope="col">{t('sectionui.design.snippet')}</th></tr></thead>
        <tbody>
          {#each a11yRules as r (r.rule)}
            <tr><td>{@render value(r.rule, true)}</td><td class="small"><bdi>{r.impact}</bdi></td><td><Severity severity={r.severity} /></td><td class="num">{r.count}</td><td class="small">{r.where}</td><td>{#if r.snippet}<span class="mono small"><bdi dir="ltr">{r.snippet}</bdi></span>{/if}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Panel>
{/if}

{#if rtl.length || first('design.rtl.render') || first('design.rtl.static')}
  <Panel title={t('sectionui.design.rtl', { count: rtl.length })} checkId={rtlCheck} result={rtlResult} testid="panel-rtl" note={rtl.length ? undefined : t('sectionui.design.rtlNone')}>
    {#each rtl as f (f.id)}
      <div class="rtl-row">
        <Icon name="triangle-alert" size={16} />
        <span class="strong-small"><bdi>{findingTitle(t, lang, f)}</bdi></span>
        <span class="spacer"></span>
        <span class="small muted">{[f.location?.page, f.location?.state].filter(Boolean).join(' · ')}</span>
        {#if f.location?.path}{@render value(f.location.path + (f.location.line ? `:${f.location.line}` : ''))}{/if}
      </div>
    {/each}
  </Panel>
{/if}

{#if reviewSpec}
  <Panel title={t('sectionui.design.review')} checkId="design.a11y.review" result={resultOf(review)} testid="panel-review" note={t('sectionui.design.reviewNote')}>
    {#each A11Y_REVIEW_ITEMS as item (item)}
      {@const r = itemReview(item)}
      <div class="review-row" data-item={item}>
        <div class="ref-body">
          <p class="strong">{t(`sectionui.design.item.${item}` as Parameters<typeof t>[0])}</p>
          <p class="small muted">{r ? t('sectionui.design.review.meta', { date: day(r.createdAt, lang), scope: scopeText(r) }) : t('sectionui.design.review.none')}</p>
        </div>
        <Tag>{r ? (r.valid ? (r.decision === 'accept' ? t('status.review.accepted') : t('sectionui.design.review.rejected')) : t('status.review.expired')) : t('status.review.notReviewed')}</Tag>
        <Button kind="secondary" disabled={!review} onclick={() => (reviewing = item)}>{r ? t('ui.action.openReview') : t('ui.action.recordReview')}</Button>
      </div>
    {/each}
    {#if reviewError}<p class="small" role="alert">{reviewError}</p>{/if}
    {#if !review}<p class="small muted">{t('sectionui.design.review.runFirst')}</p>{/if}
  </Panel>
{/if}

{#if approving}
  {@const c = approving}
  {#snippet capture()}{#if images[c.id]}<img class="capture" src={images[c.id]!.src} width={images[c.id]!.width} height={images[c.id]!.height} alt={keyText(c)} />{/if}{/snippet}
  <SheetBaselineApproval open {capture} captureKey={captureKey(c)} onapprove={() => void approve()} oncancel={() => (approving = null)} />
{/if}
{#if reviewingFinding}
  <SheetHumanReview open variant="check" subject={findingTitle(t, lang, reviewingFinding)} scope={reviewingFinding.location?.state ?? reviewingFinding.location?.path ?? undefined} oncancel={() => (reviewingFinding = null)} onrecord={(r: ReviewRecord) => void recordFinding(r)} oncopy={copyText} />
{/if}
{#if reviewing}
  <SheetHumanReview open variant="check" subject={t(`sectionui.design.item.${reviewing}` as Parameters<typeof t>[0])} scope={review?.exec.check.component === '.' ? t('sectionui.design.review.wholeProject') : review?.exec.check.component} oncancel={() => (reviewing = null)} onrecord={(r: ReviewRecord) => void record(r)} oncopy={copyText} />
{/if}

<style>
  .review-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-12);
    padding-block: var(--space-12);
    border-block-end: 1px solid var(--border-subtle);
  }
  .ref-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .ref-body p {
    margin: 0;
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
    color: var(--text-primary);
  }
  .muted {
    color: var(--text-secondary);
  }
  .mono {
    font: var(--type-mono);
  }
  .rtl-row :global(.val) {
    padding: 1px var(--space-8);
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-12);
  }
  .filter {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    font: var(--type-label);
    color: var(--text-primary);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: var(--space-12);
  }
  .tile.selected {
    outline: 2px solid var(--text-primary);
    outline-offset: 2px;
    border-radius: var(--radius-card);
  }
  .more {
    display: flex;
    justify-content: center;
  }
  .rtl-row {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding-block: var(--space-8);
    border-block-end: 1px solid var(--border-subtle);
    color: var(--text-primary);
  }
  .spacer {
    flex: 1;
  }
  .capture {
    display: block;
    max-inline-size: 100%;
    block-size: auto;
  }
</style>
