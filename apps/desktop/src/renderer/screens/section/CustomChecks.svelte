<script lang="ts">
  // Screen 9.2 · فحوص مخصصة (13.3; Figma 179:16210): the project's own checks, which AYAR does not know (10.3) — each
  // with its literal command and what running it does, its readiness and latest result, «شغّل», and a dangerous one
  // approved alone (FR-56, AT-05); the form «أضف فحصًا مخصصًا» (its name and id, the command as a program and separate
  // arguments, the folder, the time limit, the success criterion — an exit code, with an optional text the output must
  // hold — and an optional JUnit or SARIF report); and the saved groups (D-45), which the run menu lists too.
  import type { CheckSpec, CustomCheck, SavedGroup } from '@ayar/protocol';
  import ArgumentEditor from '../../components/ArgumentEditor.svelte';
  import Button from '../../components/Button.svelte';
  import Checkbox from '../../components/Checkbox.svelte';
  import CommandBlock from '../../components/CommandBlock.svelte';
  import CostTag from '../../components/CostTag.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import RadioGroup from '../../components/RadioGroup.svelte';
  import ReadinessBadge from '../../components/ReadinessBadge.svelte';
  import ResultBadge from '../../components/ResultBadge.svelte';
  import RiskNotice from '../../components/RiskNotice.svelte';
  import Select from '../../components/Select.svelte';
  import SelectionBar from '../../components/SelectionBar.svelte';
  import SheetField from '../../components/SheetField.svelte';
  import SheetSaveGroup from '../../components/SheetSaveGroup.svelte';
  import TableHeaderCell from '../../components/TableHeaderCell.svelte';
  import Tag from '../../components/Tag.svelte';
  import TextField from '../../components/TextField.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { attempt, copyText } from '../../app/client.ts';
  import { badgeOf, checkTitle, dayMonth, readinessOf } from '../../app/format.ts';
  import { readinessOfInstance, type SectionModel } from '../../app/sections.ts';
  import { commandOf } from '../../app/specs.ts';

  interface Props {
    projectId: string;
    model: SectionModel;
    selected: string[];
    oninspect: (instance: string) => void;
    onchanged: () => void;
    onrun: (instance: string) => void;
    onrunselected: () => void;
    onrungroup: (groupId: string) => void;
  }
  let { projectId, model, selected = $bindable(), oninspect, onchanged, onrun, onrunselected, onrungroup }: Props = $props();
  const { t, lang } = useLocale();
  const uid = $props.id();

  const checks = $derived<CheckSpec[]>([...model.included, ...model.optional]);
  const pending = $derived(new Map(model.profile.pending.items.map((i) => [i.instance, i])));
  /** A dangerous command awaiting approval: approved alone, never in «اعتمد الكل» (FR-56). */
  const risky = $derived(checks.filter((s) => (pending.get(s.instance)?.approveAlone ?? false) && pending.get(s.instance)?.approvable));

  function toggle(instance: string, on: boolean): void {
    selected = on ? [...new Set([...selected, instance])] : selected.filter((x) => x !== instance);
  }

  async function approveAlone(instance: string): Promise<void> {
    const r = await attempt('profile.approve', { projectId, changeSetId: model.profile.pending.id, instances: [instance] });
    if (r.ok) onchanged();
  }

  // ── the saved groups (D-45) ──────────────────────────────────────────────────────────────────────────────
  let groups = $state<SavedGroup[]>([]);
  let groupSheet = $state<{ open: boolean; name: string; replacing: string | null }>({ open: false, name: '', replacing: null });
  async function loadGroups(): Promise<void> {
    const r = await attempt('groups.list', { projectId });
    if (r.ok) groups = r.result.groups;
  }
  $effect(() => {
    void loadGroups();
  });
  async function saveGroup(name: string): Promise<void> {
    const replacing = groupSheet.replacing;
    groupSheet = { open: false, name: '', replacing: null };
    const r = await attempt('groups.save', { projectId, name, instanceKeys: [...selected] });
    if (!r.ok) return;
    if (replacing && replacing !== r.result.id) await attempt('groups.delete', { groupId: replacing });
    selected = [];
    await loadGroups();
  }
  /** «عدّل»: the group's checks become the selection, and the save sheet opens with its name; saving replaces it. */
  function editGroup(g: SavedGroup): void {
    selected = [...g.instances];
    groupSheet = { open: true, name: g.name, replacing: g.id };
  }
  async function deleteGroup(id: string): Promise<void> {
    const r = await attempt('groups.delete', { groupId: id });
    if (r.ok) await loadGroups();
  }

  // ── «أضف فحصًا مخصصًا» ──────────────────────────────────────────────────────────────────────────────────
  type ReportKind = 'none' | 'file';
  const EMPTY = { title: '', name: '', program: '', args: [] as string[], cwd: '.', timeout: '2', exit: '0' as '0' | 'other', otherCode: '1', contains: '', report: 'none' as ReportKind, reportPath: '' };
  let form = $state({ ...EMPTY, args: [] as string[] });
  let formError = $state<string | null>(null);
  let adding = $state(false);
  let formOpen = $state(false);

  const idValid = $derived(/^[a-z][a-z0-9-]{0,39}$/.test(form.name));
  const ready = $derived(form.title.trim() !== '' && idValid && form.program.trim() !== '' && (form.exit === '0' || /^\d{1,3}$/.test(form.otherCode)) && (form.report === 'none' || form.reportPath.trim() !== ''));

  async function addCheck(): Promise<void> {
    if (!ready || adding) return;
    adding = true;
    formError = null;
    const exitCode = form.exit === '0' ? 0 : Number(form.otherCode);
    const custom: CustomCheck = {
      title: form.title.trim(),
      argv: [form.program.trim(), ...form.args],
      cwd: form.cwd.trim() || '.',
      timeoutMin: Number(form.timeout),
      success: { exitCode, ...(form.contains ? { outputContains: form.contains } : {}), ...(form.report === 'file' ? { report: form.reportPath.trim() } : {}) },
    };
    const r = await attempt('profile.update', { projectId, patch: { custom: { [form.name]: custom } } });
    adding = false;
    if (!r.ok) {
      formError = t('sectionui.custom.error', { code: r.error.code });
      return;
    }
    form = { ...EMPTY, args: [] };
    formOpen = false;
    onchanged();
  }

  /** A custom check's id is `custom.<name>` (10.3): the prefix is part of the id, not text to translate. */
  const ID_PREFIX = 'custom.';
  const TIMEOUTS = [1, 2, 5, 10, 20, 30, 60] as const;
  const timeoutOptions = $derived(TIMEOUTS.map((m) => ({ value: String(m), label: t('sectionui.custom.minutes', { count: m }) })));
  const reportOptions = $derived([
    { value: 'none' as const, label: t('sectionui.custom.report.none') },
    { value: 'file' as const, label: t('sectionui.custom.report.file') },
  ]);
</script>

{#snippet checkName(spec: CheckSpec)}
  <span class="check">
    <span class="name">{checkTitle(t, lang, spec.checkId)}</span>
    <bdi class="id" dir="ltr">{spec.checkId}</bdi>
  </span>
{/snippet}

<section class="card" aria-labelledby="{uid}-title" data-testid="custom-checks">
  <div class="card-head">
    <h2 class="card-title" id="{uid}-title">{t('sectionui.custom.title', { count: checks.length })}</h2>
    <span class="spacer"></span>
    <Button kind="secondary" icon="plus" aria-expanded={formOpen} aria-controls="{uid}-form" onclick={() => (formOpen = !formOpen)}>{t('sectionui.custom.add')}</Button>
  </div>
  {#if checks.length}
    <table class="checks">
      <thead>
        <tr>
          <th class="c-box" scope="col"><span class="visually-hidden">{t('sectionui.column.select')}</span></th>
          <th class="c-check" scope="col"><TableHeaderCell native label={t('scanplan.column.check')} sortable={false} /></th>
          <th class="c-cmd" scope="col"><TableHeaderCell native label={t('scanplan.column.command')} sortable={false} /></th>
          <th class="c-ready" scope="col"><TableHeaderCell native label={t('scanplan.column.readiness')} sortable={false} /></th>
          <th class="c-result" scope="col"><TableHeaderCell native label={t('sectionui.column.lastResult')} sortable={false} /></th>
          <th class="c-actions" scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each checks as spec (spec.instance)}
          {@const exec = model.latest.get(spec.instance)}
          {@const command = commandOf(spec)}
          {@const isSelected = selected.includes(spec.instance)}
          {@const readiness = readinessOfInstance(model, spec)}
          <tr class:selected={isSelected} data-instance={spec.instance}>
            <td class="c-box"><Checkbox checked={isSelected} disabled={readiness !== 'ready'} label={t('sectionui.selectCheck', { check: checkTitle(t, lang, spec.checkId) })} showLabel={false} onchange={(on: boolean) => toggle(spec.instance, on)} /></td>
            <td class="c-check">{@render checkName(spec)}</td>
            <td class="c-cmd">{#if command}<CommandBlock {command} runsCode={spec.sideEffects.runsProjectCode} writes={spec.sideEffects.writesRepo === 'maybe'} network={spec.network === 'required'} oncopy={copyText} />{/if}</td>
            <td class="c-ready"><ReadinessBadge readiness={readinessOf(readiness)} size="sm" /></td>
            <td class="c-result">
              {#if exec?.check.outcome}
                <span class="result"><ResultBadge result={badgeOf(exec.check.outcome, { reviewed: !!exec.check.reviewId, reason: exec.check.outcomeReason })} size="sm" />{#if exec.check.finishedAt}<span class="date">{dayMonth(exec.check.finishedAt, lang)}</span>{/if}</span>
              {:else}
                <span class="muted">{t('sectionui.notRun')}</span>
              {/if}
            </td>
            <td class="c-actions">
              <span class="row-actions">
                <Button kind="quiet" disabled={readiness !== 'ready'} onclick={() => onrun(spec.instance)}>{t('sectionui.run')}</Button>
                <IconButton icon="panel-right" label={t('sectionui.inspect', { check: checkTitle(t, lang, spec.checkId) })} onclick={() => oninspect(spec.instance)} />
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#each risky as spec (spec.instance)}
      <div class="risk" data-instance={spec.instance}><RiskNotice onapprove={() => void approveAlone(spec.instance)} /></div>
    {/each}
    {#if selected.length}
      <div class="selection"><SelectionBar kind="checks" count={selected.length} onrun={onrunselected} onsavegroup={() => (groupSheet = { open: true, name: '', replacing: null })} onclear={() => (selected = [])} /></div>
    {/if}
  {:else}
    <p class="none">{t('sectionui.custom.empty')}</p>
  {/if}
</section>

{#if formOpen}
  <section class="card form" id="{uid}-form" aria-labelledby="{uid}-form-title" data-testid="custom-form">
    <div class="card-head">
      <h2 class="card-title" id="{uid}-form-title">{t('sectionui.custom.add')}</h2>
      <span class="spacer"></span>
      <CostTag cost="local" />
    </div>
    <div class="row two">
      <SheetField label={t('sectionui.custom.name')} for="{uid}-title-field"><TextField id="{uid}-title-field" bind:value={form.title} width="fill" /></SheetField>
      <SheetField label={t('sectionui.custom.id')} for="{uid}-id-field">
        <span class="id-field"><span class="prefix" dir="ltr">{ID_PREFIX}</span><TextField id="{uid}-id-field" bind:value={form.name} mono width="fill" aria-invalid={form.name !== '' && !idValid} /></span>
      </SheetField>
    </div>
    {#if form.name !== '' && !idValid}<p class="hint error">{t('sectionui.custom.idRule')}</p>{/if}
    <SheetField label={t('sectionui.custom.command')}>
      <ArgumentEditor bind:program={form.program} bind:args={form.args} />
    </SheetField>
    <div class="row three">
      <SheetField label={t('sectionui.custom.folder')} for="{uid}-cwd"><TextField id="{uid}-cwd" bind:value={form.cwd} mono width="fill" /></SheetField>
      <SheetField label={t('sectionui.custom.timeout')} for="{uid}-timeout"><Select id="{uid}-timeout" bind:value={form.timeout} options={timeoutOptions} width="fill" /></SheetField>
      <SheetField label={t('sectionui.custom.report')} for="{uid}-report"><Select id="{uid}-report" bind:value={form.report} options={reportOptions} width="fill" /></SheetField>
    </div>
    {#if form.report === 'file'}
      <SheetField label={t('sectionui.custom.reportPath')} for="{uid}-report-path"><TextField id="{uid}-report-path" bind:value={form.reportPath} mono width="fill" /></SheetField>
    {/if}
    <div class="success">
      <RadioGroup label={t('sectionui.custom.success')} bind:value={form.exit} options={[{ value: '0', label: t('sectionui.custom.exitZero') }, { value: 'other', label: t('sectionui.custom.exitOther') }]} />
      {#if form.exit === 'other'}<TextField bind:value={form.otherCode} mono width={96} label={t('sectionui.custom.exitCode')} />{/if}
    </div>
    <SheetField label={t('sectionui.custom.contains')} for="{uid}-contains"><TextField id="{uid}-contains" bind:value={form.contains} mono width="fill" /></SheetField>
    <p class="hint">{t('sectionui.custom.successNote')}</p>
    {#if formError}<p class="hint error" role="alert">{formError}</p>{/if}
    <div class="buttons">
      <Button kind="secondary" onclick={() => ((form = { ...EMPTY, args: [] }), (formOpen = false))}>{t('ui.action.cancel')}</Button>
      <Button kind="primary" disabled={!ready || adding} onclick={() => void addCheck()}>{t('sectionui.custom.submit')}</Button>
    </div>
  </section>
{/if}

<section class="card" aria-labelledby="{uid}-groups" data-testid="saved-groups">
  <div class="card-head">
    <h2 class="card-title" id="{uid}-groups">{t('sectionui.groups.title', { count: groups.length })}</h2>
    <span class="spacer"></span>
    <span class="summary">{t('sectionui.groups.note')}</span>
  </div>
  {#if groups.length}
    <table class="checks">
      <thead>
        <tr>
          <th class="g-name" scope="col"><TableHeaderCell native label={t('sectionui.groups.name')} sortable={false} /></th>
          <th class="g-checks" scope="col"><TableHeaderCell native label={t('sectionui.groups.checks')} sortable={false} /></th>
          <th class="g-actions" scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each groups as g (g.id)}
          <tr data-group={g.id}>
            <td class="g-name"><span class="check"><span class="name">{g.name}</span><span class="date">{t('sectionui.groups.count', { count: g.instances.length })}</span></span></td>
            <td class="g-checks"><span class="tags">{#each g.instances as i (i)}<Tag><bdi dir="ltr">{i.split('@')[0]}</bdi></Tag>{/each}</span></td>
            <td class="g-actions">
              <span class="row-actions">
                <Button kind="secondary" icon="play" onclick={() => onrungroup(g.id)}>{t('sectionui.run')}</Button>
                <Button kind="quiet" onclick={() => editGroup(g)}>{t('sectionui.groups.edit')}</Button>
                <Button kind="quiet" onclick={() => void deleteGroup(g.id)}>{t('sectionui.groups.delete')}</Button>
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="none">{t('sectionui.groups.empty')}</p>
  {/if}
</section>

<SheetSaveGroup open={groupSheet.open} name={groupSheet.name} checks={selected.map((i) => ({ id: i.split('@')[0]!, name: checkTitle(t, lang, i.split('@')[0]!) }))} onsave={(name: string) => void saveGroup(name)} oncancel={() => (groupSheet = { open: false, name: '', replacing: null })} />

<style>
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
  .spacer {
    flex: 1;
  }
  .summary,
  .hint {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .hint.error {
    color: var(--text-primary);
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
  tbody tr.selected {
    background: var(--bg-sunken);
  }
  .c-box {
    inline-size: 32px;
  }
  .c-cmd {
    inline-size: 340px;
  }
  .c-ready {
    inline-size: 130px;
  }
  .c-result {
    inline-size: 130px;
  }
  .c-actions {
    inline-size: 104px;
  }
  .g-checks {
    inline-size: 46%;
  }
  .g-actions {
    inline-size: 220px;
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
  .result,
  .row-actions,
  .tags {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
  }
  .result {
    gap: var(--space-8);
  }
  .date,
  .muted {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .risk {
    padding-block-start: var(--space-4);
  }
  .selection {
    display: flex;
    justify-content: center;
  }
  .none {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .row {
    display: grid;
    gap: var(--space-16);
  }
  .row.two {
    grid-template-columns: 1fr 1fr;
  }
  .row.three {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .id-field {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    direction: ltr;
  }
  .prefix {
    font: var(--type-mono);
    color: var(--text-secondary);
  }
  .success {
    display: flex;
    align-items: center;
    gap: var(--space-16);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-8);
  }
</style>
