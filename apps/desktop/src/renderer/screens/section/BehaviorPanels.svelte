<script lang="ts">
  // Screen 13 · السلوك والتكامل (13.3; Figma 184:19112, monorepo 185:19404): the test counts of each component from
  // the framework's own report (never an estimate) with the inventory of test files — or, in a project of several
  // packages, every instance by package with its result, its counts and its duration —, the failures with their
  // names and messages, the flaky tests with their attempts (a flaky result is never a pass), the host results of an
  // extension (loading, the service worker, the pages, the console errors), the journeys and contracts, and the
  // tests' strength (the surviving mutants by file) or «ضمّ فحص الطفرات».
  import type { CheckSpec, DiscoverySnapshot, Finding } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import ReadinessBadge from '../../components/ReadinessBadge.svelte';
  import ResultBadge from '../../components/ResultBadge.svelte';
  import Tag from '../../components/Tag.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { attempt } from '../../app/client.ts';
  import { badgeOf, checkTitle, clockMs, reasonText, resultOf as resultOfOutcome } from '../../app/format.ts';
  import { groupBy, loadPanelData, messageParts, type CheckData } from '../../app/panels.ts';
  import type { SectionModel } from '../../app/sections.ts';
  import { reasonsOf } from '../../app/specs.ts';
  import { useApp } from '../../app/state.svelte.ts';
  import Panel from './Panel.svelte';

  interface Props {
    projectId: string;
    model: SectionModel;
    oninspect: (instance: string) => void;
    onchanged: () => void;
  }
  let { projectId, model, oninspect, onchanged }: Props = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  const TESTS = ['beh.unit', 'beh.integration', 'beh.e2e', 'beh.contract', 'beh.stability'] as const;
  const IDS = [...TESTS, 'beh.ext.host', 'beh.mutation'] as const;
  let data = $state<Map<string, CheckData[]>>(new Map());
  let snapshot = $state<DiscoverySnapshot | null>(null);
  $effect(() => {
    void loadPanelData(projectId, model, IDS).then((d) => (data = d));
    void attempt('project.get', { projectId }).then((r) => {
      if (r.ok) snapshot = r.result.snapshot;
    });
  });

  const specsOf = (checkId: string): CheckSpec[] => model.profile.checks.filter((s) => s.checkId === checkId && s.applicable);
  const first = (checkId: string): CheckData | undefined => data.get(checkId)?.[0];
  const resultOf = (d: CheckData | undefined) => (d?.exec.check.outcome ? badgeOf(d.exec.check.outcome, { reviewed: !!d.exec.check.reviewId, reason: d.exec.check.outcomeReason }) : undefined);
  const all = $derived(TESTS.flatMap((id) => data.get(id) ?? []));
  const monorepo = $derived(model.profile.checks.some((s) => s.section === 'behavior' && s.applicable && s.component !== '.'));
  const project = $derived(app.project(projectId));
  const componentLabel = (component: string) => (component === '.' ? t('sectionui.behavior.singlePackage', { name: project?.displayName ?? '' }) : component);
  /** The inventory lists test files by pattern (not by component): a component's are those under its folder. */
  function testFiles(component: string): number | null {
    const kinds = snapshot ? [snapshot.inventory.testFiles.jsTests, snapshot.inventory.testFiles.pyTests].filter((k) => !!k) : [];
    if (!kinds.length) return null;
    if (component === '.') return kinds.reduce((n, k) => n + k.count, 0);
    if (kinds.some((k) => k.truncated)) return null;
    return kinds.reduce((n, k) => n + k.paths.filter((p) => p.startsWith(`${component}/`)).length, 0);
  }
  /** The framework is the reader of the report the counts came from (an adapter's id), named as its makers write it. */
  const FRAMEWORKS: Record<string, string> = { vitest: 'Vitest', jest: 'Jest', playwright: 'Playwright', pytest: 'pytest', 'node-test': 'node:test' };

  // ── counts ─────────────────────────────────────────────────────────────────────────────────────────────────
  const countRows = $derived(all.filter((d) => d.report?.tests).map((d) => ({ key: d.exec.check.checkRunId, checkId: d.exec.check.checkId, component: d.exec.check.component, tests: d.report!.tests!, reader: d.report!.reader })));
  const unitRows = $derived(countRows.filter((r) => r.checkId === 'beh.unit' || r.checkId === 'beh.integration'));
  /** The counts of the unit and integration tests (the journeys have their own panel); every report when they have none. */
  const shownRows = $derived(unitRows.length ? unitRows : countRows);
  const inventory = $derived([...new Set(shownRows.map((r) => r.component))].reduce((n, c) => n + (testFiles(c) ?? 0), 0));
  const framework = $derived([...new Set(shownRows.map((r) => FRAMEWORKS[r.reader] ?? r.reader))].join(lang === 'ar' ? '، ' : ', '));

  // ── failures and flakiness ─────────────────────────────────────────────────────────────────────────────────
  const withData = (rule: string) => all.flatMap((d) => d.findings.filter((f) => f.ruleId === rule && f.effect !== 'excluded').map((f) => ({ f, d })));
  const failures = $derived(withData('test.failed'));
  const flaky = $derived(withData('test.flaky'));
  const testName = (f: Finding) => f.location?.key ?? messageParts(f.message).head;

  // ── the host ───────────────────────────────────────────────────────────────────────────────────────────────
  const host = $derived(first('beh.ext.host'));
  type PageFact = { path: string; opened: boolean; consoleErrors: number };
  const pages = $derived.by<PageFact[]>(() => {
    const p = host?.report?.info.pages;
    return Array.isArray(p) ? (p as PageFact[]) : [];
  });
  const loadFailed = $derived((host?.findings ?? []).filter((f) => f.ruleId === 'ext.load-failed'));
  const consoleErrors = $derived((host?.findings ?? []).filter((f) => f.ruleId === 'ext.console-error'));

  // ── journeys and contracts ─────────────────────────────────────────────────────────────────────────────────
  const journeySpecs = $derived(model.profile.checks.filter((s) => (s.checkId === 'beh.e2e' || s.checkId === 'beh.contract') && s.section === 'behavior'));

  // ── strength ───────────────────────────────────────────────────────────────────────────────────────────────
  const mutationSpec = $derived(specsOf('beh.mutation')[0]);
  const mutation = $derived(first('beh.mutation'));
  const survivors = $derived(groupBy((mutation?.findings ?? []).filter((f) => f.ruleId === 'mutant.survived'), (f) => f.location?.path ?? ''));
  const score = $derived(typeof mutation?.report?.info.score === 'number' ? mutation.report.info.score : null);
  let carded = $state<string[]>([]);
  async function card(findingId: string): Promise<void> {
    const r = await attempt('task.create', { projectId, source: { kind: 'survivingMutant', findingId } });
    if (!r.ok) return;
    carded = [...carded, findingId];
    app.showToast({ kind: 'created', id: r.result.task.displayId });
  }
  // ── the units with no test file (C-20 source 2, J4; D-DEV12-05): a «اختبار وحدة» card each ─────────────────────
  let gaps = $state<{ files: string[]; total: number; truncated: boolean }>({ files: [], total: 0, truncated: false });
  $effect(() => {
    void model.latest.size;
    void attempt('tasks.gaps', { projectId }).then((r) => {
      if (r.ok) gaps = r.result;
    });
  });
  let gapCarded = $state<string[]>([]);
  async function gapCard(file: string): Promise<void> {
    const r = await attempt('task.create', { projectId, source: { kind: 'testGap', checkId: 'beh.unit', file } });
    if (!r.ok) return;
    gapCarded = [...gapCarded, file];
    app.showToast({ kind: 'created', id: r.result.task.displayId });
  }
  async function include(instance: string): Promise<void> {
    const r = await attempt('profile.update', { projectId, patch: { checks: { [instance]: { included: true } } } });
    if (r.ok) onchanged();
  }
</script>

{#snippet value(text: string, mono = false)}<span class="val" class:mono><bdi dir="ltr">{text}</bdi></span>{/snippet}

{#if monorepo}
  <Panel title={t('sectionui.behavior.instances')} testid="panel-instances" note={t('sectionui.behavior.instancesNote')}>
    {#if all.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.behavior.instance')}</th><th scope="col">{t('sectionui.behavior.result')}</th><th scope="col">{t('sectionui.behavior.tests')}</th><th scope="col">{t('sectionui.behavior.duration')}</th></tr></thead>
        {#each groupBy(all, (d) => d.exec.check.component) as [component, rows] (component)}
          <tbody>
            <tr class="group"><th colspan="4" scope="rowgroup"><span class="row"><bdi dir="ltr" class="mono">{component}</bdi><span class="muted">{rows.length}</span></span></th></tr>
            {#each rows as d (d.exec.check.checkRunId)}
              {@const tests = d.report?.tests}
              <tr>
                <td><span class="stack"><span>{checkTitle(t, lang, d.exec.check.checkId)}</span><bdi class="mono muted" dir="ltr">{d.exec.check.instance}</bdi></span></td>
                <td>{#if d.exec.check.outcome}<ResultBadge result={resultOfOutcome(d.exec.check.outcome)} size="sm" />{/if}</td>
                <td class="small">{tests ? t('sectionui.behavior.testsLine', { total: tests.total, passed: tests.passed, failed: tests.failed, skipped: tests.skipped }) : '—'}</td>
                <td class="num">{clockMs(d.exec.check.durationMs)}</td>
              </tr>
            {/each}
          </tbody>
        {/each}
      </table>
    {:else}
      <p class="note">{t('sectionui.panel.notRun')}</p>
    {/if}
  </Panel>
{:else if specsOf('beh.unit').length || countRows.length}
  <Panel title={t('sectionui.behavior.counts')} checkId="beh.unit" result={resultOf(first('beh.unit'))} testid="panel-counts" note={countRows.length ? t('sectionui.behavior.countsNote', { files: inventory, framework: framework || '—' }) : t('sectionui.panel.notRun')}>
    {#if countRows.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.behavior.component')}</th><th scope="col">{t('sectionui.behavior.executed')}</th><th scope="col">{t('sectionui.behavior.passed')}</th><th scope="col">{t('sectionui.behavior.failed')}</th><th scope="col">{t('sectionui.behavior.skipped')}</th><th scope="col">{t('sectionui.behavior.flaky')}</th><th scope="col">{t('sectionui.behavior.testFiles')}</th></tr></thead>
        <tbody>
          {#each shownRows as r (r.key)}
            <tr><td><span class="stack"><span>{componentLabel(r.component)}</span><bdi class="mono muted" dir="ltr">{r.checkId}</bdi></span></td><td class="num">{r.tests.total - r.tests.skipped}</td><td class="num">{r.tests.passed}</td><td class="num">{r.tests.failed}</td><td class="num">{r.tests.skipped}</td><td class="num">{r.tests.flaky}</td><td class="num">{testFiles(r.component) ?? '—'}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Panel>
{/if}

{#if specsOf('beh.unit').length && gaps.files.length}
  <Panel title={t('sectionui.behavior.gaps', { count: gaps.total })} testid="panel-gaps" note={gaps.truncated ? `${t('sectionui.behavior.gapsNote')} ${t('sectionui.behavior.gapsTruncated', { shown: gaps.files.length, total: gaps.total })}` : t('sectionui.behavior.gapsNote')}>
    <table class="ptable">
      <thead><tr><th scope="col">{t('sectionui.code.file')}</th><th scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th></tr></thead>
      <tbody>
        {#each gaps.files as file (file)}
          <tr data-file={file}>
            <td>{@render value(file)}</td>
            <td class="end"><Button kind="secondary" disabled={gapCarded.includes(file)} onclick={() => void gapCard(file)}>{t('ui.action.createCard')}</Button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Panel>
{/if}

{#if all.length}
  <Panel title={t('sectionui.behavior.failures', { count: failures.length })} testid="panel-failures" note={failures.length ? undefined : t('sectionui.behavior.noFailures')}>
    {#each failures as { f, d } (f.id)}
      <div class="item">
        <ResultBadge result="failed" size="sm" />
        <div class="body">
          <p class="strong"><bdi>{t('sectionui.behavior.failing', { name: testName(f) })}</bdi></p>
          <p class="row">{#if f.location?.path}{@render value(f.location.path + (f.location.line ? `:${f.location.line}` : ''))}{/if}{@render value(d.exec.check.checkId, true)}</p>
          <p class="mono small"><bdi dir="ltr">{(f.actual ?? f.message).split('\n')[0]}</bdi></p>
        </div>
        <span class="end column"><Button kind="quiet" onclick={() => oninspect(d.exec.check.instance)}>{t('sectionui.behavior.openLog')}</Button>{@render value(f.displayId)}</span>
      </div>
    {/each}
  </Panel>
{/if}

{#if flaky.length}
  <Panel title={t('sectionui.behavior.flakyTitle', { count: flaky.length })} testid="panel-flaky" note={t('sectionui.behavior.flakyNote')}>
    {#each flaky as { f } (f.id)}
      <div class="item">
        <ResultBadge result="flaky" size="sm" />
        <div class="body">
          <p class="strong"><bdi>{testName(f)}</bdi></p>
          <p class="row">{#if f.location?.path}{@render value(f.location.path)}{/if}</p>
        </div>
        <span class="end small"><bdi>{f.actual ?? messageParts(f.message).rest}</bdi></span>
      </div>
    {/each}
  </Panel>
{/if}

{#if specsOf('beh.ext.host').length}
  <Panel title={t('sectionui.behavior.host')} checkId="beh.ext.host" result={resultOf(host)} testid="panel-host">
    {#if host && (host.exec.check.outcome === 'passed' || host.exec.check.outcome === 'failed')}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.behavior.item')}</th><th scope="col">{t('sectionui.behavior.result')}</th><th scope="col">{t('sectionui.behavior.details')}</th></tr></thead>
        <tbody>
          <tr><td>{t('sectionui.behavior.load')}</td><td><ResultBadge result={loadFailed.some((f) => !f.location?.page) ? 'failed' : 'passed'} size="sm" /></td><td class="small"><bdi>{loadFailed[0] ? loadFailed[0].message : t('sectionui.behavior.loaded', { browser: typeof host.report?.info.browser === 'string' ? host.report.info.browser : 'Chromium' })}</bdi></td></tr>
          <tr><td>{t('sectionui.behavior.worker')}</td><td><ResultBadge result={host.report?.info.workerErrors ? 'failed' : 'passed'} size="sm" /></td><td class="small">{host.report?.info.serviceWorker ? t('sectionui.behavior.workerRan') : t('sectionui.behavior.noWorker')}</td></tr>
          <tr><td>{t('sectionui.behavior.pages')}</td><td><ResultBadge result={pages.every((p) => p.opened) ? 'passed' : 'failed'} size="sm" /></td><td><span class="row">{#each pages as p (p.path)}{@render value(p.path)}{/each}<span class="small muted">{pages.every((p) => p.opened) ? t('sectionui.behavior.pagesOpened') : t('sectionui.behavior.pagesFailed')}</span></span></td></tr>
          <tr><td>{t('sectionui.behavior.console')}</td><td><ResultBadge result={consoleErrors.length ? 'failed' : 'passed'} size="sm" /></td><td class="small">{t('sectionui.behavior.consoleErrors', { count: consoleErrors.length })}</td></tr>
        </tbody>
      </table>
    {:else}
      <p class="note">{host?.exec.check.outcomeReason ? reasonText(t, lang, host.exec.check.outcomeReason) : t('sectionui.panel.notRun')}</p>
    {/if}
  </Panel>
{/if}

{#if journeySpecs.length}
  <Panel title={t('sectionui.behavior.journeys')} testid="panel-journeys">
    <table class="ptable">
      <thead><tr><th scope="col">{t('scanplan.column.check')}</th><th scope="col">{t('sectionui.behavior.result')}</th><th scope="col">{t('sectionui.behavior.reason')}</th></tr></thead>
      <tbody>
        {#each journeySpecs as s (s.instance)}
          {@const exec = model.latest.get(s.instance)}
          <tr>
            <td><span class="stack"><span class="strong">{checkTitle(t, lang, s.checkId)}</span><bdi class="mono muted" dir="ltr">{s.checkId}</bdi></span></td>
            <td><ResultBadge result={exec?.check.outcome ? resultOfOutcome(exec.check.outcome) : s.applicable ? 'skipped' : 'not-applicable'} size="sm" /></td>
            <td class="small">{exec?.check.outcomeReason ? reasonText(t, lang, exec.check.outcomeReason) : reasonsOf(t, lang, s.reasons).text}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Panel>
{/if}

{#if mutationSpec}
  {#snippet strengthTags()}{#if !mutationSpec.included}<ReadinessBadge readiness="not-included" size="sm" />{/if}{/snippet}
  <Panel title={t('sectionui.behavior.strength')} checkId="beh.mutation" result={mutationSpec.included ? resultOf(mutation) : undefined} tags={strengthTags} testid="panel-strength" note={mutation ? t('sectionui.behavior.strengthNote', { score: score ?? '—' }) : t('sectionui.behavior.notMutated')}>
    {#if survivors.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.code.file')}</th><th scope="col">{t('sectionui.behavior.survivors')}</th><th scope="col">{t('sectionui.behavior.example')}</th><th scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th></tr></thead>
        <tbody>
          {#each survivors as [path, fs] (path)}
            <tr>
              <td>{@render value(path)}</td>
              <td class="num">{fs.length}</td>
              <td><span class="stack"><span class="small"><bdi dir="ltr">{fs[0]!.message}</bdi></span>{#if fs[0]!.location?.line}<span class="muted">{t('sectionui.code.line', { line: fs[0]!.location.line })}</span>{/if}</span></td>
              <td class="end"><Button kind="secondary" disabled={carded.includes(fs[0]!.id)} onclick={() => void card(fs[0]!.id)}>{t('ui.action.createCard')}</Button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if !mutationSpec.included}
      <div class="foot"><span class="row"><Tag>{t(`scanplan.resource.${mutationSpec.resourceClass}` as Parameters<typeof t>[0])}</Tag></span><Button kind="secondary" onclick={() => void include(mutationSpec.instance)}>{t('sectionui.behavior.includeMutation')}</Button></div>
    {/if}
  </Panel>
{/if}

<style>
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-12);
    padding-block: var(--space-8);
    border-block-end: 1px solid var(--border-subtle);
  }
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .body p {
    margin: 0;
  }
  .strong {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .small {
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .mono {
    font: var(--type-mono);
  }
  .muted {
    color: var(--text-secondary);
  }
  .row,
  .end {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .end.column {
    flex-direction: column;
    align-items: flex-end;
  }
  .item :global(.val) {
    padding: 1px var(--space-8);
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  tr.group th {
    padding-block: var(--space-8);
    font: var(--type-label);
    color: var(--text-primary);
  }
</style>
