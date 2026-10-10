<script lang="ts">
  // Switch (Figma 99:428, C-18): a row 28 high whose whole width is the hit target, label (body) at the start,
  // gap 12, track 26×16 (radius 8, padding 2) at the end with a 12 px knob. Off: track bg/sunken with a
  // border/strong edge, knob bg/surface with a border/strong edge; hover keeps the fill and turns the edge
  // text/secondary (D-DES3-13). On: ink track (text/primary; hover text/secondary), knob bg/surface at the end
  // side. Disabled: off bg/sunken + border/subtle, on border/strong; knob bg/sunken; label text/tertiary.
  // Pressed = hover. Never blue or green (16.6). The track is the focusable role=switch, so it carries the ring.
  interface Props {
    checked?: boolean;
    /** The accessible name, shown at the start unless showLabel is false (Figma property Label). */
    label: string;
    showLabel?: boolean;
    disabled?: boolean;
    id?: string;
    onchange?: (checked: boolean) => void;
  }
  let { checked = $bindable(false), label, showLabel = true, disabled = false, id, onchange }: Props = $props();
  const uid = $props.id();

  function toggle() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<label class="switch" class:bare={!showLabel} class:disabled>
  <span class="text" class:visually-hidden={!showLabel} id="{uid}-label">{label}</span>
  <button type="button" role="switch" class="track" class:on={checked} aria-checked={checked} aria-labelledby="{uid}-label" {id} {disabled} onclick={toggle}>
    <span class="knob"></span>
  </button>
</label>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    gap: var(--space-12);
    min-block-size: 28px;
    color: var(--text-primary);
    font: var(--type-body);
    cursor: default;
  }
  .switch.bare {
    min-inline-size: 28px;
    justify-content: center;
  }
  .switch.disabled {
    color: var(--text-tertiary);
  }
  .track {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    flex: none;
    inline-size: 26px;
    block-size: 16px;
    margin: 0;
    padding: 0 1px;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    background: var(--bg-sunken);
    cursor: default;
    transition:
      background-color var(--motion-fast) var(--motion-easing),
      border-color var(--motion-fast) var(--motion-easing);
  }
  .knob {
    inline-size: 12px;
    block-size: 12px;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    background: var(--bg-surface);
  }
  .switch:hover .track:not(:disabled, .on) {
    border-color: var(--text-secondary);
  }
  .track.on {
    justify-content: flex-end;
    border-color: var(--text-primary);
    background: var(--text-primary);
  }
  .track.on .knob {
    border-color: var(--bg-surface);
  }
  .switch:hover .track.on:not(:disabled) {
    border-color: var(--text-secondary);
    background: var(--text-secondary);
  }
  .track:disabled {
    border-color: var(--border-subtle);
  }
  .track:disabled .knob {
    border-color: var(--border-subtle);
    background: var(--bg-sunken);
  }
  .track.on:disabled {
    border-color: var(--border-strong);
    background: var(--border-strong);
  }
  .track.on:disabled .knob {
    border-color: var(--bg-sunken);
  }
</style>
