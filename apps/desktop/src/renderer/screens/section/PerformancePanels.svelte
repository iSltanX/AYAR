<script lang="ts">
  // Screen 14 · الأداء والمتانة (13.3; Figma 186:19693): the measures against the budgets for each page and state (the
  // probe's medians on a slowed processor; an unstable timing is shown and never judged, E-21), the load summary and
  // the recovery result (most checks of this section are optional: «غير مضمّن» with what each lacks), and the
  // compatibility runs by browser. «عرّف ميزانية…» where a measure has none.
  import type { Finding } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import ReadinessBadge from '../../components/ReadinessBadge.svelte';
  import ResultBadge from '../../components/ResultBadge.svelte';
  import Tag from '../../components/Tag.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { badgeOf, reasonText, resultOf as resultOfOutcome } from '../../app/format.ts';
  import { groupBy, loadPanelData, messageParts, type CheckData } from '../../app/panels.ts';
  import { sizeText } from '../../app/results.ts';
  import type { SectionModel } from '../../app/sections.ts';
  import { commandLineText, reasonsOf } from '../../app/specs.ts';
  import Panel from './Panel.svelte';

  interface Props {
    projectId: string;
    model: SectionModel;
    ondefine: (ref: string) => void;
  }
  let { projectId, model, ondefine }: Props = $props();
  const { t, lang } = useLocale();

  const IDS = ['perf.web', 'perf.load', 'perf.recovery', 'perf.compat'] as const;
  let data = $state<Map<string, CheckData[]>>(new Map());
  $effect(() => {
    void loadPanelData(projectId, model, IDS).then((d) => (data = d));
  });
  const spec = (checkId: string) => model.profile.checks.find((s) => s.checkId === checkId && s.applicable);
  const first = (checkId: string): CheckData | undefined => data.get(checkId)?.[0];
  const resultOf = (d: CheckData | undefined) => (d?.exec.check.outcome ? badgeOf(d.exec.check.outcome, { reviewed: !!d.exec.check.reviewId, reason: d.exec.check.outcomeReason }) : undefined);

  // ── the measures (E-21) ────────────────────────────────────────────────────────────────────────────────────
  /** The probe's fields, the budget key each is judged by, and how its value reads. */
  const METRICS = [
    { field: 'fcp', budget: 'fcpMs', unit: 'ms' },
    { field: 'lcp', budget: 'lcpMs', unit: 'ms' },
    { field: 'load', budget: 'loadMs', unit: 'ms' },
    { field: 'taskMs', budget: 'taskMs', unit: 'ms' },
    { field: 'scriptMs', budget: 'scriptMs', unit: 'ms' },
    { field: 'layoutMs', budget: 'layoutMs', unit: 'ms' },
    { field: 'cls', budget: 'cls', unit: 'ratio' },
    { field: 'bytes', budget: 'bytes', unit: 'bytes' },
    { field: 'requests', budget: 'requests', unit: 'count' },
  ] as const;
  const web = $derived(first('perf.web'));
  const webSpec = $derived(spec('perf.web'));
  const budgets = $derived.by<Record<string, number>>(() => {
    const b = webSpec?.referenceValues.budgets;
    const w = b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>).web : null;
    return w && typeof w === 'object' && !Array.isArray(w) ? (w as Record<string, number>) : {};
  });
  const measured = $derived.by<[string, Record<string, number | string | null>][]>(() => {
    const m = web?.report?.info.measured;
    return m && typeof m === 'object' && !Array.isArray(m) ? Object.entries(m as Record<string, Record<string, number | string | null>>) : [];
  });
  const exceeded = $derived(new Set((web?.findings ?? []).filter((f) => f.ruleId === 'perf.budget-exceeded').map((f) => `${f.location?.state ?? ''}|${f.message.split(':')[0]}`)));
  function show(v: number, unit: (typeof METRICS)[number]['unit']): string {
    if (unit === 'ms') return v >= 1000 ? t('sectionui.performance.seconds', { value: Math.round(v / 100) / 10 }) : t('sectionui.performance.ms', { value: Math.round(v) });
    if (unit === 'bytes') return sizeText(v);
    return String(Math.round(v * 1000) / 1000);
  }
  const rows = $derived(
    measured.flatMap(([key, row]) =>
      METRICS.filter((m) => typeof row[m.field] === 'number' && (budgets[m.budget] !== undefined || m.field === 'lcp')).map((m) => {
        const value = row[m.field] as number;
        const budget = budgets[m.budget];
        const state = key.split('|')[0] ?? key;
        return { key: `${key}:${m.field}`, page: key, metric: m.field, value: show(value, m.unit), budget: budget === undefined ? null : show(budget, m.unit), diff: budget === undefined ? null : `${value - budget > 0 ? '+' : '−'}${show(Math.abs(value - budget), m.unit)}`, over: exceeded.has(`${state}|${m.budget}`) || (budget !== undefined && value > budget), unstable: typeof row[`${m.field}Unstable`] === 'string' };
      }),
    ),
  );

  // ── load, recovery, compatibility ──────────────────────────────────────────────────────────────────────────
  const compat = $derived(first('perf.compat'));
  const browserOf = (f: Finding) => /^\[([^\]]+)\]/.exec(f.location?.key ?? f.message)?.[1] ?? '—';
  const compatFailures = $derived(groupBy((compat?.findings ?? []).filter((f) => f.ruleId === 'test.failed' && f.effect !== 'excluded'), browserOf));
  /** The matrix the test report recorded (each browser by test); beyond a readable width, the failures by browser. */
  const MATRIX_COLUMNS = 8;
  const STATUS: Record<string, 'passed' | 'failed' | 'flaky' | 'skipped'> = { passed: 'passed', failed: 'failed', flaky: 'flaky', skipped: 'skipped' };
  const matrix = $derived.by(() => {
    const m = compat?.report?.info.byProject;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const rows = Object.entries(m as Record<string, Record<string, string>>);
    const columns = [...new Set(rows.flatMap(([, r]) => Object.keys(r)))];
    return rows.length && columns.length && columns.length <= MATRIX_COLUMNS ? { rows, columns } : null;
  });
</script>

{#snippet value(text: string)}<span class="val"><bdi dir="ltr">{text}</bdi></span>{/snippet}

{#if webSpec}
  {#snippet webTags()}{#if !webSpec.included}<ReadinessBadge readiness="not-included" size="sm" />{/if}{/snippet}
  <Panel title={t('sectionui.performance.measures')} checkId="perf.web" result={webSpec.included ? resultOf(web) : undefined} tags={webTags} testid="panel-measures" note={web ? t('sectionui.performance.measuresNote') : webSpec.included ? t('sectionui.panel.notRun') : undefined}>
    {#if rows.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.performance.pageState')}</th><th scope="col">{t('sectionui.performance.metric')}</th><th scope="col">{t('sectionui.performance.value')}</th><th scope="col">{t('sectionui.code.budget')}</th><th scope="col">{t('sectionui.code.difference')}</th></tr></thead>
        <tbody>
          {#each rows as r (r.key)}
            <tr>
              <td>{@render value(r.page)}</td>
              <td>{t(`sectionui.performance.metric.${r.metric}` as Parameters<typeof t>[0])}</td>
              <td class="num">{r.value}{#if r.unstable} <Tag>{t('sectionui.performance.unstable')}</Tag>{/if}</td>
              <td class="num">{r.budget ?? '—'}</td>
              <td>{#if r.budget === null}<Button kind="secondary" onclick={() => ondefine('budgets')}>{t('ui.action.defineBudget')}</Button>{:else}<span class="row"><span class="num">{r.diff}</span>{#if r.over}<Tag>{t('sectionui.performance.over')}</Tag>{/if}</span>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if !webSpec.included}
      <div class="foot"><p class="note">{reasonsOf(t, lang, webSpec.reasons).text}</p><Button kind="secondary" onclick={() => ondefine('budgets')}>{t('ui.action.defineBudget')}</Button></div>
    {/if}
  </Panel>
{/if}

<div class="pair">
  {#each ['perf.load', 'perf.recovery'] as const as checkId (checkId)}
    {@const s = spec(checkId)}
    {#if s}
      {@const d = first(checkId)}
      {#snippet tags()}{#if !s.included}<ReadinessBadge readiness="not-included" size="sm" />{/if}{/snippet}
      <Panel title={t(checkId === 'perf.load' ? 'sectionui.performance.load' : 'sectionui.performance.recovery')} {checkId} result={s.included ? resultOf(d) : undefined} {tags} testid={checkId === 'perf.load' ? 'panel-load' : 'panel-recovery'}>
        <dl class="facts">
          <dt>{t(checkId === 'perf.load' ? 'sectionui.performance.scenario' : 'sectionui.performance.command')}</dt>
          <dd>{s.command ? commandLineText(s.command.argv, s.command.cwd) : t(checkId === 'perf.load' ? 'sectionui.performance.noScenario' : 'sectionui.performance.noCommand')}</dd>
          <dt>{t(checkId === 'perf.load' ? 'sectionui.performance.thresholds' : 'sectionui.performance.criterion')}</dt>
          <dd>{d?.exec.check.outcomeReason ? reasonText(t, lang, d.exec.check.outcomeReason) : (d?.findings ?? []).map((f) => messageParts(f.message).head).join(' · ') || '—'}</dd>
        </dl>
        {#if !s.included}
          <div class="foot"><p class="note">{reasonsOf(t, lang, s.reasons).text}</p><Button kind="secondary" onclick={() => ondefine(checkId === 'perf.load' ? 'budgets' : 'recoveryCommand')}>{t('ui.action.define')}</Button></div>
        {/if}
      </Panel>
    {/if}
  {/each}
</div>

{#if spec('perf.compat')}
  <Panel title={t('sectionui.performance.compat')} checkId="perf.compat" result={resultOf(compat)} testid="panel-compat" note={compat ? (matrix ? t('sectionui.performance.compatMatrixNote') : compatFailures.length ? t('sectionui.performance.compatNote') : t('sectionui.performance.compatAll')) : t('sectionui.panel.notRun')}>
    {#if matrix}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.performance.browser')}</th>{#each matrix.columns as c (c)}<th scope="col"><bdi>{c}</bdi></th>{/each}</tr></thead>
        <tbody>
          {#each matrix.rows as [browser, cells] (browser)}
            <tr><td>{@render value(browser)}</td>{#each matrix.columns as c (c)}<td>{#if STATUS[cells[c] ?? '']}<ResultBadge result={STATUS[cells[c]!]!} size="sm" />{:else}<span class="muted">—</span>{/if}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    {:else if compatFailures.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.performance.browser')}</th><th scope="col">{t('sectionui.behavior.result')}</th><th scope="col">{t('sectionui.performance.failing')}</th></tr></thead>
        <tbody>
          {#each compatFailures as [browser, fs] (browser)}
            <tr><td>{@render value(browser)}</td><td><ResultBadge result={resultOfOutcome('failed')} size="sm" /></td><td class="small"><bdi>{fs.map((f) => f.location?.key ?? f.message).join(' · ')}</bdi></td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Panel>
{/if}

<style>
  .muted {
    color: var(--text-secondary);
  }
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-16);
  }
  .pair:empty {
    display: none;
  }
  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-8) var(--space-16);
    margin: 0;
    font: var(--type-body-small);
  }
  .facts dt {
    color: var(--text-secondary);
  }
  .facts dd {
    margin: 0;
    color: var(--text-primary);
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-12);
  }
  .row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
  }
</style>
