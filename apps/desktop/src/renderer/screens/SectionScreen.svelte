<script lang="ts">
  // Screen 9 · صفحة القسم (13.3; Figma 9.1 178:15746, and the special sections 10–14): the header (the section's name
  // and its question, the last run that touched it, its partial karat with its scope — or why it has none —,
  // «شغّل القسم» and «شغّل المحدد»), the section's own panels, then its checks in the full scan (checkbox, name,
  // readiness apart from any result, the latest result with its date, the findings, «شغّل», the inspector), the
  // selection bar (C-22), the optional ones not included with what each lacks, and those that do not apply with why.
  // A check that does not apply is never selected (13.3); its reason is in its row and the inspector.
  import type { CheckSpec } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import Checkbox from '../components/Checkbox.svelte';
  import CostTag from '../components/CostTag.svelte';
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Inspector from '../components/Inspector.svelte';
  import LtrText from '../components/LtrText.svelte';
  import ReadinessBadge from '../components/ReadinessBadge.svelte';
  import ResultBadge from '../components/ResultBadge.svelte';
  import SectionKarat from '../components/SectionKarat.svelte';
  import SelectionBar from '../components/SelectionBar.svelte';
  import SheetSaveGroup from '../components/SheetSaveGroup.svelte';
  import TableHeaderCell from '../components/TableHeaderCell.svelte';
  import type { InspectorCheck, InspectorTab } from '../lib/inspector.ts';
  import { useLocale } from '../lib/locale.ts';
  import { attempt, copyText } from '../app/client.ts';
  import { runSelection } from '../app/actions.ts';
  import { badgeOf, checkTexts, checkTitle, costOf, countsInOrder, dayMonth, dayTime, readinessOf, reasonText, runKind } from '../app/format.ts';
  import { logLines } from '../app/logs.ts';
  import { findingsCount, karatOf, latestCounts, loadSection, optionalAction, readinessOfInstance, type SectionModel } from '../app/sections.ts';
  import { commandOf, reasonsOf } from '../app/specs.ts';
  import { useApp, type SectionId } from '../app/state.svelte.ts';
  import BehaviorPanels from './section/BehaviorPanels.svelte';
  import CodePanels from './section/CodePanels.svelte';
  import DesignPanels from './section/DesignPanels.svelte';
  import DesignReference from './section/DesignReference.svelte';
  import IntegrityPanels from './section/IntegrityPanels.svelte';
  import CustomChecks from './section/CustomChecks.svelte';
  import PerformancePanels from './section/PerformancePanels.svelte';
  import SecurityPanels from './section/SecurityPanels.svelte';

  let { projectId, section }: { projectId: string; section: SectionId } = $props();
  const app = useApp();
  const { t, lang, dir } = useLocale();

  let model = $state<SectionModel | null>(null);
  let selected = $state<string[]>([]);
  let inspected = $state<string | null>(null);
  let inspectorTab = $state<InspectorTab>('details');
  let listOpen = $state(true);
  let optionalOpen = $state(true);
  let notApplicableOpen = $state(false);
  let savingGroup = $state(false);
  let starting = $state(false);
  /** 15: no karat on the integrity page; the open items that keep the verdict from «نقي» instead. */
  let integrityBlockers = $state<number | null>(null);
  /** 10.2: the reference board, folded once nothing is missing, opened by the header's «المرجع». */
  let showReference = $state(false);

  /** The sections with panels of their own (screens 10–14): their list is folded once a check ran (D-DES5-05). */
  const PANELS: readonly SectionId[] = ['design', 'security', 'code', 'behavior', 'performance'];
  let folded = false;
  async function load(): Promise<void> {
    model = await loadSection(projectId, section);
    // Folded once, on the first reading: security keeps its list open, as its approved screen shows (11.1), and so
    // does design while a reference is missing (10.1: the board leads, the list follows it open).
    if (!folded && model && PANELS.includes(section) && section !== 'security' && !(section === 'design' && referenceMissing(model)) && model.latest.size > 0) listOpen = false;
    folded = true;
  }
  /** 10.1: a design reference is missing (a configuration a design check lacks); the board then leads the page. */
  const referenceMissing = (m: SectionModel) => m.profile.checks.some((s) => s.section === 'design' && s.applicable && s.missing.some((x) => x.kind === 'configuration'));
  const designRefMissing = $derived(section === 'design' && !!model && referenceMissing(model));
  /** «عرّف…»: the profile's references (screen 19 «المراجع»). */
  const define = (_ref: string) => app.navigate({ name: 'profile', projectId });
  $effect(() => {
    void load();
  });

  const karat = $derived(model ? karatOf(model, section) : null);
  const included = $derived(model?.included ?? []);
  const counts = $derived(model ? countsInOrder(latestCounts(model, included)) : []);
  const anyRequired = $derived(included.some((s) => s.required));
  const showCost = $derived(included.some((s) => s.cost !== 'local'));
  const lastRun = $derived(model?.lastRun ?? null);

  const lastRunLine = $derived.by(() => {
    if (!lastRun?.startedAt) return t('sectionui.lastRun.never');
    const kind = runKind(t, lastRun, app.runs.plans[lastRun.runId]);
    return t('sectionui.lastRun.at', { date: dayTime(lastRun.startedAt, lang), kind });
  });

  function toggle(instance: string, on: boolean): void {
    selected = on ? [...new Set([...selected, instance])] : selected.filter((x) => x !== instance);
  }

  async function run(selection: Parameters<typeof runSelection>[2]): Promise<void> {
    if (starting) return;
    starting = true;
    await runSelection(app, projectId, selection);
    starting = false;
  }
  const runOne = (instance: string) => run({ kind: 'check', instance });
  const runSelected = () => run(selected.length === 1 ? { kind: 'check', instance: selected[0]! } : { kind: 'group', instances: [...selected] });

  // The Run menu (C-23) runs this section and this selection through the page that holds them.
  $effect(() => {
    app.runContext = { section, selected: selected.length, runSection: () => void run({ kind: 'section', section }), runSelected: () => void (selected.length ? runSelected() : undefined) };
    return () => {
      app.runContext = null;
    };
  });

  async function saveGroup(name: string): Promise<void> {
    savingGroup = false;
    const r = await attempt('groups.save', { projectId, name, instanceKeys: [...selected] });
    if (r.ok) selected = [];
  }

  async function act(spec: CheckSpec): Promise<void> {
    if (!model) return;
    const a = optionalAction(model, spec);
    if (a.kind === 'approve') app.navigate({ name: 'profile', projectId });
    else if (a.kind === 'define') app.navigate({ name: 'profile', projectId });
    else if (a.kind === 'include') {
      const r = await attempt('profile.update', { projectId, patch: { checks: { [spec.instance]: { included: true } } } });
      if (r.ok) await load();
    }
  }

  // ── the inspector: the inspected check's spec, its latest execution and its log ──────────────────────────
  let checkLog = $state<{ lines: ReturnType<typeof logLines>; totalLines: number } | null>(null);
  $effect(() => {
    const spec = inspected;
    const exec = spec ? model?.latest.get(spec) : undefined;
    checkLog = null;
    if (!exec) return;
    void attempt('check.tail', { checkRunId: exec.check.checkRunId, maxLines: 200 }).then((r) => {
      if (r.ok && inspected === spec) checkLog = { lines: logLines(t, lang, r.result.lines, r.result.totalLines), totalLines: r.result.totalLines };
    });
  });

  const content = $derived.by<InspectorCheck | null>(() => {
    if (!model || !inspected) return null;
    const spec = model.profile.checks.find((s) => s.instance === inspected);
    if (!spec) return null;
    const exec = model.latest.get(spec.instance);
    const command = commandOf(spec);
    return {
      kind: 'check',
      name: checkTitle(t, lang, spec.checkId),
      id: spec.checkId,
      ...(exec?.check.outcome ? { result: badgeOf(exec.check.outcome, { reviewed: !!exec.check.reviewId, reason: exec.check.outcomeReason }), runId: exec.run.displayId } : {}),
      ...checkTexts(t, lang, spec.checkId),
      why: reasonsOf(t, lang, spec.reasons).text,
      ...(command ? { command: { command, runsCode: spec.sideEffects.runsProjectCode, writes: spec.sideEffects.writesRepo === 'maybe', network: spec.network === 'required' } } : {}),
      readiness: readinessOf(readinessOfInstance(model, spec)),
      ...(checkLog ? { log: checkLog } : {}),
    };
  });

  $effect(() => {
    app.inspector = content ? inspectorSnippet : null;
    if (content) app.inspectorOpen = true;
    return () => (app.inspector = null);
  });

  const refLabel = (ref: string) => t(`sectionui.ref.${ref}` as Parameters<typeof t>[0]);
</script>

{#snippet inspectorSnippet()}
  {#if content}
    <Inspector id="ayar-inspector" {content} tab={inspectorTab} ontabchange={(tab: InspectorTab) => (inspectorTab = tab)} oncopyid={copyText} oncopycommand={copyText} />
  {/if}
{/snippet}

{#snippet checkName(spec: CheckSpec)}
  <span class="check">
    <span class="name">{checkTitle(t, lang, spec.checkId)}</span>
    <bdi class="id" dir="ltr">{spec.checkId}{spec.component !== '.' ? `@${spec.component}` : ''}</bdi>
  </span>
{/snippet}

{#if model}
  <div class="page" data-testid="section" data-section={section}>
    <header class="header">
      <h1 class="title">{t(`ui.section.${section}`)}</h1>
      <p class="question">{t(`sectionui.question.${section}`)}</p>
      <p class="meta">
        <span>{lastRunLine}</span>
        {#if lastRun}<span class="pill"><LtrText text={lastRun.displayId} mono /></span>{/if}
        {#if lastRun?.purity?.roundDisplayId}<span class="pill"><LtrText text={lastRun.purity.roundDisplayId} mono /></span>{/if}
      </p>
      <div class="header-row">
        {#if section === 'integrity'}
          <p class="blockers" data-testid="integrity-blockers"><Icon name="scale" size={16} />{integrityBlockers ? t('sectionui.integrity.blocking', { count: integrityBlockers }) : t('sectionui.integrity.noBlocking')}</p>
        {:else if karat && karat.criteria > 0}
          <SectionKarat value={karat.karat} criteria={karat.criteria} />
        {:else}
          <p class="no-karat">{t('sectionui.noCriteria')}</p>
        {/if}
        <span class="spacer"></span>
        {#if section === 'design' && !designRefMissing}<Button kind="quiet" icon="sliders-horizontal" aria-pressed={showReference} onclick={() => (showReference = !showReference)}>{t('sectionui.design.refToggle')}</Button>{/if}
        {#if section !== 'integrity'}<Button kind="secondary" icon="play" disabled={!selected.length || starting} onclick={() => void runSelected()}>{selected.length ? t('shell.selectionBar.runSelected', { count: selected.length }) : t('ui.action.runSelected')}</Button>{/if}
        <Button kind="primary" icon="play" disabled={!included.length || starting} onclick={() => void run({ kind: 'section', section })}>{t('ui.action.runSection')}</Button>
      </div>
      {#if section === 'integrity'}<p class="no-karat">{t('sectionui.integrity.noKarat')}</p>{/if}
    </header>

    {#if designRefMissing}<DesignReference {projectId} {model} ondefine={define} onchanged={() => void load()} />{/if}

    {#if section === 'integrity'}
      <IntegrityPanels {projectId} {model} onblockers={(n: number) => (integrityBlockers = n)} onchanged={() => void load()} />
    {:else if section === 'custom'}
      <CustomChecks {projectId} {model} bind:selected oninspect={(i: string) => (inspected = i)} onchanged={() => void load()} onrun={(i: string) => void runOne(i)} onrunselected={() => void runSelected()} onrungroup={(id: string) => void run({ kind: 'savedGroup', groupId: id })} />
    {:else}
      <section class="card list" aria-labelledby="list-title" data-testid="section-checks">
        <div class="card-head">
          <button class="fold" type="button" aria-expanded={listOpen} aria-controls="list-body" onclick={() => (listOpen = !listOpen)}>
            <Icon name={listOpen ? 'chevron-down' : dir === 'rtl' ? 'chevron-left' : 'chevron-right'} size={16} />
            <h2 class="card-title" id="list-title">{t(anyRequired ? 'sectionui.list.required' : 'sectionui.list.inFullScan', { count: included.length })}</h2>
          </button>
          <span class="spacer"></span>
          <span class="summary">{listOpen ? counts.map((c) => `${t(`status.result.${c.result}`)} ${c.count}`).join(' · ') : t('sectionui.list.folded')}</span>
        </div>
        {#if listOpen}
          <div id="list-body">
            {#if included.length}
              <table class="checks">
                <thead>
                  <tr>
                    <th class="c-box" scope="col"><span class="visually-hidden">{t('sectionui.column.select')}</span></th>
                    <th class="c-check" scope="col"><TableHeaderCell native label={t('scanplan.column.check')} sortable={false} /></th>
                    <th class="c-ready" scope="col"><TableHeaderCell native label={t('scanplan.column.readiness')} sortable={false} /></th>
                    <th class="c-result" scope="col"><TableHeaderCell native label={t('sectionui.column.lastResult')} sortable={false} /></th>
                    <th class="c-findings" scope="col"><TableHeaderCell native label={t('sectionui.column.findings')} sortable={false} /></th>
                    {#if showCost}<th class="c-cost" scope="col"><TableHeaderCell native label={t('scanplan.column.cost')} sortable={false} /></th>{/if}
                    <th class="c-actions" scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {#each included as spec (spec.instance)}
                    {@const exec = model.latest.get(spec.instance)}
                    {@const isSelected = selected.includes(spec.instance)}
                    <tr class:selected={isSelected} class:inspected={inspected === spec.instance} data-instance={spec.instance}>
                      <td class="c-box"><Checkbox checked={isSelected} label={t('sectionui.selectCheck', { check: checkTitle(t, lang, spec.checkId) })} showLabel={false} onchange={(on: boolean) => toggle(spec.instance, on)} /></td>
                      <td class="c-check">{@render checkName(spec)}</td>
                      <td class="c-ready"><ReadinessBadge readiness={readinessOf(readinessOfInstance(model, spec))} size="sm" /></td>
                      <td class="c-result">
                        {#if exec?.check.outcome}
                          <span class="result"><ResultBadge result={badgeOf(exec.check.outcome, { reviewed: !!exec.check.reviewId, reason: exec.check.outcomeReason })} size="sm" />{#if exec.check.finishedAt}<span class="date">{dayMonth(exec.check.finishedAt, lang)}</span>{/if}</span>
                        {:else}
                          <span class="muted">{t('sectionui.notRun')}</span>
                        {/if}
                      </td>
                      <td class="c-findings"><span class="num">{exec?.check.outcome && !['missing', 'skipped', 'not_applicable', 'cancelled', 'interrupted'].includes(exec.check.outcome) ? findingsCount(exec.check) : '—'}</span></td>
                      {#if showCost}<td class="c-cost"><CostTag cost={costOf(spec.network, spec.cost)} /></td>{/if}
                      <td class="c-actions">
                        <span class="row-actions">
                          <Button kind="quiet" disabled={starting} onclick={() => void runOne(spec.instance)}>{t('sectionui.run')}</Button>
                          <IconButton icon="panel-right" label={t('sectionui.inspect', { check: checkTitle(t, lang, spec.checkId) })} aria-pressed={inspected === spec.instance} onclick={() => (inspected = inspected === spec.instance ? null : spec.instance)} />
                        </span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#if selected.length}
                <div class="selection"><SelectionBar kind="checks" count={selected.length} onrun={() => void runSelected()} onsavegroup={() => (savingGroup = true)} onclear={() => (selected = [])} /></div>
              {/if}
            {:else}
              <p class="none">{t('sectionui.list.empty')}</p>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    {#if section === 'design'}
      {#if showReference && !designRefMissing}<DesignReference {projectId} {model} ondefine={define} onchanged={() => void load()} />{/if}
      <DesignPanels {projectId} {model} onchanged={() => void load()} />
    {/if}
    {#if section === 'code'}<CodePanels {projectId} {model} ondefine={define} oninspect={(i: string) => ((inspected = i), (inspectorTab = 'log'))} />{/if}
    {#if section === 'security'}<SecurityPanels {projectId} {model} />{/if}
    {#if section === 'behavior'}<BehaviorPanels {projectId} {model} oninspect={(i: string) => ((inspected = i), (inspectorTab = 'log'))} onchanged={() => void load()} />{/if}
    {#if section === 'performance'}<PerformancePanels {projectId} {model} ondefine={define} />{/if}

    {#if model.optional.length}
      <section class="card optional" aria-labelledby="optional-title" data-testid="section-optional">
        <div class="card-head">
          <button class="fold" type="button" aria-expanded={optionalOpen} aria-controls="optional-body" onclick={() => (optionalOpen = !optionalOpen)}>
            <Icon name={optionalOpen ? 'chevron-down' : dir === 'rtl' ? 'chevron-left' : 'chevron-right'} size={16} />
            <h2 class="card-title" id="optional-title">{t('sectionui.optional.title', { count: model.optional.length })}</h2>
          </button>
          <span class="spacer"></span>
          <span class="summary">{t('sectionui.optional.note')}</span>
        </div>
        {#if optionalOpen}
          <table class="checks" id="optional-body">
            <thead>
              <tr>
                <th class="o-check" scope="col"><TableHeaderCell native label={t('scanplan.column.check')} sortable={false} /></th>
                <th class="o-ready" scope="col"><TableHeaderCell native label={t('scanplan.column.readiness')} sortable={false} /></th>
                <th class="o-reason" scope="col"><TableHeaderCell native label={t('sectionui.optional.lacks')} sortable={false} /></th>
                <th class="o-action" scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {#each model.optional as spec (spec.instance)}
                {@const a = optionalAction(model, spec)}
                <tr data-instance={spec.instance}>
                  <td class="o-check">{@render checkName(spec)}</td>
                  <td class="o-ready"><ReadinessBadge readiness="not-included" size="sm" /></td>
                  <td class="o-reason"><span class="reason">{a.kind === 'define' ? t('sectionui.optional.needsRef', { ref: refLabel(a.ref) }) : reasonsOf(t, lang, spec.reasons).text}</span></td>
                  <td class="o-action">
                    {#if a.kind === 'define'}
                      <Button kind="secondary" onclick={() => void act(spec)}>{a.ref === 'budgets' ? t('ui.action.defineBudget') : t('ui.action.define')}</Button>
                    {:else if a.kind === 'approve'}
                      <Button kind="secondary" onclick={() => void act(spec)}>{t('ui.action.approve')}</Button>
                    {:else if a.kind === 'include'}
                      <Button kind="secondary" onclick={() => void act(spec)}>{t('sectionui.optional.include')}</Button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    {/if}

    {#if model.notApplicable.length && section !== 'integrity'}
      <section class="card not-applicable" aria-labelledby="na-title" data-testid="section-not-applicable">
        <div class="card-head">
          <button class="fold" type="button" aria-expanded={notApplicableOpen} aria-controls="na-body" onclick={() => (notApplicableOpen = !notApplicableOpen)}>
            <Icon name={notApplicableOpen ? 'chevron-down' : dir === 'rtl' ? 'chevron-left' : 'chevron-right'} size={16} />
            <h2 class="card-title" id="na-title">{t('sectionui.notApplicable.title', { count: model.notApplicable.length })}</h2>
          </button>
          <span class="spacer"></span>
          <span class="summary">{t('sectionui.notApplicable.note')}</span>
        </div>
        {#if notApplicableOpen}
          <ul class="na" id="na-body">
            {#each model.notApplicable as spec (spec.instance)}
              <li data-instance={spec.instance}>{@render checkName(spec)}<span class="reason">{reasonsOf(t, lang, spec.reasons.filter((r) => r.key !== 'profile.reason.notApplicable')).text || reasonText(t, lang, spec.reasons[0])}</span></li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>

  <SheetSaveGroup open={savingGroup} checks={selected.map((i) => ({ id: i.split('@')[0]!, name: checkTitle(t, lang, i.split('@')[0]!) }))} onsave={(name: string) => void saveGroup(name)} oncancel={() => (savingGroup = false)} />
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
  .title {
    margin: 0;
    font: var(--type-title-page);
    color: var(--text-primary);
  }
  .question {
    margin: 0;
    font: var(--type-body);
    color: var(--text-secondary);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .pill {
    padding: 2px var(--space-8);
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
    color: var(--text-secondary);
  }
  .header-row {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    margin-block-start: var(--space-8);
  }
  .blockers {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
    padding: var(--space-8) var(--space-12);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .no-karat {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .spacer {
    flex: 1;
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
  .card-head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .fold {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
    text-align: start;
  }
  .fold:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
    border-radius: var(--radius-control);
  }
  .card-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .summary {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .checks {
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
    padding: var(--space-8) var(--space-4);
    border-block-end: 1px solid var(--border-subtle);
    vertical-align: middle;
  }
  tbody tr.selected,
  tbody tr.inspected {
    background: var(--bg-sunken);
  }
  .c-box {
    inline-size: 32px;
  }
  .c-ready,
  .o-ready {
    inline-size: 140px;
  }
  .c-result {
    inline-size: 150px;
  }
  .c-findings {
    inline-size: 96px;
  }
  .c-cost {
    inline-size: 110px;
  }
  .c-actions {
    inline-size: 112px;
  }
  .o-reason {
    inline-size: 46%;
  }
  .o-action {
    inline-size: 150px;
  }
  .check {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }
  .name {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .id {
    font: var(--type-mono);
    color: var(--text-secondary);
    text-align: start;
  }
  .result {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    white-space: nowrap;
  }
  .date,
  .muted {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .num {
    font: var(--type-numeric-live);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
  }
  .row-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
  }
  .reason {
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .selection {
    display: flex;
    justify-content: center;
    padding-block-start: var(--space-8);
  }
  .none {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .na {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .na li {
    display: flex;
    align-items: center;
    gap: var(--space-16);
    padding-block: var(--space-4);
    border-block-end: 1px solid var(--border-subtle);
  }
  .na .reason {
    color: var(--text-secondary);
  }
</style>
