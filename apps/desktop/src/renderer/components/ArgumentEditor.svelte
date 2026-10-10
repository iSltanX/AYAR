<script lang="ts">
  // Argument editor (Figma 100:889, C-18; plan 14.x, prompt §9.18): a command as a program and a separate list
  // of arguments, never one shell string. A card hugging its rows, 358 wide (bg/surface, border/subtle, radius/card,
  // padding 16, gap 8): «البرنامج» (label style, text/secondary, gap 12) and a mono field 260; «الوسائط»; one row per
  // argument (gap 4): a drag handle 28×28 (grip-vertical, text/tertiary) at the start, a mono field 260 (always
  // left to right) and a remove Icon button (x) at the end; a quiet «أضف وسيطًا» button (plus); and the note
  // «كل وسيط يُمرَّر منفصلًا كما هو، دون صدفة.» (body/small, text/secondary). Rows reorder by dragging the
  // handle, or from the keyboard with the arrow keys on the handle.
  import { tick } from 'svelte';
  import { useLocale } from '../lib/locale.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import TextField from './TextField.svelte';

  interface Props {
    program?: string;
    args?: string[];
    disabled?: boolean;
    /** Called after any change to the program or the arguments. */
    onchange?: (command: { program: string; args: string[] }) => void;
  }
  let { program = $bindable(''), args = $bindable([]), disabled = false, onchange }: Props = $props();
  const { t } = useLocale();
  const uid = $props.id();

  // Stable keys for the rows, so that reordering moves the rows (and their state) instead of relabelling them.
  let seq = 0;
  const nextKey = () => `${uid}-${++seq}`;
  let keys: string[] = $state([]);
  $effect.pre(() => {
    if (keys.length !== args.length) keys = args.map((_, i) => keys[i] ?? nextKey());
  });

  let root: HTMLElement | undefined = $state();
  let dragFrom: number | null = $state(null);

  const changed = () => onchange?.({ program, args: [...args] });

  async function focusIn(selector: string, index: number) {
    await tick();
    root?.querySelectorAll<HTMLElement>(selector)[index]?.focus();
  }
  function add() {
    args = [...args, ''];
    keys = [...keys, nextKey()];
    changed();
    void focusIn('[data-arg-input]', args.length - 1);
  }
  function remove(i: number) {
    args = args.filter((_, k) => k !== i);
    keys = keys.filter((_, k) => k !== i);
    changed();
    // Focus the remove button of the row that took this one's place (or the new last row); with no rows left,
    // the add button.
    if (args.length) void focusIn('.remove button', Math.min(i, args.length - 1));
    else void focusIn('.add button', 0);
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= args.length || from === to) return;
    const a = [...args];
    const k = [...keys];
    a.splice(to, 0, ...a.splice(from, 1));
    k.splice(to, 0, ...k.splice(from, 1));
    args = a;
    keys = k;
    changed();
  }
  function handleKey(e: KeyboardEvent, i: number) {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
    if (to === null) return;
    e.preventDefault();
    if (to < 0 || to >= args.length) return;
    move(i, to);
    void focusIn('.handle', to);
  }
  function setArg(i: number, v: string) {
    args[i] = v;
    changed();
  }
</script>

<div class="editor" bind:this={root}>
  <div class="program">
    <label class="caption" for="{uid}-program">{t('controls.args.program')}</label>
    <TextField id="{uid}-program" mono width={260} bind:value={program} {disabled} oninput={changed} />
  </div>
  <div class="args" role="group" aria-labelledby="{uid}-args">
    <span class="caption" id="{uid}-args">{t('controls.args.arguments')}</span>
    <span class="visually-hidden" id="{uid}-hint">{t('controls.args.moveHint')}</span>
    {#each args as arg, i (keys[i] ?? i)}
      <div
        class="row"
        role="presentation"
        ondragover={(e) => {
          if (dragFrom !== null) e.preventDefault();
        }}
        ondrop={(e) => {
          e.preventDefault();
          if (dragFrom !== null) move(dragFrom, i);
          dragFrom = null;
        }}
      >
        <button
          type="button"
          class="handle"
          draggable={!disabled}
          aria-label={t('controls.args.move', { index: i + 1 })}
          aria-describedby="{uid}-hint"
          {disabled}
          onkeydown={(e) => handleKey(e, i)}
          ondragstart={(e) => {
            dragFrom = i;
            const row = (e.currentTarget as HTMLElement).closest('.row');
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', arg);
              if (row) e.dataTransfer.setDragImage(row, 0, 14);
            }
          }}
          ondragend={() => (dragFrom = null)}
        >
          <Icon name="grip-vertical" size={16} />
        </button>
        <TextField
          data-arg-input
          mono
          width={260}
          value={arg}
          label={t('controls.args.argument', { index: i + 1 })}
          {disabled}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) => setArg(i, e.currentTarget.value)}
        />
        <span class="remove">
          <IconButton icon="x" label={t('controls.args.remove', { index: i + 1 })} {disabled} onclick={() => remove(i)} />
        </span>
      </div>
    {/each}
  </div>
  <span class="add">
    <Button kind="quiet" icon="plus" {disabled} onclick={add}>{t('controls.args.add')}</Button>
  </span>
  <p class="note">{t('controls.args.note')}</p>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
    max-inline-size: 100%;
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .program {
    display: flex;
    align-items: center;
    gap: var(--space-12);
  }
  .args {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
  }
  .caption {
    font: var(--type-label);
    color: var(--text-secondary);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-tertiary);
    cursor: grab;
  }
  .handle:disabled {
    cursor: default;
  }
  .remove,
  .add {
    display: inline-flex;
  }
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
