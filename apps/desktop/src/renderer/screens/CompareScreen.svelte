<script lang="ts">
  // Screen 18 · مقارنة جولتين (11.5, C-22, AT-22; Figma 18.2): the older and the newer run with their rounds and dates,
  // the comparability notes (a different profile, catalog, formula, tools, environment or scope — the comparison
  // stands on the shared checks), each check's result before and after with what changed, the findings sorted as
  // gone, new, persisting and reappeared, and the karat's change — never «تحسّن» when blocking failures grew or the
  // scope changed (11.5).
  import { MESSAGES } from '@ayar/i18n';
  import type { RunComparison, RunView } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import Icon from '../components/Icon.svelte';
  import ResultBadge from '../components/ResultBadge.svelte';
  import Tag from '../components/Tag.svelte';
  import VerdictBadge from '../components/VerdictBadge.svelte';
  import { useLocale } from '../lib/locale.ts';
  import type { Verdict } from '../lib/status.ts';
  import { attempt } from '../app/client.ts';
  import { checkTitle, dayTime, reasonText, resultOf } from '../app/format.ts';
  import { useApp } from '../app/state.svelte.ts';

  let { projectId, fromRunId, toRunId }: { projectId: string; fromRunId: string; toRunId: string } = $props();
  const app = useApp();
  const { t, lang, dir } = useLocale();

  let c = $state<RunComparison | null>(null);
  let runs = $state<Record<string, RunView>>({});
  $effect(() => {
    void attempt('compare.runs', { fromRunId, toRunId }).then((r) => {
      if (r.ok) c = r.result;
    });
    void attempt('runs.list', { projectId }).then((r) => {
      if (r.ok) runs = Object.fromEntries(r.result.runs.map((x) => [x.runId, x]));
    });
  });

  const side = (s: RunComparison['from']) => ({ s, run: runs[s.runId] });
  const changedChecks = $derived((c?.checks ?? []).filter((x) => x.changed));
  /** What changed, and one check that did not as the example of «بلا تغيير» (18.2). */
  const shownChecks = $derived([...changedChecks, ...(c?.checks ?? []).filter((x) => !x.changed).slice(0, 1)]);
  const changeText = (x: RunComparison['checks'][number]) =>
    x.before === null ? t('compareui.newInProfile') : x.after === null ? t('compareui.goneFromProfile') : x.before === x.after ? t('compareui.unchanged') : t('compareui.became', { result: t(`status.result.${resultOf(x.after)}`) });
  const checkIdOf = (instance: string) => instance.split('@')[0] ?? instance;
  const GROUPS = ['resolved', 'new', 'persisting', 'reappeared'] as const;
  const ARROW = { resolved: 'arrow-up', new: 'arrow-up', persisting: 'arrow-up', reappeared: 'arrow-up' } as const;
  const ruleTitle = (ruleId: string) => {
    const key = `catalog.rule.${ruleId}.title`;
    return key in (MESSAGES[lang] as Record<string, string>) ? t(key as Parameters<typeof t>[0]) : ruleId;
  };
  const isVerdict = (v: string | null): v is Verdict => v === 'pure' || v === 'incomplete' || v === 'blocked';
</script>

<div class="page" data-testid="compare">
  <header class="header">
    <div class="title-row">
      <h1 class="title">{t('compareui.title')}</h1>
      <span class="spacer"></span>
      <Button kind="secondary" onclick={() => app.navigate({ name: 'runs', projectId })}>{t('compareui.pickOthers')}</Button>
    </div>
    {#if c}
      <div class="sides">
        {#each [side(c.from), side(c.to)] as x, i (x.s.runId)}
          {#if i === 1}<span class="arrow"><Icon name={dir === 'rtl' ? 'chevron-left' : 'chevron-right'} size={16} /></span>{/if}
          <div class="side">
            <span class="small muted">{t(i === 0 ? 'compareui.older' : 'compareui.newer')}</span>
            <span class="row">{#if x.s.roundDisplayId}<span class="val"><bdi dir="ltr">{x.s.roundDisplayId}</bdi></span>{/if}<span class="val"><bdi dir="ltr">{x.s.displayId}</bdi></span></span>
            {#if x.run?.startedAt}<span class="small muted">{dayTime(x.run.startedAt, lang)}</span>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </header>

  {#if c}
    {#if c.notes.length}
      <section class="notes" aria-labelledby="notes-title">
        <h2 class="card-title" id="notes-title">{t('compareui.notes')}</h2>
        {#each c.notes as n, i (i)}<p class="row small"><Icon name="info" size={16} />{reasonText(t, lang, n)}</p>{/each}
      </section>
    {/if}

    <section class="card">
      <div class="card-head"><h2 class="card-title">{t('compareui.checks')}</h2><span class="spacer"></span><span class="small muted">{t('compareui.checksNote', { changed: changedChecks.length, total: c.checks.length })}</span></div>
      <table class="ptable">
        <thead><tr><th scope="col">{t('scanplan.column.check')}</th><th scope="col">{t('compareui.in', { round: c.from.roundDisplayId ?? c.from.displayId })}</th><th scope="col">{t('compareui.in', { round: c.to.roundDisplayId ?? c.to.displayId })}</th><th scope="col">{t('compareui.change')}</th></tr></thead>
        <tbody>
          {#each shownChecks as x (x.instance)}
            <tr>
              <td><span class="stack"><span class="strong">{checkTitle(t, lang, checkIdOf(x.instance))}</span><bdi class="mono muted" dir="ltr">{checkIdOf(x.instance)}</bdi></span></td>
              <td>{#if x.before}<ResultBadge result={resultOf(x.before)} size="sm" />{:else}<span class="small muted">{t('compareui.notInProfile')}</span>{/if}</td>
              <td>{#if x.after}<ResultBadge result={resultOf(x.after)} size="sm" />{:else}<span class="small muted">{t('compareui.notInProfile')}</span>{/if}</td>
              <td class="small">{changeText(x)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2 class="card-title">{t('compareui.findings')}</h2>
      {#each GROUPS as g (g)}
        {#if c.findings[g].length}
          <p class="small muted">{t(`compareui.group.${g}`, { count: c.findings[g].length })}</p>
          {#each c.findings[g] as f (f.displayId)}
            <div class="finding">
              <span class="strong-small"><bdi>{ruleTitle(f.ruleId)}</bdi></span>
              <span class="spacer"></span>
              {#if f.location?.path}<span class="mono small"><bdi dir="ltr">{f.location.path}{f.location.line ? `:${f.location.line}` : ''}</bdi></span>{/if}
              <span class="mono small muted"><bdi dir="ltr">{f.checkId}</bdi></span>
              <Tag icon={ARROW[g]}>{t(`compareui.status.${g}`)}</Tag>
            </div>
          {/each}
        {/if}
      {/each}
      {#if GROUPS.every((g) => !c!.findings[g].length)}<p class="small muted">{t('compareui.noFindings')}</p>{/if}
    </section>

    <section class="card">
      <h2 class="card-title">{t('compareui.karat')}</h2>
      <div class="sides">
        {#each [c.from, c.to] as s, i (s.runId)}
          {#if i === 1}<span class="arrow"><Icon name={dir === 'rtl' ? 'chevron-left' : 'chevron-right'} size={16} /></span>{/if}
          <div class="side">
            <span class="small muted">{s.roundDisplayId ?? s.displayId}</span>
            <span class="row">{#if isVerdict(s.verdict)}<VerdictBadge verdict={s.verdict} />{/if}<span class="strong">{s.karat === null ? t('compareui.noKarat') : t('runsui.karat', { karat: s.karat })}</span></span>
          </div>
        {/each}
      </div>
      <p class="small muted">{t(`compareui.karatChange.${c.karatChange}`, { from: c.from.blockingFailures, to: c.to.blockingFailures })}</p>
    </section>
  {/if}
</div>

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
    gap: var(--space-12);
  }
  .title-row,
  .card-head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .title {
    margin: 0;
    font: var(--type-title-page);
    color: var(--text-primary);
  }
  .sides {
    display: flex;
    align-items: flex-end;
    gap: var(--space-16);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .arrow {
    display: inline-flex;
    padding-block-end: var(--space-16);
    color: var(--text-secondary);
  }
  .notes,
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
  }
  .notes {
    background: var(--bg-sunken);
  }
  .card {
    background: var(--bg-surface);
  }
  .card-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .finding {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding-block: var(--space-8);
    border-block-end: 1px solid var(--border-subtle);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
  }
  .spacer {
    flex: 1;
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
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .mono {
    font: var(--type-mono);
  }
  .muted {
    color: var(--text-secondary);
  }
  .val {
    padding: 1px var(--space-8);
    border-radius: 4px;
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
