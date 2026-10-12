<script lang="ts">
  // Screen 18 · التشغيلات (13.3, C-17; Figma 18.1, delete 18.3): the project's runs, newest first — each with its id
  // and date, its kind (and round), its verdict and karat (a full scan's alone: a section or a selection is «ليس
  // فحصًا كاملًا», a cancelled run has none), its counts, its duration, its commit and profile version — «احفظ دائمًا»
  // (kept beyond the retention) and «احذف» (the main process asks in its own alert first, D-DEV3-15). Two runs chosen
  // open «قارن المحددين».
  import type { RunPlan, RunView } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import Checkbox from '../components/Checkbox.svelte';
  import Icon from '../components/Icon.svelte';
  import VerdictBadge from '../components/VerdictBadge.svelte';
  import { useLocale } from '../lib/locale.ts';
  import { attempt } from '../app/client.ts';
  import { clockMs, countsInOrder, dayTime, runKind, verdictOf } from '../app/format.ts';
  import { isActive } from '../app/runs.svelte.ts';
  import { useApp } from '../app/state.svelte.ts';

  let { projectId }: { projectId: string } = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  let runs = $state<RunView[]>([]);
  let retain = $state(20);
  let plans = $state<Record<string, RunPlan | null>>({});
  async function load(): Promise<void> {
    const r = await attempt('runs.list', { projectId });
    if (!r.ok) return;
    runs = r.result.runs;
    retain = r.result.retainRuns;
    // The kind of a section run names its section, from its plan (read once per run).
    for (const run of runs.filter((x) => x.kind === 'section' && !(x.runId in plans))) {
      const d = await attempt('run.get', { runId: run.runId });
      plans = { ...plans, [run.runId]: d.ok ? d.result.plan : null };
    }
  }
  $effect(() => {
    void load();
  });

  let chosen = $state<string[]>([]);
  const toggle = (id: string, on: boolean) => (chosen = on ? [...chosen, id].slice(-2) : chosen.filter((x) => x !== id));
  function compare(): void {
    const [a, b] = [...chosen].map((id) => runs.find((r) => r.runId === id)!).sort((x, y) => (x.startedAt ?? '').localeCompare(y.startedAt ?? ''));
    if (a && b) app.navigate({ name: 'compare', projectId, fromRunId: a.runId, toRunId: b.runId });
  }
  async function keep(run: RunView): Promise<void> {
    const r = await attempt('runs.keep', { runId: run.runId, keep: !run.keepForever });
    if (r.ok) runs = runs.map((x) => (x.runId === run.runId ? r.result : x));
  }
  async function remove(run: RunView): Promise<void> {
    const c = await attempt('confirm.issue', { command: 'runs.delete', target: run.runId });
    if (!c.ok || 'cancelled' in c.result) return;
    const d = await attempt('runs.delete', { runId: run.runId, confirmationToken: c.result.confirmationToken });
    if (d.ok) {
      chosen = chosen.filter((x) => x !== run.runId);
      await load();
    }
  }
  const counts = (run: RunView) => countsInOrder(run.counts.byOutcome).map((c) => `${t(`status.result.${c.result}`)} ${c.count}`).join(' · ');
  const duration = (run: RunView) => (run.startedAt && run.finishedAt ? clockMs(Date.parse(run.finishedAt) - Date.parse(run.startedAt)) : '—');
  const kindText = (run: RunView) => `${runKind(t, run, plans[run.runId])}${run.cancelReason ? ` · ${t('runsui.cancelled')}` : ''}`;
</script>

<div class="page" data-testid="runs">
  <header class="header">
    <div class="title-row">
      <div class="titles">
        <h1 class="title">{t('ui.nav.runs')}</h1>
        <p class="small muted">{t('runsui.subtitle', { count: retain })}</p>
      </div>
      <span class="spacer"></span>
      <Button kind="primary" icon="columns-2" disabled={chosen.length !== 2} onclick={compare}>{t('runsui.compare', { count: chosen.length })}</Button>
    </div>
  </header>

  <section class="card">
    {#if runs.length}
      <table class="ptable runs">
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">{t('sectionui.column.select')}</span></th>
            <th scope="col">{t('runsui.run')}</th>
            <th scope="col">{t('runsui.kind')}</th>
            <th scope="col">{t('runsui.verdict')}</th>
            <th scope="col">{t('runsui.counts')}</th>
            <th scope="col">{t('runsui.duration')}</th>
            <th scope="col">{t('runsui.commit')}</th>
            <th scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each runs as run (run.runId)}
            {@const on = chosen.includes(run.runId)}
            <tr class:selected={on} data-run={run.displayId}>
              <td><Checkbox label={t('runsui.choose', { run: run.displayId })} showLabel={false} checked={on} disabled={isActive(run)} onchange={(v: boolean) => toggle(run.runId, v)} /></td>
              <td>
                <span class="stack">
                  <button type="button" class="link val" onclick={() => app.navigate({ name: 'scan', projectId, runId: run.runId })}><bdi dir="ltr">{run.displayId}</bdi></button>
                  {#if run.startedAt}<span class="small muted">{dayTime(run.startedAt, lang)}</span>{/if}
                </span>
              </td>
              <td><span class="stack"><span>{kindText(run)}</span>{#if run.purity?.roundId && run.kind === 'full'}<span class="small muted">{run.purity.roundDisplayId ?? ''}</span>{/if}</span></td>
              <td>
                {#if run.verdict && run.purity?.karat !== null && run.purity?.karat !== undefined && run.kind === 'full'}
                  <span class="row"><VerdictBadge verdict={verdictOf(run.verdict)} /><span class="strong">{t('runsui.karat', { karat: run.purity.karat })}</span></span>
                {:else}
                  <span class="small muted">{t('runsui.notFull')}</span>
                {/if}
              </td>
              <td class="small">{counts(run)}</td>
              <td class="num">{duration(run)}</td>
              <td><span class="stack">{#if run.commit}<span class="val"><bdi dir="ltr">{run.commit.slice(0, 7)}</bdi></span>{:else}<span class="small muted">—</span>{/if}{#if run.profileVersion}<span class="small muted">{t('runsui.profile', { version: run.profileVersion })}</span>{/if}</span></td>
              <td>
                <span class="row end">
                  {#if run.keepForever}
                    <button type="button" class="kept small muted" onclick={() => void keep(run)}><Icon name="archive" size={12} />{t('runsui.kept')}</button>
                  {:else}
                    <Button kind="quiet" disabled={isActive(run)} onclick={() => void keep(run)}>{t('runsui.keep')}</Button>
                  {/if}
                  <Button kind="quiet" disabled={isActive(run)} onclick={() => void remove(run)}>{t('runsui.delete')}</Button>
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="small muted">{t('runsui.footer')}</p>
    {:else}
      <p class="small muted">{t('runsui.empty')}</p>
    {/if}
  </section>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-24);
    padding: var(--space-24) var(--space-32);
  }
  .title-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-12);
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .title {
    margin: 0;
    font: var(--type-title-page);
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
  tr.selected {
    background: var(--bg-sunken);
  }
  .stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .row {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .end {
    flex-wrap: nowrap;
    justify-content: flex-end;
    white-space: nowrap;
  }
  .link {
    border: 0;
    cursor: pointer;
  }
  .link:focus-visible,
  .kept:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .kept {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .spacer {
    flex: 1;
  }
  .strong {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .small {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-primary);
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
