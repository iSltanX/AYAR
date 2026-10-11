<script lang="ts">
  // Screen 16 · فحوص النموذج (13.3, 12.9; Figma 16.1, missing input 16.2, rejected 16.3): three groups that never mix
  // (AT-44). 1. The needs: templates that apply to this project, each with the facts that made it apply, «ناقص: …»
  // with its field (nothing is generated on an assumption), «ولّد التعليمات», and the full instruction file to
  // read before «احفظ في المشروع…» or «انسخ للنموذج» (nothing runs). 2. The model's claims by check, with its state:
  // awaiting the report, matched partly, or refused with the field and line that refused it. 3. What a local check
  // proved: ordinary findings, the claim only their source. AYAR calls no model; a claim is never a result.
  import type { AiChecksView, AiInstruction, AiInstructionSummary, AiNeed, FindingDetail, ModelClaim, ReviewRecord as WireReview } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import CostTag from '../components/CostTag.svelte';
  import Icon from '../components/Icon.svelte';
  import InstructionsPreview from '../components/InstructionsPreview.svelte';
  import ModelCheckNeedCard from '../components/ModelCheckNeedCard.svelte';
  import ModelClaimRow from '../components/ModelClaimRow.svelte';
  import SheetHumanReview from '../components/SheetHumanReview.svelte';
  import Tag from '../components/Tag.svelte';
  import { useLocale } from '../lib/locale.ts';
  import type { ClaimDecision } from '../lib/results.ts';
  import type { ReviewRecord } from '../lib/sheets.ts';
  import { runSelection } from '../app/actions.ts';
  import { attempt, copyText } from '../app/client.ts';
  import { day, dayTime, reasonText } from '../app/format.ts';
  import { findingTitle } from '../app/results.ts';
  import { useApp } from '../app/state.svelte.ts';

  let { projectId }: { projectId: string } = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  let needs = $state<AiNeed[]>([]);
  let view = $state<AiChecksView | null>(null);
  let reviews = $state<WireReview[]>([]);
  let tasks = $state<{ displayId: string; follows: string | null }[]>([]);
  let proven = $state<Record<string, FindingDetail>>({});
  let previewId = $state<string | null>(null);
  let preview = $state<AiInstruction | null>(null);
  let values = $state<Record<string, string>>({});
  let busy = $state(false);

  async function load(): Promise<void> {
    // The model's result files are read as the page opens (FR-68): a refused one says why, nothing else changes.
    await attempt('aiChecks.importResults', { projectId });
    const [n, l, r, k] = await Promise.all([attempt('aiChecks.needs', { projectId }), attempt('aiChecks.list', { projectId }), attempt('reviews.list', { projectId }), attempt('tasks.list', { projectId })]);
    if (n.ok) {
      // A bound field needs its value before the card binds it (a bindable with a fallback refuses undefined).
      for (const x of n.result.needs) values[x.needId] ??= '';
      needs = n.result.needs;
    }
    if (l.ok) view = l.result;
    if (r.ok) reviews = r.result.reviews;
    if (k.ok) tasks = k.result.tasks.map((x) => ({ displayId: x.displayId, follows: x.follows }));
    const found = await Promise.all((l.ok ? l.result.proven : []).map((p) => attempt('finding.get', { findingId: p.findingId })));
    proven = Object.fromEntries(found.flatMap((f) => (f.ok ? [[f.result.finding.id, f.result]] : [])));
    if (!previewId && l.ok) previewId = l.result.instructions[0]?.aiCheckId ?? null;
  }
  $effect(() => {
    void load();
  });
  $effect(() => {
    const id = previewId;
    if (!id) return;
    void attempt('aiChecks.get', { aiCheckId: id }).then((r) => {
      if (r.ok && previewId === id) preview = r.result;
    });
  });

  // ── 1. needs and instructions ──────────────────────────────────────────────────────────────────────────────
  const applying = $derived(needs.filter((n) => n.applies));
  const others = $derived(needs.filter((n) => !n.applies));
  let othersOpen = $state(false);
  /** A list's separators in the interface language (the template carries no letters of its own, C-24). */
  const listSep = $derived(lang === 'ar' ? `${String.fromCharCode(0x60c)} ` : ', ');
  const reasonSep = $derived(lang === 'ar' ? `${String.fromCharCode(0x61b)} ` : '; ');
  const reasonOf = (n: AiNeed) => n.reasons.map((r) => reasonText(t, lang, r)).join(reasonSep);
  const missingOf = (n: AiNeed) => n.inputs.find((i) => n.missingInputs.includes(i.key));
  const anyMissing = $derived(applying.some((n) => n.missingInputs.length > 0));
  async function generate(n: AiNeed, value: string): Promise<void> {
    if (busy) return;
    busy = true;
    const missing = missingOf(n);
    if (missing && value.trim()) await attempt('aiChecks.provideInput', { needId: n.needId, key: missing.key, value: value.trim() });
    const g = await attempt('aiChecks.generate', { needId: n.needId, lang });
    busy = false;
    if (!g.ok) return;
    preview = g.result;
    previewId = g.result.aiCheckId;
    await load();
  }
  async function save(i: AiInstruction): Promise<void> {
    const name = i.suggestedPath.split('/').pop() ?? `${i.displayId}.md`;
    const dest = await attempt('dialog.pickDestination', { purpose: 'aiChecks.save', suggestedName: name });
    if (!dest.ok || 'cancelled' in dest.result) return;
    const s = await attempt('aiChecks.save', { aiCheckId: i.aiCheckId, destinationToken: dest.result.destinationToken });
    if (!s.ok) return;
    app.announce(t('modelui.saved', { path: s.result.path }));
    await load();
  }

  // ── 2. the model's claims, by check ────────────────────────────────────────────────────────────────────────
  const listed = $derived((view?.instructions ?? []).filter((i) => i.status !== 'generated'));
  const claimsOf = (i: AiInstructionSummary) => (view?.claims ?? []).filter((c) => c.aiCheckId === i.aiCheckId);
  const titleOf = (template: string) => {
    const n = needs.find((x) => x.template === template);
    return n ? t(n.titleKey as Parameters<typeof t>[0]) : template;
  };
  const statusText = (i: AiInstructionSummary) => {
    const all = claimsOf(i);
    const done = all.filter((c) => c.status === 'proven').length;
    return t(`modelui.status.${i.status}` as Parameters<typeof t>[0], { proven: done, total: all.length });
  };
  const STATUS_ICON = { awaiting_result: 'clock', rejected: 'ban', matched_partially: 'list-checks', matched: 'list-checks', result_received: 'file-text', generated: 'file-text', stale: 'triangle-alert' } as const;
  const reviewById = $derived(new Map(reviews.map((r) => [r.id, r])));
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
  let reviewing = $state<ModelClaim | null>(null);
  async function decide(r: ReviewRecord): Promise<void> {
    const c = reviewing;
    reviewing = null;
    if (!c) return;
    await attempt('review.record', { target: { type: 'modelClaim', id: c.id }, decision: r.decision === 'convert-to-card' ? 'card' : 'not_issue', note: r.note });
    await load();
  }
  async function prove(c: ModelClaim): Promise<void> {
    if (!c.matchedCheckId) return;
    const p = await attempt('profile.get', { projectId });
    const spec = p.ok ? p.result.checks.find((s) => s.checkId === c.matchedCheckId && s.applicable) : undefined;
    if (spec) await runSelection(app, projectId, { kind: 'check', instance: spec.instance });
  }
  /** «مرفوض» opens on the one refused last; the others say why in a line. */
  let openRejected = $state<string | null>(null);
  $effect(() => {
    if (openRejected) return;
    const last = [...listed].filter((i) => i.status === 'rejected' && i.importedAt).sort((a, b) => (b.importedAt ?? '').localeCompare(a.importedAt ?? ''))[0];
    if (last) openRejected = last.aiCheckId;
  });
  /** Why a result file was refused, as a cause after «السبب:» (the reason's own wording starts with «مرفوض»). */
  const REJECTS = ['tooLarge', 'malformed', 'tooDeep', 'claimsPass', 'schema', 'unknownCheck', 'templateMismatch'] as const;
  const rejectText = (i: AiInstructionSummary) => {
    const kind = REJECTS.find((k) => i.rejectReason?.key === `aichecks.rejected.${k}`);
    return kind ? t(`modelui.reject.${kind}`, i.rejectReason?.params ?? {}) : reasonText(t, lang, i.rejectReason);
  };
  function openInstructions(i: AiInstructionSummary): void {
    previewId = i.aiCheckId;
    document.getElementById('model-preview')?.scrollIntoView({ block: 'start' });
  }
</script>

<div class="page" data-testid="model-checks">
  <header class="header">
    <div class="title-row">
      <h1 class="title">{t('modelui.title')}</h1>
      <span class="spacer"></span>
      <CostTag cost="model" />
    </div>
    <p class="intro">{t('modelui.intro')}</p>
    <p class="small muted">{t('modelui.outside')}</p>
  </header>

  <section class="card" aria-labelledby="needs-title" data-testid="model-needs">
    <div class="card-head">
      <span class="step" aria-hidden="true">1</span>
      <h2 class="card-title" id="needs-title">{t('modelui.needs')}</h2>
      <span class="spacer"></span>
      <span class="small muted">{t('modelui.needsNote')}</span>
    </div>
    {#if applying.length}
      <div class="needs">
        {#each applying as n (n.needId)}
          {@const missing = missingOf(n)}
          <ModelCheckNeedCard template={t(n.titleKey as Parameters<typeof t>[0])} templateId={`AI-${n.code}`} reason={reasonOf(n)} missing={missing ? { what: t(missing.labelKey as Parameters<typeof t>[0]), placeholder: t('modelui.describe', { what: t(missing.labelKey as Parameters<typeof t>[0]) }) } : undefined} bind:value={values[n.needId]} ongenerate={(v: string) => void generate(n, v)} />
        {/each}
      </div>
    {:else}
      <p class="small muted">{t('modelui.needsNone')}</p>
    {/if}
    {#if anyMissing}<p class="small muted">{t('modelui.noAssumption')}</p>{/if}
    {#if preview}
      <div class="preview-head" id="model-preview">
        <span class="strong-small">{t('modelui.instructionsFile')}</span>
        <span class="val"><bdi dir="ltr">{preview.displayId}</bdi></span>
        <span class="small muted">{t('modelui.previewNote')}</span>
      </div>
      {@const shown = preview}
      <InstructionsPreview text={shown.text} path={shown.suggestedPath} oncopy={() => void attempt('clipboard.copy', { kind: 'instructions', id: shown.aiCheckId })} onsave={() => void save(shown)} onpathcopy={copyText} />
    {/if}
    {#if others.length}
      <div class="folded">
        <button class="fold" type="button" aria-expanded={othersOpen} onclick={() => (othersOpen = !othersOpen)}>
          <Icon name={othersOpen ? 'chevron-up' : 'chevron-down'} size={16} />
          <span class="strong-small">{t('modelui.notApplicable', { count: others.length })}</span>
          <span class="small muted">{t('modelui.notApplicableNote', { names: others.map((n) => t(n.titleKey as Parameters<typeof t>[0])).join(listSep) })}</span>
        </button>
        {#if othersOpen}
          <ul class="na">
            {#each others as n (n.needId)}
              <li><span class="strong-small">{t(n.titleKey as Parameters<typeof t>[0])}</span><span class="small muted">{reasonText(t, lang, n.notApplicableReason)}</span></li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>

  <section class="card" aria-labelledby="claims-title" data-testid="model-claims">
    <div class="card-head">
      <span class="step" aria-hidden="true">2</span>
      <h2 class="card-title" id="claims-title">{t('modelui.claims')}</h2>
      <span class="spacer"></span>
      <span class="small muted">{t('modelui.claimsNote')}</span>
    </div>
    {#each listed as i (i.aiCheckId)}
      {@const claims = claimsOf(i)}
      {@const open = claims.filter((c) => c.status !== 'proven')}
      <div class="check" data-status={i.status}>
        <div class="check-head">
          <span class="val"><bdi dir="ltr">{i.displayId}</bdi></span>
          <span class="strong">{titleOf(i.template)}</span>
          <span class="spacer"></span>
          <Tag icon={STATUS_ICON[i.status]}>{statusText(i)}</Tag>
        </div>
        {#if i.status === 'rejected'}
          {#if openRejected === i.aiCheckId}
            <div class="rejected">
              <p class="small muted"><span>{t('modelui.rejected.file')}</span> <span class="val"><bdi dir="ltr">{i.resultPath}</bdi></span>{#if i.importedAt} · {t('modelui.rejected.arrived', { date: dayTime(i.importedAt, lang) })}{/if}</p>
              <p class="strong">{t('modelui.rejected.reason', { reason: rejectText(i) })}</p>
              {#if i.rejectReason?.params?.snippet}
                <p class="small muted">{t('modelui.rejected.field')} <span class="val"><bdi dir="ltr">{String(i.rejectReason.params.snippet)}</bdi></span>{#if i.rejectReason.params.line} · {t('modelui.rejected.line', { line: Number(i.rejectReason.params.line) })}{/if}</p>
              {/if}
              <p class="small">{t('modelui.rejected.explain')}</p>
              <div class="row-end">
                <Button kind="secondary" onclick={() => void attempt('project.reveal', { projectId, path: i.resultPath })}>{t('ui.action.showInFinder')}</Button>
                <Button kind="secondary" onclick={() => openInstructions(i)}>{t('modelui.openInstructions')}</Button>
              </div>
            </div>
          {:else}
            <button class="line-button small" type="button" onclick={() => (openRejected = i.aiCheckId)}>{t('modelui.rejectedLine', { reason: rejectText(i) })}</button>
          {/if}
        {:else if i.status === 'awaiting_result'}
          <p class="small muted">{t('modelui.awaiting')}</p>
        {:else if claims.length}
          {#if i.importedAt}<p class="small muted">{t('modelui.arrived', { date: dayTime(i.importedAt, lang) })} <span class="val"><bdi dir="ltr">{i.resultPath}</bdi></span></p>{/if}
          <p class="small">{t('modelui.progress', { proven: claims.length - open.length, left: open.length })}</p>
          {#each open as c (c.id)}
            <ModelClaimRow note={c.summary} claimId={c.displayId} location={{ path: c.location?.path ?? '', ...(c.location?.line ? { line: c.location.line } : {}) }} localCheck={c.matchedCheckId ?? undefined} decision={decisionOf(c)} onprove={() => void prove(c)} onreview={() => (reviewing = c)} />
          {/each}
        {/if}
      </div>
    {:else}
      <p class="small muted">{t('modelui.claimsNone')}</p>
    {/each}
  </section>

  <section class="card" aria-labelledby="proven-title" data-testid="model-proven">
    <div class="card-head">
      <span class="step" aria-hidden="true">3</span>
      <h2 class="card-title" id="proven-title">{t('modelui.proven')}</h2>
      <span class="spacer"></span>
      <span class="small muted">{t('modelui.provenNote')}</span>
    </div>
    {#each view?.proven ?? [] as p (p.findingId)}
      {@const d = proven[p.findingId]}
      <div class="proven">
        <Icon name="check" size={16} />
        <div class="proven-body">
          <p class="row"><span class="val"><bdi dir="ltr">{p.findingDisplayId}</bdi></span><span class="strong">{d ? findingTitle(t, lang, d.finding) : p.checkId}</span></p>
          <p class="row small muted">{t('modelui.provenSource')} <span class="val"><bdi dir="ltr">{p.claimDisplayId}</bdi></span> · {t('modelui.provenBy')} <span class="val"><bdi dir="ltr">{p.checkId}</bdi></span></p>
        </div>
        <span class="spacer"></span>
        {#if d}<Button kind="secondary" onclick={() => app.navigate({ name: 'scan', projectId, runId: d.finding.runId })}>{t('modelui.openFinding')}</Button>{/if}
      </div>
    {:else}
      <p class="small muted">{t('modelui.provenNone')}</p>
    {/each}
  </section>
</div>

{#if reviewing}
  <SheetHumanReview open variant="model-claim" claim={{ id: reviewing.displayId, text: reviewing.summary }} oncancel={() => (reviewing = null)} onrecord={(r: ReviewRecord) => void decide(r)} oncopy={copyText} />
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
    gap: var(--space-8);
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .title {
    margin: 0;
    font: var(--type-title-page);
    color: var(--text-primary);
  }
  .intro {
    margin: 0;
    font: var(--type-body);
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
  .step {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 24px;
    block-size: 24px;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    font: var(--type-label);
    color: var(--text-primary);
  }
  .needs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    gap: var(--space-16);
  }
  .preview-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .folded {
    border-radius: var(--radius-card);
    background: var(--bg-sunken);
  }
  .fold {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    inline-size: 100%;
    padding: var(--space-12) var(--space-16);
    border: 0;
    background: none;
    color: var(--text-primary);
    text-align: start;
    cursor: pointer;
  }
  .fold:focus-visible,
  .line-button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .na {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    margin: 0;
    padding: 0 var(--space-16) var(--space-12);
    list-style: none;
  }
  .na li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .check {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding-block: var(--space-12);
    border-block-end: 1px solid var(--border-subtle);
  }
  .check-head,
  .row,
  .row-end {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
  }
  .row-end {
    justify-content: flex-end;
  }
  .check p,
  .rejected p,
  .proven-body p {
    margin: 0;
  }
  .rejected {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding: var(--space-12) var(--space-16);
    border-radius: var(--radius-card);
    background: var(--bg-sunken);
  }
  .line-button {
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-secondary);
    text-align: start;
    cursor: pointer;
  }
  .proven {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding-block: var(--space-8);
    color: var(--text-primary);
  }
  .proven-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .spacer {
    flex: 1;
  }
  .strong {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .strong-small {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .small {
    font: var(--type-body-small);
    color: var(--text-primary);
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
