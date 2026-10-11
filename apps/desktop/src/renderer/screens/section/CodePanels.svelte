<script lang="ts">
  // Screen 12 · الشيفرة والبناء (13.3; Figma 183:18732): the build (its command, what running it does, its last log
  // folded, and the declared outputs with their sizes against the previous round), the types (diagnostics by file,
  // the top five), the linter (errors and warnings by rule, with the warnings policy), the sizes against the budgets
  // («عرّف ميزانية…» where there is none), the missing (proven) and unused («اشتباه») dependencies, the broken local
  // references, and the maintenance indicators with «أنشئ بطاقة» (a suggestion, never a change: C-20 source 5).
  import type { CheckSpec, Finding } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import CommandBlock from '../../components/CommandBlock.svelte';
  import Icon from '../../components/Icon.svelte';
  import LogViewer from '../../components/LogViewer.svelte';
  import ReadinessBadge from '../../components/ReadinessBadge.svelte';
  import Tag from '../../components/Tag.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { PROOF_TAGS } from '../../lib/tags.ts';
  import { attempt, copyText } from '../../app/client.ts';
  import { badgeOf, durationShort } from '../../app/format.ts';
  import { logLines } from '../../app/logs.ts';
  import { groupBy, loadPanelData, messageParts, numberOf, type CheckData } from '../../app/panels.ts';
  import { sizeText } from '../../app/results.ts';
  import type { SectionModel } from '../../app/sections.ts';
  import { commandOf, reasonsOf } from '../../app/specs.ts';
  import { useApp } from '../../app/state.svelte.ts';
  import Panel from './Panel.svelte';

  interface Props {
    projectId: string;
    model: SectionModel;
    /** «عرّف ميزانية…»: the profile's references, where budgets are defined. */
    ondefine: (ref: string) => void;
    /** «افتح السجل»: the inspector's log of an instance. */
    oninspect: (instance: string) => void;
  }
  let { projectId, model, ondefine, oninspect }: Props = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  const IDS = ['code.build', 'code.types', 'code.lint', 'code.size', 'code.unused', 'code.refs.local', 'code.complexity'] as const;
  let data = $state<Map<string, CheckData[]>>(new Map());
  $effect(() => {
    void loadPanelData(projectId, model, IDS).then((d) => (data = d));
  });

  const specOf = (checkId: string): CheckSpec | undefined => model.profile.checks.find((s) => s.checkId === checkId && s.applicable);
  const first = (checkId: string): CheckData | undefined => data.get(checkId)?.[0];
  const resultOf = (d: CheckData | undefined) => (d?.exec.check.outcome ? badgeOf(d.exec.check.outcome, { reviewed: !!d.exec.check.reviewId, reason: d.exec.check.outcomeReason }) : undefined);
  const byRule = (d: CheckData | undefined, ...rules: string[]): Finding[] => (d?.findings ?? []).filter((f) => rules.includes(f.ruleId) && f.effect !== 'excluded');

  // ── the build ──────────────────────────────────────────────────────────────────────────────────────────────
  const build = $derived(first('code.build'));
  const buildSpec = $derived(specOf('code.build'));
  let logOpen = $state(false);
  let buildLog = $state<{ lines: ReturnType<typeof logLines>; totalLines: number } | null>(null);
  $effect(() => {
    const id = build?.exec.check.checkRunId;
    buildLog = null;
    if (!id) return;
    void attempt('check.tail', { checkRunId: id, maxLines: 200 }).then((r) => {
      if (r.ok) buildLog = { lines: logLines(t, lang, r.result.lines, r.result.totalLines), totalLines: r.result.totalLines };
    });
  });
  function delta(size: number | null, previous: number | null): string {
    if (size === null) return t('sectionui.code.gone');
    if (previous === null) return t('sectionui.code.new');
    if (size === previous) return t('sectionui.code.unchanged');
    const d = size - previous;
    return `${d > 0 ? '+' : '−'}${sizeText(Math.abs(d))}`;
  }
  const writesPath = $derived.by(() => {
    const out = build?.report?.outputs[0]?.path;
    return out ? `${out.split('/')[0]}/` : undefined;
  });

  // ── the types ──────────────────────────────────────────────────────────────────────────────────────────────
  const types = $derived(first('code.types'));
  const typeFiles = $derived(
    groupBy(byRule(types, 'types.error'), (f) => f.location?.path ?? '')
      .map(([path, fs]) => ({ path, count: fs.length, first: [...fs].sort((a, b) => (a.location?.line ?? 0) - (b.location?.line ?? 0))[0]! }))
      .sort((a, b) => b.count - a.count),
  );
  const typeTotal = $derived(typeFiles.reduce((n, f) => n + f.count, 0));
  const typedFiles = $derived.by(() => {
    const n = types?.report?.info.files;
    return typeof n === 'number' ? n : null;
  });

  // ── the linter ─────────────────────────────────────────────────────────────────────────────────────────────
  const lint = $derived(first('code.lint'));
  const lintRules = $derived(
    groupBy(byRule(lint, 'lint.error', 'lint.warning'), (f) => `${f.ruleId}|${f.toolRuleId ?? ''}`)
      .map(([, fs]) => {
        const files = groupBy(fs, (f) => f.location?.path ?? '').sort((a, b) => b[1].length - a[1].length);
        return { rule: fs[0]!.toolRuleId ?? fs[0]!.ruleId, error: fs[0]!.ruleId === 'lint.error', count: fs.length, file: files[0]?.[0] ?? '' };
      })
      .sort((a, b) => Number(b.error) - Number(a.error) || b.count - a.count),
  );
  const lintErrors = $derived(lintRules.filter((r) => r.error).reduce((n, r) => n + r.count, 0));
  const lintWarnings = $derived(lintRules.filter((r) => !r.error).reduce((n, r) => n + r.count, 0));
  const policyKey = $derived(`sectionui.code.policy.${specOf('code.lint')?.warningsPolicy ?? 'warn'}` as const);

  // ── the sizes ──────────────────────────────────────────────────────────────────────────────────────────────
  const size = $derived(first('code.size'));
  const sizeSpec = $derived(specOf('code.size'));
  const budgets = $derived(byRule(size, 'size.over-budget').map((f) => ({ path: f.location?.path ?? '', actual: numberOf(f.actual), budget: numberOf(f.expected) })));
  const unbudgeted = $derived((build?.report?.outputs ?? []).filter((o) => o.sizeBytes !== null).slice(0, 8));

  // ── the dependencies ───────────────────────────────────────────────────────────────────────────────────────
  const unused = $derived(first('code.unused'));
  const unusedSpec = $derived(specOf('code.unused'));
  const missingDeps = $derived(byRule(unused, 'unused.unlisted', 'unused.unresolved'));
  const unusedDeps = $derived(byRule(unused, 'unused.item'));

  // ── the references ─────────────────────────────────────────────────────────────────────────────────────────
  const refs = $derived(first('code.refs.local'));
  const brokenRefs = $derived(byRule(refs, 'ref.missing-file', 'ref.missing-anchor'));

  // ── the maintenance indicators ─────────────────────────────────────────────────────────────────────────────
  const complexity = $derived(first('code.complexity'));
  const functions = $derived(
    groupBy(byRule(complexity, 'complexity.cyclomatic', 'complexity.length'), (f) => `${f.location?.path ?? ''}|${messageParts(f.message).head}`).map(([, fs]) => {
      const c = fs.find((f) => f.ruleId === 'complexity.cyclomatic');
      const l = fs.find((f) => f.ruleId === 'complexity.length');
      return { id: fs[0]!.id, name: messageParts(fs[0]!.message).head, path: fs[0]!.location?.path ?? '', complexity: numberOf(c?.actual), length: numberOf(l?.actual), threshold: numberOf(c?.expected ?? l?.expected) };
    }),
  );
  let carded = $state<string[]>([]);
  async function card(findingId: string): Promise<void> {
    const r = await attempt('task.create', { projectId, source: { kind: 'maintenance', findingId } });
    if (!r.ok) return;
    carded = [...carded, findingId];
    app.showToast({ kind: 'created', id: r.result.task.displayId });
  }

  const proof = (p: keyof typeof PROOF_TAGS) => t(PROOF_TAGS[p].key);
</script>

{#snippet value(text: string, mono = false)}<span class="val" class:mono><bdi dir="ltr">{text}</bdi></span>{/snippet}

{#if buildSpec}
  <Panel title={t('sectionui.code.build')} checkId="code.build" result={resultOf(build)} testid="panel-build">
    {@const command = commandOf(buildSpec)}
    {#if command}<CommandBlock {command} runsCode={buildSpec.sideEffects.runsProjectCode} writes={buildSpec.sideEffects.writesRepo === 'maybe'} {writesPath} oncopy={copyText} />{/if}
    {#if build}
      <div class="log-head">
        <button class="fold" type="button" aria-expanded={logOpen} onclick={() => (logOpen = !logOpen)}>
          <Icon name={logOpen ? 'chevron-up' : 'chevron-down'} size={16} />
          <span>{t('sectionui.code.lastLog', { lines: buildLog?.totalLines ?? 0, duration: durationShort(t, build.exec.check.durationMs) })}</span>
        </button>
        <span class="spacer"></span>
        <Button kind="quiet" onclick={() => oninspect(build.exec.check.instance)}>{t('sectionui.behavior.openLog')}</Button>
      </div>
      {#if logOpen && buildLog}<LogViewer lines={buildLog.lines} totalLines={buildLog.totalLines} follow={false} />{/if}
      {#if build.report?.outputs.length}
        <table class="ptable">
          <thead><tr><th scope="col">{t('sectionui.code.output')}</th><th scope="col">{t('sectionui.code.size')}</th><th scope="col">{t('sectionui.code.sincePrevious')}</th></tr></thead>
          <tbody>
            {#each build.report.outputs as o (o.path)}
              <tr><td>{@render value(o.path)}</td><td class="num">{o.sizeBytes === null ? '—' : sizeText(o.sizeBytes)}</td><td class="num">{delta(o.sizeBytes, o.previousBytes)}</td></tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="note">{t('sectionui.code.noOutputs')}</p>
      {/if}
    {:else}
      <p class="note">{t('sectionui.panel.notRun')}</p>
    {/if}
  </Panel>
{/if}

{#if specOf('code.types')}
  <Panel title={t('sectionui.code.types')} checkId="code.types" result={resultOf(types)} testid="panel-types" note={types ? (typeTotal ? t('sectionui.code.typesNote', { count: typeTotal, files: typeFiles.length, total: typedFiles ?? typeFiles.length }) : t('sectionui.code.typesNone')) : t('sectionui.panel.notRun')}>
    {#if typeFiles.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.code.file')}</th><th scope="col">{t('sectionui.code.diagnostics')}</th><th scope="col">{t('sectionui.code.firstDiagnostic')}</th></tr></thead>
        <tbody>
          {#each typeFiles.slice(0, 5) as f (f.path)}
            <tr>
              <td>{@render value(f.path)}</td>
              <td class="num">{f.count}</td>
              <td><span class="stack"><span class="row">{#if f.first.toolRuleId}{@render value(f.first.toolRuleId)}{/if}{#if f.first.location?.line}<span class="muted">{t('sectionui.code.line', { line: f.first.location.line })}</span>{/if}</span><span class="small"><bdi>{f.first.message}</bdi></span></span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Panel>
{/if}

{#if specOf('code.lint')}
  <Panel title={t('sectionui.code.lint')} checkId="code.lint" result={resultOf(lint)} testid="panel-lint" note={lint ? t('sectionui.code.lintNote', { errors: lintErrors, warnings: lintWarnings, policy: t(policyKey) }) : t('sectionui.panel.notRun')}>
    {#if lintRules.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.code.rule')}</th><th scope="col">{t('sectionui.code.kind')}</th><th scope="col">{t('sectionui.code.count')}</th><th scope="col">{t('sectionui.code.topFile')}</th></tr></thead>
        <tbody>
          {#each lintRules as r (r.rule + r.error)}
            <tr><td>{@render value(r.rule)}</td><td>{t(r.error ? 'sectionui.code.error' : 'sectionui.code.warning')}</td><td class="num">{r.count}</td><td>{#if r.file}{@render value(r.file)}{/if}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Panel>
{/if}

{#if sizeSpec}
  {#snippet sizeTags()}{#if !sizeSpec.included}<ReadinessBadge readiness="not-included" size="sm" />{/if}{/snippet}
  <Panel title={t('sectionui.code.sizes')} checkId="code.size" result={sizeSpec.included ? resultOf(size) : undefined} tags={sizeTags} testid="panel-sizes" note={sizeSpec.included ? undefined : t('sectionui.code.noBudget')}>
    {#if budgets.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.code.output')}</th><th scope="col">{t('sectionui.code.size')}</th><th scope="col">{t('sectionui.code.budget')}</th><th scope="col">{t('sectionui.code.difference')}</th></tr></thead>
        <tbody>
          {#each budgets as b (b.path)}
            <tr><td>{@render value(b.path)}</td><td class="num">{b.actual === null ? '—' : sizeText(b.actual)}</td><td class="num">{b.budget === null ? '—' : sizeText(b.budget)}</td><td class="num">{b.actual !== null && b.budget !== null ? `+${sizeText(b.actual - b.budget)}` : '—'}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else if !sizeSpec.included && unbudgeted.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.code.output')}</th><th scope="col">{t('sectionui.code.size')}</th><th scope="col">{t('sectionui.code.budget')}</th><th scope="col">{t('sectionui.code.difference')}</th><th scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th></tr></thead>
        <tbody>
          {#each unbudgeted as o (o.path)}
            <tr><td>{@render value(o.path)}</td><td class="num">{sizeText(o.sizeBytes ?? 0)}</td><td class="muted">{t('sectionui.code.noBudgetCell')}</td><td class="num">—</td><td class="end"><Button kind="secondary" onclick={() => ondefine('budgets')}>{t('ui.action.defineBudget')}</Button></td></tr>
          {/each}
        </tbody>
      </table>
    {:else if !sizeSpec.included}
      <div class="row-end"><Button kind="secondary" onclick={() => ondefine('budgets')}>{t('ui.action.defineBudget')}</Button></div>
    {:else if size}
      <p class="note">{t('sectionui.code.withinBudget')}</p>
    {/if}
  </Panel>
{/if}

{#snippet notIncluded(spec: CheckSpec)}{#if !spec.included}<ReadinessBadge readiness="not-included" size="sm" />{/if}{/snippet}

{#if unusedSpec}
  {#snippet unusedTags()}{@render notIncluded(unusedSpec)}{/snippet}
  <Panel title={t('sectionui.code.unused')} checkId="code.unused" result={unusedSpec.included ? resultOf(unused) : undefined} tags={unusedTags} testid="panel-unused">
    {#if !unusedSpec.included && !unused}
      <p class="note">{reasonsOf(t, lang, unusedSpec.reasons).text}</p>
    {:else if unused}
      <h3 class="sub">{t('sectionui.code.missingDeps', { count: missingDeps.length })}</h3>
      {#if missingDeps.length}
        <table class="ptable">
          <thead><tr><th scope="col">{t('sectionui.code.dependency')}</th><th scope="col">{t('sectionui.code.where')}</th><th scope="col">{t('sectionui.code.proof')}</th></tr></thead>
          <tbody>
            {#each missingDeps as f (f.id)}
              <tr><td>{@render value(messageParts(f.message).rest || f.message)}</td><td>{#if f.location?.path}{@render value(`${f.location.path}${f.location.line ? `:${f.location.line}` : ''}`)}{/if}</td><td><Tag>{proof(f.proof)}</Tag></td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
      <h3 class="sub">{t('sectionui.code.unusedDeps', { count: unusedDeps.length })}</h3>
      {#if unusedDeps.length}
        <table class="ptable">
          <thead><tr><th scope="col">{t('sectionui.code.dependency')}</th><th scope="col">{t('sectionui.code.kindOfItem')}</th><th scope="col">{t('sectionui.code.proof')}</th></tr></thead>
          <tbody>
            {#each unusedDeps as f (f.id)}
              <tr><td>{@render value(messageParts(f.message).rest || f.message)}</td><td>{#if f.toolRuleId}{@render value(f.toolRuleId)}{/if}</td><td><Tag>{proof(f.proof)}</Tag></td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
      {#if !unusedSpec.required}<p class="note">{t('sectionui.code.unusedNote')}</p>{/if}
    {:else}
      <p class="note">{t('sectionui.panel.notRun')}</p>
    {/if}
  </Panel>
{/if}

{#if specOf('code.refs.local')}
  <Panel title={t('sectionui.code.refs', { count: brokenRefs.length })} checkId="code.refs.local" result={resultOf(refs)} testid="panel-refs" note={refs ? (brokenRefs.length ? undefined : t('sectionui.code.refsNone')) : t('sectionui.panel.notRun')}>
    {#if brokenRefs.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.code.file')}</th><th scope="col">{t('sectionui.code.target')}</th><th scope="col">{t('sectionui.code.lineCol')}</th></tr></thead>
        <tbody>
          {#each brokenRefs as f (f.id)}
            <tr><td>{@render value(f.location?.path ?? '')}</td><td>{@render value(messageParts(f.message).head)}</td><td class="num">{f.location?.line ?? '—'}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Panel>
{/if}

{#if specOf('code.complexity')}
  {@const complexitySpec = specOf('code.complexity')!}
  {#snippet complexityTags()}{@render notIncluded(complexitySpec)}{/snippet}
  <Panel title={t('sectionui.code.complexity')} checkId="code.complexity" result={complexitySpec.included ? resultOf(complexity) : undefined} tags={complexityTags} testid="panel-complexity" note={complexity ? t('sectionui.code.complexityNote') : complexitySpec.included ? t('sectionui.panel.notRun') : reasonsOf(t, lang, complexitySpec.reasons).text}>
    {#if functions.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.code.function')}</th><th scope="col">{t('sectionui.code.file')}</th><th scope="col">{t('sectionui.code.cyclomatic')}</th><th scope="col">{t('sectionui.code.length')}</th><th scope="col">{t('sectionui.code.threshold')}</th><th scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th></tr></thead>
        <tbody>
          {#each functions as fn (fn.id)}
            <tr>
              <td>{@render value(fn.name, true)}</td>
              <td>{@render value(fn.path)}</td>
              <td class="num">{fn.complexity ?? '—'}</td>
              <td class="num">{fn.length ?? '—'}</td>
              <td class="num">{fn.threshold ?? '—'}</td>
              <td class="end"><Button kind="secondary" disabled={carded.includes(fn.id)} onclick={() => void card(fn.id)}>{t('ui.action.createCard')}</Button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Panel>
{/if}

<style>
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .sub {
    margin: 0;
    font: var(--type-label);
    color: var(--text-primary);
  }
  .log-head {
    display: flex;
    align-items: center;
    padding: var(--space-8) var(--space-12);
    border-radius: var(--radius-card);
    background: var(--bg-sunken);
  }
  .spacer {
    flex: 1;
  }
  .fold {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    padding: 0;
    border: 0;
    background: none;
    font: var(--type-body-small);
    color: var(--text-primary);
    cursor: pointer;
  }
  .fold:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .row-end {
    display: flex;
    justify-content: flex-end;
  }
</style>
