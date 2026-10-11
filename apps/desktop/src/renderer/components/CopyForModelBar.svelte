<script lang="ts">
  // Copy for model bar (Figma 110:6710, C-24; plan 9.24, D-40, D-DES3-14): the fixed place above the content of
  // each context for its ONE copy button (Copy for model button) and the permanent note (body/small,
  // text/secondary) saying what is copied: the «For the model» report in the results, the inspector and the card
  // preview, the whole instructions file in the instructions preview. Results: the copy scope (Select, 180)
  // beside the button. Results and inspector: the «وأنشئ بطاقة تحقق» checkbox under it (not a second button).
  // The counters (characters and redactions, body/small, text/tertiary) and the «لك | للنموذج» segmented
  // control below (`tabs`; «لك» is the default and switching never changes the selection or the options).
  // Never a second copy button and never one that copies the «For you» format. Gap 12 in the copy row, 8 between
  // rows. The inspector puts the note under the button (348 wide).
  import { useLocale } from '../lib/locale.ts';
  import { COPY_SCOPES, type CopyContext, type CopyScope, type ReportView } from '../lib/results.ts';
  import Checkbox from './Checkbox.svelte';
  import CopyForModelButton from './CopyForModelButton.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import Select from './Select.svelte';

  interface Props {
    context: CopyContext;
    /** Show the «لك | للنموذج» segmented control (Figma property Tabs). */
    tabs?: boolean;
    view?: ReportView;
    /** Results: what is copied. */
    scope?: CopyScope;
    /** Results: the number of selected findings, for «المحدد (3)». */
    selectedCount?: number;
    /** What the copy holds: characters and redactions (not in the instructions preview). */
    characters?: number;
    redactions?: number;
    /** The kinds of the redacted values in the UI language, e.g. «رمز GitHub». */
    redactedKinds?: string;
    /** Results and inspector: also create a verification card when copying. */
    createCard?: boolean;
    disabled?: boolean;
    /** The segmented control shows no selection: one of the results' tabs is selected instead (D-DES4-07). */
    viewEmpty?: boolean;
    oncopy?: () => void;
    onviewchange?: (view: ReportView) => void;
    onscopechange?: (scope: CopyScope) => void;
    oncreatecardchange?: (createCard: boolean) => void;
  }
  let {
    context,
    tabs = true,
    view = $bindable('for-you'),
    scope = $bindable('selected'),
    selectedCount = 0,
    characters,
    redactions = 0,
    redactedKinds,
    createCard = $bindable(false),
    disabled = false,
    viewEmpty = false,
    oncopy,
    onviewchange,
    onscopechange,
    oncreatecardchange,
  }: Props = $props();
  const { t } = useLocale();

  const instructions = $derived(context === 'instructions-preview');
  const note = $derived(t(instructions ? 'results.copyBar.note.instructions' : 'results.copyBar.note.report'));
  const SCOPE_KEYS = {
    selected: 'results.copyBar.scope.selected',
    'all-findings': 'results.copyBar.scope.allFindings',
    'whole-run': 'results.copyBar.scope.wholeRun',
  } as const satisfies Record<CopyScope, string>;
  const scopeOptions = $derived(COPY_SCOPES.map((s) => ({ value: s, label: t(SCOPE_KEYS[s], { count: selectedCount }) })));
  const viewOptions = $derived([
    { value: 'for-you' as const, label: t('ui.tab.forYou') },
    { value: 'for-model' as const, label: t('ui.tab.forModel') },
  ]);
  const counters = $derived.by(() => {
    if (instructions || characters === undefined) return undefined;
    const r = t('results.copyBar.redactions', { count: redactions });
    return t('results.copyBar.counters', {
      characters: t('results.copyBar.characters', { count: characters }),
      redactions: redactions > 0 && redactedKinds ? t('results.copyBar.redactedKinds', { redactions: r, kinds: redactedKinds }) : r,
    });
  });
</script>

<div class="copy-bar" data-context={context}>
  <div class="copy-row">
    <CopyForModelButton {disabled} onclick={oncopy} />
    {#if context === 'results'}
      <Select bind:value={scope} options={scopeOptions} label={t('ui.scope.copy')} width={180} onchange={() => onscopechange?.(scope)} />
    {/if}
    {#if context !== 'inspector'}<p class="note">{note}</p>{/if}
  </div>
  {#if context === 'inspector'}<p class="note">{note}</p>{/if}
  {#if counters}<p class="counters">{counters}</p>{/if}
  {#if context === 'results' || context === 'inspector'}
    <Checkbox bind:checked={createCard} label={t('results.copyBar.createCard')} onchange={(v: boolean) => oncreatecardchange?.(v)} />
  {/if}
  {#if tabs && !instructions}
    <SegmentedControl bind:value={view} options={viewOptions} label={t('results.copyBar.view')} empty={viewEmpty} onchange={(v: ReportView) => onviewchange?.(v)} />
  {/if}
</div>

<style>
  .copy-bar {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
    width: 100%;
    min-width: 0;
  }
  .copy-row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    align-self: stretch;
    min-width: 0;
  }
  p {
    margin: 0;
  }
  .note {
    align-self: stretch;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .copy-row .note {
    flex: 1 1 0;
    min-width: 0;
  }
  .counters {
    font: var(--type-body-small);
    color: var(--text-tertiary);
  }
</style>
