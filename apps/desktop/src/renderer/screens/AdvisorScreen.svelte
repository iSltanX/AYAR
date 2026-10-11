<script lang="ts">
  // Screen 17 · «اقترح فحوصًا لتغيير» (C-20, 28.1–28.2; Figma 17.3 inputs, 17.4 outputs): the change described
  // with what the owner knows — every input optional but the situation, «لا أعرف» leaving a key absent (the advisor
  // then shows its assumption and the range it opens, never a silent default) — and the advice: the risk level with
  // its lines, the depth and when it is complete, the suggested checks to run, the suggested cards to create, the
  // questions that narrow the unknown, what was left out and why, and the assumptions. A recommendation, never a
  // verdict: nothing runs until «شغّل هذه», and the results come from that run.
  import {
    ADVISOR_AREAS,
    ADVISOR_AUDIENCES,
    ADVISOR_AUTOMATION,
    ADVISOR_EVIDENCE,
    ADVISOR_EXPECTED,
    ADVISOR_FACTORS,
    ADVISOR_FREQUENCY,
    ADVISOR_IMPACTS,
    ADVISOR_PLATFORMS,
    ADVISOR_REVERSIBILITY,
    ADVISOR_SCOPES,
    ADVISOR_SITUATIONS,
    ADVISOR_STAGES,
    ADVISOR_TIME,
    type AdvisorContext,
    type AdvisorResult,
    type CheckSpec,
  } from '@ayar/protocol';
  import { untrack } from 'svelte';
  import Button from '../components/Button.svelte';
  import Checkbox from '../components/Checkbox.svelte';
  import CostTag from '../components/CostTag.svelte';
  import Icon from '../components/Icon.svelte';
  import Select from '../components/Select.svelte';
  import TextField from '../components/TextField.svelte';
  import { useLocale } from '../lib/locale.ts';
  import { runSelection } from '../app/actions.ts';
  import { explanationText, valueLabel } from '../app/advisor.ts';
  import { attempt } from '../app/client.ts';
  import { checkTitle, costOf } from '../app/format.ts';
  import { useApp } from '../app/state.svelte.ts';

  let { projectId, mode }: { projectId: string; mode: 'inputs' | 'outputs' } = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  // ── 17.3 the inputs ────────────────────────────────────────────────────────────────────────────────────────
  const UNKNOWN = '';
  // The form opens on the context it last suggested for (the page is keyed by project and mode).
  const kept = untrack(() => (app.advisor?.projectId === projectId ? app.advisor.context : null));
  let situation = $state<string>(kept?.situation ?? UNKNOWN);
  let expected = $state<string>(kept?.expected ?? UNKNOWN);
  let areas = $state<string[]>(kept?.areas ?? []);
  let impact = $state<string>(kept?.impact ? String(kept.impact) : UNKNOWN);
  let audience = $state<string>(kept?.audience ?? UNKNOWN);
  let reversibility = $state<string>(kept?.reversibility ?? UNKNOWN);
  let scope = $state<string>(kept?.scope ?? UNKNOWN);
  let factors = $state<string[]>(kept?.factors ?? []);
  let evidence = $state<string>(kept?.evidence ?? UNKNOWN);
  let automation = $state<string>(kept?.automation ?? UNKNOWN);
  let flaky = $state<boolean>(kept?.flaky ?? false);
  let platform = $state<string>(kept?.platform?.[0] ?? UNKNOWN);
  let stack = $state<string>(kept?.stack ?? '');
  let stage = $state<string>(kept?.stage ?? UNKNOWN);
  let frequency = $state<string>(kept?.frequency ?? UNKNOWN);
  let time = $state<string>(kept?.time ?? UNKNOWN);

  const options = (key: string, values: readonly (string | number)[], unknown = true) => [...(unknown ? [{ value: UNKNOWN, label: t('tasksui.advisor.unknown') }] : []), ...values.map((v) => ({ value: String(v), label: valueLabel(t, lang, key, v) }))];
  const situationOptions = $derived([{ value: UNKNOWN, label: t('tasksui.advisor.choose') }, ...ADVISOR_SITUATIONS.map((v) => ({ value: v, label: valueLabel(t, lang, 'situation', v) }))]);
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));

  function context(): AdvisorContext {
    const c: Record<string, unknown> = { situation };
    if (areas.length) c.areas = areas;
    if (expected) c.expected = expected;
    if (impact) c.impact = Number(impact);
    if (audience) c.audience = audience;
    if (reversibility) c.reversibility = reversibility;
    if (scope) c.scope = scope;
    if (factors.length) c.factors = factors;
    if (evidence) c.evidence = evidence;
    if (automation) c.automation = automation;
    if (flaky) c.flaky = true;
    if (platform) c.platform = [platform];
    if (stack.trim()) c.stack = stack.trim();
    if (stage) c.stage = stage;
    if (frequency) c.frequency = frequency;
    if (time) c.time = time;
    return c as AdvisorContext;
  }
  let error = $state<string | null>(null);
  let busy = $state(false);
  async function suggest(): Promise<void> {
    if (!situation || busy) return;
    busy = true;
    error = null;
    const c = context();
    const r = await attempt('advisor.suggest', { projectId, context: c });
    busy = false;
    if (!r.ok) {
      const issue = (r.error.details as { issues?: { path?: (string | number)[]; message?: string }[] } | undefined)?.issues?.[0];
      error = t('tasksui.advisor.invalid', { field: String(issue?.path?.at(-1) ?? ''), detail: issue?.message ?? r.error.code });
      return;
    }
    app.advisor = { projectId, context: c, result: r.result };
    app.navigate({ name: 'tasks', projectId, advisor: 'outputs' });
  }

  // ── 17.4 the advice ────────────────────────────────────────────────────────────────────────────────────────
  const advice = $derived<AdvisorResult | null>(app.advisor?.projectId === projectId ? app.advisor.result : null);
  const given = $derived(app.advisor?.context ?? null);
  const ex = (x: Parameters<typeof explanationText>[2]) => explanationText(t, lang, x);
  const levelText = (l: string) => valueLabel(t, lang, 'level', l);
  const outTitle = $derived.by(() => {
    if (!given) return '';
    const s = valueLabel(t, lang, 'situation', given.situation);
    const a = (given.areas ?? []).map((x) => valueLabel(t, lang, 'areas', x));
    return a.length ? t('tasksui.out.titleAreas', { situation: s, areas: a.join(lang === 'ar' ? ` ${String.fromCharCode(0x648)}` : ', ') }) : t('tasksui.out.title', { situation: s });
  });
  let specs = $state<CheckSpec[]>([]);
  $effect(() => {
    if (mode !== 'outputs') return;
    void attempt('profile.get', { projectId }).then((p) => {
      if (p.ok) specs = p.result.checks;
    });
  });
  const specOf = (check: string) => specs.find((s) => s.checkId === check && s.applicable);
  let checksOn = $state<Record<string, boolean>>({});
  let cardsOn = $state<Record<string, boolean>>({});
  $effect(() => {
    if (!advice) return;
    checksOn = Object.fromEntries(advice.suggestedChecks.map((c) => [c.check, true]));
    cardsOn = Object.fromEntries(advice.items.filter((i) => i.card).map((i) => [i.id, i.priority < 3]));
  });
  const cardItems = $derived((advice?.items ?? []).filter((i) => i.card));
  const chosenCards = $derived(cardItems.filter((i) => cardsOn[i.id]));
  async function runThese(): Promise<void> {
    const instances = (advice?.suggestedChecks ?? []).filter((c) => checksOn[c.check]).map((c) => specOf(c.check)?.instance).filter((x): x is string => !!x);
    if (instances.length) await runSelection(app, projectId, { kind: 'advisor', instances });
  }
  async function createCards(): Promise<void> {
    if (!given) return;
    let made = 0;
    for (const i of chosenCards) {
      const r = await attempt('task.create', { projectId, source: { kind: 'advisorItem', itemId: i.id, context: given } });
      if (r.ok) made++;
    }
    if (made) {
      app.announce(t('tasksui.out.created', { count: made }));
      cardsOn = {};
    }
  }
  const ruleText = (rule: string, weight: number) => t('tasksui.out.weight', { reason: advice?.text.rules[rule] ?? rule, weight });
  const itemTitle = (id: string) => advice?.text.items[id]?.title ?? id;
  const questionText = (key: string) => t(`advisor.input.${key}.question` as Parameters<typeof t>[0]);
</script>

{#if mode === 'inputs'}
  <div class="page" data-testid="advisor-inputs">
    <header class="header">
      <div class="title-row"><h1 class="title">{t('tasksui.advisor.title')}</h1><span class="spacer"></span><CostTag cost="local" /></div>
      <p class="small muted">{t('tasksui.advisor.intro')}</p>
    </header>

    <section class="card">
      <h2 class="card-title">{t('tasksui.advisor.section.situation')}</h2>
      <div class="grid">
        <label class="field"><span>{t('advisor.input.situation.question')}</span><Select bind:value={situation} options={situationOptions} width="fill" /></label>
        <label class="field"><span>{t('advisor.input.expected.question')}</span><Select bind:value={expected} options={options('expected', ADVISOR_EXPECTED)} width="fill" /></label>
      </div>
      <fieldset class="checks"><legend>{t('advisor.input.areas.question')}</legend>
        {#each ADVISOR_AREAS as a (a)}<Checkbox label={valueLabel(t, lang, 'areas', a)} checked={areas.includes(a)} onchange={(on: boolean) => (areas = toggle(areas, a, on))} />{/each}
        <Checkbox label={t('tasksui.advisor.unknown')} checked={areas.length === 0} onchange={(on: boolean) => on && (areas = [])} />
      </fieldset>
    </section>

    <section class="card">
      <h2 class="card-title">{t('tasksui.advisor.section.consequence')}</h2>
      <div class="grid">
        <label class="field"><span>{t('advisor.input.impact.question')}</span><Select bind:value={impact} options={options('impact', ADVISOR_IMPACTS)} width="fill" /></label>
        <label class="field"><span>{t('advisor.input.audience.question')}</span><Select bind:value={audience} options={options('audience', ADVISOR_AUDIENCES)} width="fill" /></label>
        <label class="field"><span>{t('advisor.input.reversibility.question')}</span><Select bind:value={reversibility} options={options('reversibility', ADVISOR_REVERSIBILITY)} width="fill" /></label>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">{t('tasksui.advisor.section.likelihood')}</h2>
      <div class="grid">
        <label class="field"><span>{t('advisor.input.scope.question')}</span><Select bind:value={scope} options={options('scope', ADVISOR_SCOPES)} width="fill" /></label>
      </div>
      <fieldset class="checks"><legend>{t('advisor.input.factors.question')}</legend>
        {#each ADVISOR_FACTORS as f (f)}<Checkbox label={valueLabel(t, lang, 'factors', f)} checked={factors.includes(f)} onchange={(on: boolean) => (factors = toggle(factors, f, on))} />{/each}
        <Checkbox label={t('tasksui.advisor.unknown')} checked={factors.length === 0} onchange={(on: boolean) => on && (factors = [])} />
      </fieldset>
    </section>

    <section class="card">
      <h2 class="card-title">{t('tasksui.advisor.section.evidence')}</h2>
      <div class="grid">
        <label class="field"><span>{t('advisor.input.evidence.question')}</span><Select bind:value={evidence} options={options('evidence', ADVISOR_EVIDENCE)} width="fill" /></label>
        <label class="field"><span>{t('advisor.input.automation.question')}</span><Select bind:value={automation} options={options('automation', ADVISOR_AUTOMATION)} width="fill" /></label>
      </div>
      <Checkbox label={t('advisor.input.flaky.question')} bind:checked={flaky} />
    </section>

    <section class="card">
      <h2 class="card-title">{t('tasksui.advisor.section.project')}</h2>
      <div class="grid">
        <label class="field"><span>{t('advisor.input.platform.question')}</span><Select bind:value={platform} options={options('platform', ADVISOR_PLATFORMS)} width="fill" /></label>
        <label class="field"><span>{t('advisor.input.stack.question')}</span><TextField bind:value={stack} width="fill" maxlength={300} /></label>
        <label class="field"><span>{t('advisor.input.stage.question')}</span><Select bind:value={stage} options={options('stage', ADVISOR_STAGES)} width="fill" /></label>
        <label class="field"><span>{t('advisor.input.frequency.question')}</span><Select bind:value={frequency} options={options('frequency', ADVISOR_FREQUENCY)} width="fill" /></label>
        <label class="field"><span>{t('advisor.input.time.question')}</span><Select bind:value={time} options={options('time', ADVISOR_TIME)} width="fill" /></label>
      </div>
    </section>

    {#if error}<p class="small" role="alert">{error}</p>{/if}
    <div class="footer">
      <p class="small muted">{t('tasksui.advisor.footer')}</p>
      <span class="spacer"></span>
      <Button kind="secondary" onclick={() => app.navigate({ name: 'tasks', projectId, advisor: null })}>{t('ui.action.cancel')}</Button>
      <Button kind="primary" icon="scan-search" disabled={!situation || busy} onclick={() => void suggest()}>{t('tasksui.advisor.suggest')}</Button>
    </div>
  </div>
{:else if advice}
  <div class="page" data-testid="advisor-outputs">
    <header class="header">
      <div class="title-row"><h1 class="title">{outTitle}</h1><span class="spacer"></span><Button kind="secondary" onclick={() => app.navigate({ name: 'tasks', projectId, advisor: 'inputs' })}>{t('tasksui.out.edit')}</Button></div>
      <p class="small muted">{t('tasksui.out.subtitle')}</p>
    </header>

    <div class="pair">
      <section class="card">
        <p class="small muted">{t('tasksui.out.risk')}</p>
        <p class="big">{advice.risk.range.min === advice.risk.range.max ? levelText(advice.risk.level) : t('tasksui.out.range', { min: levelText(advice.risk.range.min), max: levelText(advice.risk.range.max) })}</p>
        <dl class="lines">
          {#if advice.risk.lines.impact.length}<dt>{t('tasksui.out.impact')}</dt><dd>{advice.risk.lines.impact.map(ex).join(' ')}</dd>{/if}
          {#if advice.risk.lines.likelihood.length}<dt>{t('tasksui.out.likelihood')}</dt><dd>{advice.risk.lines.likelihood.map(ex).join(' ')}</dd>{/if}
          {#if advice.risk.lines.detection.length}<dt>{t('tasksui.out.detection')}</dt><dd>{advice.risk.lines.detection.map(ex).join(' ')}</dd>{/if}
        </dl>
        {#if advice.risk.range.min !== advice.risk.range.max && advice.questions.length}<p class="small muted">{t('tasksui.out.rangeNote', { questions: advice.questions.map((q) => `«${questionText(q)}»`).join(lang === 'ar' ? `${String.fromCharCode(0x60c)} ` : ', ') })}</p>{/if}
      </section>
      <section class="card">
        <p class="small muted">{t('tasksui.out.depth')}</p>
        <p class="big">{advice.text.depth.name}</p>
        <p class="small muted">{advice.text.depth.description}</p>
        {#each advice.depth.notes as n, i (i)}<p class="small">{ex(n)}</p>{/each}
        <p class="strong">{t('tasksui.out.completion')}</p>
        <p class="small pre">{advice.depth.completion}</p>
        {#if advice.noNewTests}<p class="small">{t('tasksui.out.noNewTests')}</p>{/if}
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2 class="card-title">{t('tasksui.out.checks', { count: advice.suggestedChecks.length })}</h2><span class="spacer"></span><Button kind="primary" icon="play" disabled={!advice.suggestedChecks.some((c) => checksOn[c.check] && specOf(c.check))} onclick={() => void runThese()}>{t('tasksui.out.run')}</Button></div>
      {#if advice.suggestedChecks.length}
        <table class="ptable">
          <thead><tr><th scope="col">{t('scanplan.column.check')}</th><th scope="col">{t('tasksui.out.why')}</th><th scope="col">{t('tasksui.out.cost')}</th></tr></thead>
          <tbody>
            {#each advice.suggestedChecks as c (c.check)}
              {@const s = specOf(c.check)}
              <tr>
                <td><span class="with-box"><Checkbox label={checkTitle(t, lang, c.check)} showLabel={false} disabled={!s} checked={!!checksOn[c.check] && !!s} onchange={(on: boolean) => (checksOn = { ...checksOn, [c.check]: on })} /><span class="stack"><span class="strong">{checkTitle(t, lang, c.check)}</span><bdi class="mono muted" dir="ltr">{c.check}</bdi></span></span></td>
                <td class="small">{c.items.map(itemTitle).join(lang === 'ar' ? `${String.fromCharCode(0x61b)} ` : '; ')}</td>
                <td>{#if s}<CostTag cost={costOf(s.network, s.cost)} />{:else}<span class="small muted">{t('tasksui.out.notInProfile')}</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="small muted">{t('tasksui.out.none')}</p>
      {/if}
    </section>

    <section class="card">
      <div class="card-head"><h2 class="card-title">{t('tasksui.out.cards', { count: cardItems.length })}</h2><span class="spacer"></span><Button kind="secondary" icon="plus" disabled={!chosenCards.length} onclick={() => void createCards()}>{t('tasksui.out.create', { count: chosenCards.length })}</Button></div>
      {#if cardItems.length}
        <table class="ptable">
          <thead><tr><th scope="col">{t('tasksui.by.priority')}</th><th scope="col">{t('tasksui.out.card')}</th><th scope="col">{t('tasksui.out.reason')}</th></tr></thead>
          <tbody>
            {#each cardItems as i (i.id)}
              <tr>
                <td><span class="with-box"><Checkbox label={itemTitle(i.id)} showLabel={false} checked={!!cardsOn[i.id]} onchange={(on: boolean) => (cardsOn = { ...cardsOn, [i.id]: on })} /><span class="val">{t(`tasksui.p.${i.priority}`)}</span></span></td>
                <td>{itemTitle(i.id)}</td>
                <td class="small">{i.contributions.map((c) => ruleText(c.rule, c.weight)).join(lang === 'ar' ? `${String.fromCharCode(0x61b)} ` : '; ')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="small muted">{t('tasksui.out.none')}</p>
      {/if}
    </section>

    <div class="triple">
      <section class="card">
        <h2 class="card-title">{t('tasksui.out.questions')}</h2>
        {#each advice.questions as q (q)}<p class="small">• {questionText(q)}</p>{:else}<p class="small muted">{t('tasksui.out.none')}</p>{/each}
      </section>
      <section class="card">
        <h2 class="card-title">{t('tasksui.out.omitted')}</h2>
        {#each advice.omitted as o (o.id)}<p class="small">• <strong>{itemTitle(o.id)}</strong>: {o.facts.map(ex).join(' ')} {o.hint}</p>{:else}<p class="small muted">{t('tasksui.out.none')}</p>{/each}
      </section>
      <section class="card">
        <h2 class="card-title">{t('tasksui.out.assumptions')}</h2>
        {#each advice.input.assumed as a (a.key)}<p class="small">• {ex(a.why)}</p>{:else}<p class="small muted">{t('tasksui.out.none')}</p>{/each}
      </section>
    </div>

    {#if advice.budget?.warning}<p class="banner"><Icon name="info" size={16} />{ex(advice.budget.warning)}</p>{/if}
  </div>
{:else}
  <div class="page"><p class="small muted">{t('tasksui.empty')}</p></div>
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
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
    min-inline-size: 0;
  }
  .card-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-12) var(--space-24);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    font: var(--type-label);
    color: var(--text-primary);
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8) var(--space-16);
    margin: 0;
    padding: 0;
    border: 0;
  }
  .checks legend {
    margin-block-end: var(--space-8);
    padding: 0;
    font: var(--type-label);
    color: var(--text-primary);
  }
  .footer {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-16);
  }
  .triple {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-16);
  }
  .big {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .lines {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-8) var(--space-16);
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .lines dt {
    font: var(--type-body-strong);
  }
  .lines dd {
    margin: 0;
  }
  .with-box {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
    padding: var(--space-12) var(--space-16);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-card);
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .spacer {
    flex: 1;
  }
  .strong {
    margin: 0;
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .small {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .pre {
    white-space: pre-line;
  }
  .muted {
    color: var(--text-secondary);
  }
  .mono {
    font: var(--type-mono);
  }
  .val {
    padding: 1px var(--space-8);
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
