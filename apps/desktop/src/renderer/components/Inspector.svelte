<script lang="ts">
  // Inspector (Figma 111:7922, C-16; plan 9.16, D-DES3-14): the collapsible side panel (380, ⌥⌘I; the toggle
  // lives in the title bar) showing what is selected in the content without leaving the page. bg/surface, a
  // 1 px border/subtle divider on the content side (inline start: it sits at the inline end of the window),
  // padding 16, gap 16. Content (a discriminated union):
  // - check: header (name, last result badge; id + copy) · Tabs «التفاصيل | السجل» · Details: definition, why,
  //   limits, command, readiness, last result; with a review («بمراجعة»): the review with its decision, scope,
  //   date, the original automatic result and «افتح المراجعة». Log: the Log viewer.
  // - finding: the ONE «Copy for model» bar on top (Context=inspector, Tabs off) with its note, counters and
  //   «وأنشئ بطاقة تحقق» · header (title; id + copy; severity, proof, origin) · Next step card (a needs-model
  //   step shows «انسخه بالزر أعلاه», never «حدّد للنسخ») · «لك | للنموذج» for this finding only · Evidence
  //   (location + «افتح في المحرر», expected, actual, excerpt with redactions, reproduce command, rule and
  //   source, limits, first seen) · actions «أنشئ بطاقة» · «سجّل مراجعة» (hidden when the next step is «راجع
  //   وقرّر»: both open the same sheet) · «أعد فحص هذا».
  // - log: «سطر السجل N · <check>» and the Log viewer.
  // Presentational: every action is a callback.
  import type { Snippet } from 'svelte';
  import { logPieces, codePointLabel } from '../lib/evidence.ts';
  import type { InspectorContent, InspectorTab } from '../lib/inspector.ts';
  import { useLocale } from '../lib/locale.ts';
  import type { Location, ReportView } from '../lib/results.ts';
  import { ORIGINS, PROOF_TAGS } from '../lib/tags.ts';
  import Button from './Button.svelte';
  import CommandBlock from './CommandBlock.svelte';
  import CopyForModelBar from './CopyForModelBar.svelte';
  import IconButton from './IconButton.svelte';
  import LogViewer from './LogViewer.svelte';
  import LtrText from './LtrText.svelte';
  import NextStepCard from './NextStepCard.svelte';
  import PathPill from './PathPill.svelte';
  import ReadinessBadge from './ReadinessBadge.svelte';
  import ResultBadge from './ResultBadge.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import Severity from './Severity.svelte';
  import Tabs from './Tabs.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    content: InspectorContent;
    /** Collapsed when false (the title bar's inspector toggle switches it). */
    open?: boolean;
    /** The element id, for the title bar toggle's aria-controls. */
    id?: string;
    /** Check: the selected tab. */
    tab?: InspectorTab;
    /** Finding: «لك» (the evidence) or «للنموذج» (`formodel`). Switching never changes what is copied. */
    view?: ReportView;
    /** Finding: also create a verification card when copying. */
    createCard?: boolean;
    /** Finding: the «For the model» preview of this finding (shown while view is for-model). */
    formodel?: Snippet;
    ontabchange?: (tab: InspectorTab) => void;
    onviewchange?: (view: ReportView) => void;
    oncreatecardchange?: (createCard: boolean) => void;
    /** Receives the id when its copy button is used (the caller writes the clipboard). */
    oncopyid?: (id: string) => void;
    oncopycommand?: (command: string) => void;
    oncopypath?: (path: string) => void;
    oncopy?: () => void;
    onnextstep?: () => void;
    onopenineditor?: (location: Location) => void;
    oncreatecard?: () => void;
    onrecordreview?: () => void;
    onrecheck?: () => void;
    onopenreview?: () => void;
  }
  let {
    content,
    open = true,
    id,
    tab = $bindable('details'),
    view = $bindable('for-you'),
    createCard = $bindable(false),
    formodel,
    ontabchange,
    onviewchange,
    oncreatecardchange,
    oncopyid,
    oncopycommand,
    oncopypath,
    oncopy,
    onnextstep,
    onopenineditor,
    oncreatecard,
    onrecordreview,
    onrecheck,
    onopenreview,
  }: Props = $props();
  const { t, dir } = useLocale();
  const uid = $props.id();
  const tabId = (v: string) => `${uid}-tab-${v}`;
  const panelId = (v: string) => `${uid}-panel-${v}`;
  const viewOptions = $derived([
    { value: 'for-you' as const, label: t('ui.tab.forYou') },
    { value: 'for-model' as const, label: t('ui.tab.forModel') },
  ]);
</script>

{#snippet idRow(value: string)}
  <div class="id-row">
    <span class="id"><LtrText text={value} mono /></span>
    <IconButton icon="copy" label={t('controls.menu.copyId')} onclick={() => oncopyid?.(value)} />
  </div>
{/snippet}

{#snippet kv(key: string, value: string, mono = false)}
  <dl class="kv">
    <dt class="key">{key}</dt>
    <dd class="value" class:mono>{#if mono}<LtrText text={value} mono />{:else}{value}{/if}</dd>
  </dl>
{/snippet}

{#if open}
  <aside class="inspector" {id} aria-label={t('results.inspector.label')} data-content={content.kind}>
    {#if content.kind === 'check'}
      {@const c = content}
      <header class="header">
        <div class="title-row">
          <h2 class="title">{c.name}</h2>
          {#if c.result}<ResultBadge result={c.result} />{/if}
        </div>
        {@render idRow(c.id)}
      </header>
      <Tabs bind:value={tab} kind="inspector" label={t('results.inspector.tabs')} {panelId} {tabId} onchange={(v) => ontabchange?.(v as InspectorTab)} />
      {#if tab === 'log'}
        <div class="panel" role="tabpanel" id={panelId('log')} aria-labelledby={tabId('log')}>
          {#if c.log}
            <LogViewer lines={c.log.lines} totalLines={c.log.totalLines} truncatedAtMb={c.log.truncatedAtMb} follow={false} />
          {/if}
        </div>
      {:else}
        <div class="panel" role="tabpanel" id={panelId('details')} aria-labelledby={tabId('details')}>
          {@render kv(t('results.inspector.definition'), c.definition)}
          {@render kv(t('results.inspector.why'), c.why)}
          {@render kv(t('results.inspector.limits'), c.limits)}
          {#if c.command}
            <section class="section">
              <h3 class="section-title">{t('results.inspector.command')}</h3>
              <CommandBlock {...c.command} oncopy={oncopycommand} />
            </section>
          {/if}
          <section class="section">
            <h3 class="section-title">{t('glossary.readiness')}</h3>
            <span class="badge"><ReadinessBadge readiness={c.readiness} /></span>
          </section>
          {#if c.result}
            <section class="section">
              <h3 class="section-title">{t('results.inspector.lastResult')}</h3>
              <div class="last-result">
                <ResultBadge result={c.result} size="sm" />
                {#if c.runId}<span class="run-id"><LtrText text={c.runId} mono /></span>{/if}
              </div>
            </section>
          {/if}
          {#if c.review}
            {@const r = c.review}
            <section class="section">
              <h3 class="section-title">{t('results.inspector.review')}</h3>
              <div class="review">
                {@render kv(t('sheets.review.decision'), t(`sheets.review.${r.decision}`))}
                {@render kv(t('status.purity.scope'), r.scope, true)}
                <dl class="kv">
                  <dt class="key">{t('results.inspector.date')}</dt>
                  <dd class="value"><LtrText text={r.date} /></dd>
                </dl>
                <p class="original">
                  <span class="key">{t('results.inspector.originalResult')}</span>
                  <ResultBadge result={r.original} size="sm" />
                </p>
                <span class="badge"><Button kind="quiet" onclick={() => onopenreview?.()}>{t('ui.action.openReview')}</Button></span>
              </div>
            </section>
          {/if}
        </div>
      {/if}
    {:else if content.kind === 'finding'}
      {@const f = content}
      <CopyForModelBar
        context="inspector"
        tabs={false}
        characters={f.copy.characters}
        redactions={f.copy.redactions}
        redactedKinds={f.copy.redactedKinds}
        bind:createCard
        {oncopy}
        {oncreatecardchange}
      />
      <header class="header">
        <h2 class="title">{f.title}</h2>
        {@render idRow(f.id)}
        <div class="tags">
          <Severity severity={f.severity} />
          <Tag kind={PROOF_TAGS[f.proof].kind}>{t(PROOF_TAGS[f.proof].key)}</Tag>
          <Tag>{t('status.tag.origin', { origin: t(ORIGINS[f.origin]) })}</Tag>
        </div>
      </header>
      <NextStepCard
        kind={f.nextStep.kind === 'needs-model' ? 'needs-model-inspector' : f.nextStep.kind}
        impact={f.nextStep.impact}
        action={f.nextStep.action}
        reason={f.nextStep.reason}
        onaction={onnextstep}
      />
      <SegmentedControl bind:value={view} options={viewOptions} label={t('results.copyBar.view')} onchange={(v: ReportView) => onviewchange?.(v)} />
      {#if view === 'for-model'}
        {#if formodel}<div class="for-model">{@render formodel()}</div>{/if}
      {:else}
        <section class="section">
          <h3 class="section-title">{t('glossary.evidence')}</h3>
          {#if f.location.path}
            <div class="location">
              <PathPill path={f.location.path} line={f.location.line} oncopy={oncopypath} />
              <Button kind="quiet" icon="external-link" onclick={() => onopenineditor?.(f.location)}>{t('ui.action.openInEditor')}</Button>
            </div>
          {/if}
          {@render kv(t('results.inspector.expected'), f.expected)}
          {@render kv(t('results.inspector.actual'), f.actual)}
          {#if f.excerpt}
            <div class="excerpt" dir="ltr">
              {#each logPieces(f.excerpt, '') as piece, i (i)}
                {#if piece.kind === 'redacted'}
                  <span class="redaction" {dir}><Tag>{t('results.log.redacted', { what: piece.what })}</Tag></span>
                {:else if piece.kind === 'control'}
                  <span class="control" title={piece.name}>⟦{codePointLabel(piece.codePoint)}⟧</span>
                {:else}
                  <code class="code">{piece.parts.map((p) => p.text).join('')}</code>
                {/if}
              {/each}
            </div>
          {/if}
          {#if f.reproduce}
            <p class="key">{t('results.inspector.reproduce')}</p>
            <CommandBlock {...f.reproduce} oncopy={oncopycommand} />
          {/if}
          {@render kv(t('results.inspector.rule'), f.rule)}
          {@render kv(t('ui.report.limits'), f.limits)}
          {@render kv(t('results.inspector.firstSeen'), f.firstSeen, true)}
        </section>
      {/if}
      <div class="actions" role="group" aria-label={t('results.inspector.actions')}>
        <Button kind="secondary" onclick={() => oncreatecard?.()}>{t('ui.action.createCard')}</Button>
        {#if f.nextStep.kind !== 'needs-review'}
          <Button kind="secondary" onclick={() => onrecordreview?.()}>{t('ui.action.recordReview')}</Button>
        {/if}
        <Button kind="quiet" onclick={() => onrecheck?.()}>{t('ui.action.recheckThis')}</Button>
      </div>
    {:else}
      {@const l = content}
      <h2 class="title log-title">{t('results.inspector.logTitle', { line: l.line, check: l.check })}</h2>
      <LogViewer lines={l.lines} totalLines={l.totalLines} truncatedAtMb={l.truncatedAtMb} follow={false} />
    {/if}
  </aside>
{/if}

<style>
  .inspector {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--space-16);
    inline-size: 380px;
    /* A classic (always shown) scrollbar takes its width from the slot: shrink rather than scroll sideways. */
    max-inline-size: 100%;
    min-block-size: 100%;
    padding: var(--space-16);
    border-inline-start: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    overflow: hidden;
  }
  h2,
  h3,
  p,
  dl,
  dd {
    margin: 0;
  }
  .header {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    min-height: 24px;
  }
  .title {
    min-width: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .id-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .id,
  .run-id {
    display: inline-flex;
    font: var(--type-mono);
    color: var(--text-secondary);
  }
  .tags {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    min-height: 20px;
  }
  .panel,
  .section,
  .review {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .panel {
    gap: var(--space-16);
  }
  .section,
  .review {
    gap: var(--space-8);
  }
  .review {
    padding: var(--space-12);
    border-radius: var(--radius-card);
    background: var(--bg-sunken);
  }
  .kv {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .key {
    font: var(--type-body-small);
    color: var(--text-tertiary);
  }
  .value {
    font: var(--type-body);
    color: var(--text-primary);
  }
  .value.mono {
    font: var(--type-mono);
  }
  .section-title {
    font: var(--type-label);
    color: var(--text-secondary);
  }
  .badge {
    display: flex;
  }
  .last-result,
  .original {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .location,
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .excerpt {
    display: flex;
    align-items: center;
    min-height: 36px;
    padding: var(--space-8) var(--space-12);
    border-radius: var(--radius-control);
    background: var(--bg-sunken);
    overflow: hidden;
  }
  .code {
    font: var(--type-mono);
    color: var(--text-primary);
    white-space: pre;
  }
  .redaction {
    display: inline-flex;
    unicode-bidi: isolate;
  }
  .control {
    display: inline-flex;
    align-items: center;
    padding-inline: var(--space-4);
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    font: var(--type-mono);
    color: var(--text-primary);
  }
  .log-title {
    min-height: 24px;
  }
</style>
