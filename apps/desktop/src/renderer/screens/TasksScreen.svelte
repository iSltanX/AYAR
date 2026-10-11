<script lang="ts">
  // Screen 17 · المهام (13.3, 12.8; Figma 17.1 «لك», 17.2 «للنموذج»): the cards of the project grouped by status (or
  // priority, or next step), each with its name, place, status, priority and next step; and the chosen card: its
  // type, priority and source, its lifecycle (مفتوحة ← نُسخت ← بانتظار التحقق ← متحققة, or مغلقة بقرار), «انسخ
  // للنموذج» (the whole card, as the model reads it), and either what it asks, why and how it closes, or its text.
  // A card closes only by evidence from a re-run (the engine's «متحققة») or by the owner's decision with a reason.
  import type { TaskRecord } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import CopyForModelBar from '../components/CopyForModelBar.svelte';
  import Icon from '../components/Icon.svelte';
  import Select from '../components/Select.svelte';
  import Sheet from '../components/Sheet.svelte';
  import SheetField from '../components/SheetField.svelte';
  import Tag from '../components/Tag.svelte';
  import TextField from '../components/TextField.svelte';
  import { useLocale } from '../lib/locale.ts';
  import type { ReportView } from '../lib/results.ts';
  import { attempt } from '../app/client.ts';
  import { useApp } from '../app/state.svelte.ts';

  let { projectId }: { projectId: string } = $props();
  const app = useApp();
  const { t } = useLocale();

  let tasks = $state<TaskRecord[]>([]);
  let selectedId = $state<string | null>(null);
  async function load(): Promise<void> {
    const r = await attempt('tasks.list', { projectId });
    if (!r.ok) return;
    tasks = r.result.tasks;
    if (!selectedId || !tasks.some((x) => x.id === selectedId)) selectedId = tasks.find((x) => x.status === 'open')?.id ?? tasks[0]?.id ?? null;
  }
  $effect(() => {
    void load();
  });
  const selected = $derived(tasks.find((x) => x.id === selectedId) ?? null);

  // ── the list ───────────────────────────────────────────────────────────────────────────────────────────────
  type By = 'status' | 'priority' | 'nextStep';
  let by = $state<By>('status');
  const STATUS_ORDER = ['open', 'copied', 'awaiting_verification', 'verified', 'closed'] as const;
  const STATUS_KEY = { open: 'status.card.open', copied: 'status.card.copied', awaiting_verification: 'status.card.awaitingVerification', verified: 'status.card.verified', closed: 'status.card.closedByDecision' } as const;
  const STATUS_ICON = { open: 'clipboard-list', copied: 'copy', awaiting_verification: 'clock', verified: 'check-check', closed: 'archive' } as const;
  const NEXT_KEY = { direct: 'ui.nextStep.handleDirectly', model: 'ui.nextStep.needsModel', review: 'ui.nextStep.needsReview' } as const;
  const groups = $derived.by(() => {
    if (by === 'status') return STATUS_ORDER.map((s) => ({ key: s, label: t(STATUS_KEY[s]), items: tasks.filter((x) => x.status === s) })).filter((g) => g.items.length);
    if (by === 'priority') return ([1, 2, 3] as const).map((p) => ({ key: `p${p}`, label: t(`tasksui.p.${p}`), items: tasks.filter((x) => x.card.priority === p) })).filter((g) => g.items.length);
    return (['direct', 'model', 'review'] as const).map((n) => ({ key: n, label: t(NEXT_KEY[n]), items: tasks.filter((x) => x.card.nextStep === n) })).filter((g) => g.items.length);
  });
  const nameOf = (x: TaskRecord) => x.card.name.split(' — ')[0] ?? x.card.name;
  const typeOf = (x: TaskRecord) => x.card.name.split(':')[0] ?? x.card.type;
  const places = (x: TaskRecord) => [x.follows && x.card.source.kind === 'fixVerification' ? x.follows : null, x.card.location].filter((p): p is string => !!p);

  // ── the chosen card ────────────────────────────────────────────────────────────────────────────────────────
  let view = $state<ReportView>('for-you');
  const LIFECYCLE = ['open', 'copied', 'awaiting_verification', 'verified'] as const;
  const { lang } = useLocale();
  const listSep = $derived(lang === 'ar' ? `${String.fromCharCode(0x60c)} ` : ', ');
  async function update(status: 'copied' | 'awaiting_verification' | 'open'): Promise<void> {
    if (!selected) return;
    const r = await attempt('task.update', { taskId: selected.id, patch: { status } });
    if (r.ok) await load();
  }
  async function verify(): Promise<void> {
    const r = await attempt('tasks.verify', { projectId });
    if (r.ok) await load();
  }
  let closing = $state(false);
  let reason = $state('');
  async function close(): Promise<void> {
    if (!selected || !reason.trim()) return;
    const r = await attempt('task.update', { taskId: selected.id, patch: { status: 'closed', closeReason: reason.trim() } });
    closing = false;
    reason = '';
    if (r.ok) await load();
  }
  async function copy(): Promise<void> {
    if (!selected) return;
    const r = await attempt('clipboard.copy', { kind: 'card', id: selected.id });
    if (r.ok && selected.status === 'open') await update('copied');
  }
</script>

<div class="page" data-testid="tasks">
  <header class="header">
    <div class="title-row">
      <div class="titles">
        <h1 class="title">{t('tasksui.title')}</h1>
        <p class="small muted">{t('tasksui.subtitle')}</p>
      </div>
      <span class="spacer"></span>
      <label class="group-by"><span class="small">{t('tasksui.groupBy')}</span><Select bind:value={by} options={[{ value: 'status', label: t('tasksui.by.status') }, { value: 'priority', label: t('tasksui.by.priority') }, { value: 'nextStep', label: t('tasksui.by.nextStep') }]} width={160} /></label>
      <Button kind="secondary" icon="scan-search" onclick={() => app.navigate({ name: 'tasks', projectId, advisor: 'inputs' })}>{t('tasksui.suggest')}</Button>
    </div>
  </header>

  {#if tasks.length}
    <div class="split">
      <div class="list" role="listbox" aria-label={t('tasksui.title')}>
        {#each groups as g (g.key)}
          <p class="group small muted">{t('tasksui.groupCount', { label: g.label, count: g.items.length })}</p>
          {#each g.items as x (x.id)}
            <button type="button" class="card-item" class:selected={x.id === selectedId} role="option" aria-selected={x.id === selectedId} onclick={() => (selectedId = x.id)}>
              <span class="row"><span class="strong">{nameOf(x)}</span><span class="spacer"></span><span class="val"><bdi dir="ltr">{x.displayId}</bdi></span></span>
              {#if places(x).length}<span class="row">{#each places(x) as p (p)}<span class="val"><bdi dir="ltr">{p}</bdi></span>{/each}</span>{/if}
              <span class="row">
                <Tag icon={STATUS_ICON[x.status]}>{x.status === 'closed' && x.closeReason ? t('tasksui.closedBecause', { reason: x.closeReason }) : t(STATUS_KEY[x.status])}</Tag>
                <Tag>{t('tasksui.priority', { priority: t(`tasksui.p.${x.card.priority}`) })}</Tag>
                {#if x.status === 'verified' && x.verification?.strength === 'unproven'}<Tag icon="flask-conical-off">{t('ui.testStrength.unverified')}</Tag>{:else if x.status !== 'verified' && x.status !== 'closed'}<Tag>{t(NEXT_KEY[x.card.nextStep])}</Tag>{/if}
              </span>
            </button>
          {/each}
        {/each}
      </div>

      <section class="detail" aria-label={selected ? nameOf(selected) : t('tasksui.pick')}>
        {#if selected}
          <div class="row"><h2 class="detail-title">{nameOf(selected)}</h2><span class="spacer"></span><span class="val"><bdi dir="ltr">{selected.displayId}</bdi></span></div>
          <p class="row small muted">{t('tasksui.meta', { type: typeOf(selected), priority: t(`tasksui.p.${selected.card.priority}`), source: t(`tasksui.source.${selected.card.source.kind}`) })}{#if selected.follows}<span class="val"><bdi dir="ltr">{selected.follows}</bdi></span>{/if}</p>
          <p class="row small muted">
            <span>{t('tasksui.lifecycle')}</span>
            {#each LIFECYCLE as s (s)}
              <span class="stage" class:current={selected.status === s}>{#if selected.status === s}<Icon name={STATUS_ICON[s]} size={12} />{/if}{t(STATUS_KEY[s])}</span>
            {/each}
          </p>
          <CopyForModelBar context="card-preview" tabs {view} characters={selected.card.text.length} redactions={0} oncopy={() => void copy()} onviewchange={(v: ReportView) => (view = v)} />
          {#if view === 'for-you'}
            <h3 class="sub">{t('tasksui.what')}</h3>
            <p class="body">{selected.card.subject}{selected.card.location ? ` — ${selected.card.location}` : ''}</p>
            {#if selected.card.expected === null}<p class="small muted">{t('tasksui.expectedOwner')}</p>{/if}
            <h3 class="sub">{t('tasksui.why')}</h3>
            <p class="body">{selected.card.why}</p>
            <h3 class="sub">{t('tasksui.howCloses')}</h3>
            <p class="body">{selected.card.verify.length ? t('tasksui.closesBy', { checks: selected.card.verify.join(listSep) }) : t('tasksui.closesByDecision')}</p>
            {#if selected.status === 'awaiting_verification' && selected.verification?.reasons.length}
              <p class="small muted">{t('tasksui.verifyReasons')}</p>
              {#each selected.verification.reasons as r (r)}<p class="small">{t(r as Parameters<typeof t>[0])}</p>{/each}
            {/if}
          {:else}
            <p class="small muted">{t('tasksui.modelNote')}</p>
            <pre class="model-text">{selected.card.text}</pre>
          {/if}
          <div class="actions">
            {#if selected.status === 'open'}<Button kind="secondary" onclick={() => void update('copied')}>{t('tasksui.markCopied')}</Button>{/if}
            {#if selected.status === 'copied'}<Button kind="secondary" onclick={() => void update('awaiting_verification')}>{t('tasksui.markAwaiting')}</Button>{/if}
            {#if selected.status === 'awaiting_verification'}<Button kind="secondary" onclick={() => void verify()}>{t('tasksui.verify')}</Button>{/if}
            {#if selected.status === 'closed'}<Button kind="secondary" onclick={() => void update('open')}>{t('tasksui.reopen')}</Button>{/if}
            {#if selected.status !== 'closed' && selected.status !== 'verified'}<Button kind="quiet" onclick={() => (closing = true)}>{t('tasksui.close')}</Button>{/if}
          </div>
        {:else}
          <p class="small muted">{t('tasksui.pick')}</p>
        {/if}
      </section>
    </div>
  {:else}
    <p class="small muted">{t('tasksui.empty')}</p>
  {/if}
</div>

<Sheet title={t('tasksui.closeTitle')} open={closing} oncancel={() => (closing = false)}>
  <SheetField label={t('tasksui.closeReason')} for="close-reason">
    <TextField id="close-reason" bind:value={reason} width="fill" placeholder={t('tasksui.closeReasonHint')} />
  </SheetField>
  {#snippet footer()}
    <Button kind="secondary" onclick={() => (closing = false)}>{t('ui.action.cancel')}</Button>
    <Button kind="primary" disabled={!reason.trim()} onclick={() => void close()}>{t('tasksui.close')}</Button>
  {/snippet}
</Sheet>

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
  .group-by {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
  }
  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-24);
    align-items: start;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .group {
    margin: var(--space-8) 0 0;
  }
  .card-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding: var(--space-12) var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
    color: var(--text-primary);
    text-align: start;
    cursor: pointer;
  }
  .card-item.selected {
    border-color: var(--border-strong);
    background: var(--bg-sunken);
  }
  .card-item:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .detail {
    position: sticky;
    inset-block-start: var(--space-16);
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .detail-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .sub {
    margin: var(--space-8) 0 0;
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .body {
    margin: 0;
    font: var(--type-body);
    color: var(--text-primary);
  }
  .model-text {
    margin: 0;
    padding: var(--space-12) var(--space-16);
    border-radius: var(--radius-control);
    background: var(--bg-sunken);
    font: var(--type-body);
    color: var(--text-primary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    unicode-bidi: plaintext;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
  }
  .stage {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    padding: 1px var(--space-8);
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
  }
  .stage.current {
    color: var(--text-primary);
    font-weight: 600;
  }
  .actions {
    display: flex;
    gap: var(--space-8);
    justify-content: flex-start;
  }
  .spacer {
    flex: 1;
  }
  .strong {
    font: var(--type-body-strong);
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
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
