<script lang="ts">
  // Tabs bar (Figma 100:607, C-18): Tab items in reading order from the start side, gap 4, over a 1 px
  // border/subtle baseline (decorative); it fills its container (380 in the inspector, 720 in the results).
  // Kind inspector: التفاصيل | السجل. Kind results: الاكتشافات | الفحوص | الأدلة | الآثار الجانبية (TAB_SETS).
  // A horizontal tablist with one tab stop on the selected tab; Left/Right (following the reading direction),
  // Home and End move and select (automatic activation). `panelId` wires aria-controls to the caller's tab panels.
  import { arrowTarget, TAB_SETS, type ControlOption, type TabsKind } from '../lib/controls.ts';
  import { useLocale } from '../lib/locale.ts';
  import Tab from './Tab.svelte';

  interface Props {
    value?: string;
    /** One of Figma's two bars; or pass `tabs`. */
    kind?: TabsKind;
    tabs?: readonly ControlOption[];
    /** The tab list's accessible name. */
    label: string;
    /** The id of the tab panel for a tab value (aria-controls). */
    panelId?: (value: string) => string;
    /** The id of the tab element for a tab value, for the panel's aria-labelledby. */
    tabId?: (value: string) => string;
    /** Nothing selected here: the selection is in a sibling control (D-DES4-07, the results' six views). */
    empty?: boolean;
    onchange?: (value: string) => void;
  }
  let { value = $bindable(), kind, tabs, label, panelId, tabId, empty = false, onchange }: Props = $props();
  const { t } = useLocale();
  let buttons: HTMLButtonElement[] = $state([]);

  const items = $derived<readonly ControlOption[]>(
    tabs ?? (kind ? TAB_SETS[kind].map((x) => ({ value: x.value, label: t(x.key) })) : []),
  );
  const enabled = $derived(items.map((o) => !o.disabled));
  const current = $derived(empty ? -1 : Math.max(0, items.findIndex((o) => o.value === value)));

  function select(i: number) {
    const o = items[i];
    if (!o || !enabled[i]) return;
    if (o.value !== value || empty) {
      value = o.value;
      onchange?.(o.value);
    }
  }
  function keydown(e: KeyboardEvent) {
    const to = arrowTarget(e, Math.max(0, current), enabled, 'horizontal');
    if (to === null) return;
    e.preventDefault();
    select(to);
    buttons[to]?.focus();
  }
</script>

<div class="tabs" role="tablist" aria-label={label}>
  {#each items as o, i (o.value)}
    <Tab
      bind:element={buttons[i]}
      id={tabId?.(o.value)}
      selected={i === current}
      tabindex={i === Math.max(0, current) ? 0 : -1}
      disabled={o.disabled}
      aria-controls={panelId?.(o.value)}
      onclick={() => select(i)}
      onkeydown={keydown}>{o.label}</Tab
    >
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    inline-size: 100%;
    block-size: 33px;
    border-bottom: 1px solid var(--border-subtle);
  }
</style>
