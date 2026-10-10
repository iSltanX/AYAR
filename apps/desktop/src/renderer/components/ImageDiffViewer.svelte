<script lang="ts">
  // Image diff viewer (Figma 109:6265, C-14; plan 9.14, D-DES3-15): bg/surface, border/subtle, radius/card,
  // padding 12, gap 12. Toolbar: the mode control (side by side / overlay / slider) at the start, the result
  // badge at the end (the only coloured element). The capture key as neutral tags. Changed regions are an overlay
  // fill with a 1.5 px solid text/primary frame, never red or green. Images are never mirrored; the panes follow
  // the reading order, baseline first. The slider is a native range input (keyboard: arrows, Home, End) over the
  // image, with a 2 px divider and a 28×28 handle.
  import type { Attachment } from 'svelte/attachments';
  import {
    CAPTURE_KEY_FIELDS,
    DIFF_MODES,
    type CaptureKey,
    type ChangedRegion,
    type DiffMode,
    type EvidenceImage,
  } from '../lib/evidence.ts';
  import { useLocale } from '../lib/locale.ts';
  import type { BadgeResult } from '../lib/status.ts';
  import AutoText from './AutoText.svelte';
  import Icon from './Icon.svelte';
  import ResultBadge from './ResultBadge.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    baseline: EvidenceImage;
    current: EvidenceImage;
    /** Changed regions, in the pixels of the current image. */
    regions?: readonly ChangedRegion[];
    captureKey: CaptureKey;
    result?: BadgeResult;
    mode?: DiffMode;
    /** Slider position: the share of the width given to the baseline, from the start side, 0 to 100. */
    position?: number;
    onmodechange?: (mode: DiffMode) => void;
  }
  let {
    baseline,
    current,
    regions = [],
    captureKey,
    result = 'needs-review',
    mode = $bindable('side-by-side'),
    position = $bindable(50),
    onmodechange,
  }: Props = $props();
  const { t } = useLocale();

  const MODE_KEYS = {
    'side-by-side': 'results.imageDiff.mode.sideBySide',
    overlay: 'results.imageDiff.mode.overlay',
    slider: 'results.imageDiff.mode.slider',
  } as const;
  const modeOptions = $derived(DIFF_MODES.map((m) => ({ value: m, label: t(MODE_KEYS[m]) })));

  /** The image box keeps the image's aspect ratio inside the capture frame. */
  const ratio =
    (image: EvidenceImage): Attachment<HTMLElement> =>
    (el) => {
      el.style.setProperty('--ratio', String(image.width / image.height));
    };
  /** A changed region, placed in fractions of the current image (images are not mirrored: physical left/top). */
  const place =
    (r: ChangedRegion): Attachment<HTMLElement> =>
    (el) => {
      el.style.setProperty('--x', String(r.x / current.width));
      el.style.setProperty('--y', String(r.y / current.height));
      el.style.setProperty('--w', String(r.width / current.width));
      el.style.setProperty('--h', String(r.height / current.height));
    };
  const slide: Attachment<HTMLElement> = (el) => {
    el.style.setProperty('--position', String(position));
  };
</script>

{#snippet marks()}
  {#each regions as region, i (i)}<span class="region" aria-hidden="true" {@attach place(region)}></span>{/each}
{/snippet}

<div class="image-diff">
  <div class="toolbar">
    <SegmentedControl bind:value={mode} options={modeOptions} label={t('results.imageDiff.mode')} onchange={(m: DiffMode) => onmodechange?.(m)} />
    <span class="spacer"></span>
    <ResultBadge {result} />
  </div>

  <ul class="capture-key">
    {#each CAPTURE_KEY_FIELDS as field (field)}
      <li><Tag kind="neutral">{t(`results.captureKey.${field}`)}&#32;<AutoText text={captureKey[field]} /></Tag></li>
    {/each}
  </ul>

  {#if mode === 'side-by-side'}
    <div class="stage panes">
      <figure class="pane">
        <figcaption>{t('results.imageDiff.baseline')}</figcaption>
        <div class="capture small">
          <div class="fit" {@attach ratio(baseline)}><img src={baseline.src} alt={t('results.imageDiff.baseline')} draggable="false" /></div>
        </div>
      </figure>
      <figure class="pane">
        <figcaption>{t('results.imageDiff.current')}</figcaption>
        <div class="capture small">
          <div class="fit" {@attach ratio(current)}>
            <img src={current.src} alt={t('results.imageDiff.current')} draggable="false" />
            {@render marks()}
          </div>
        </div>
      </figure>
    </div>
  {:else if mode === 'overlay'}
    <figure class="stage">
      <figcaption>{t('results.imageDiff.overlayNote')}</figcaption>
      <div class="capture">
        <div class="fit" {@attach ratio(current)}>
          <img src={baseline.src} alt={t('results.imageDiff.baseline')} draggable="false" />
          <img class="over" src={current.src} alt={t('results.imageDiff.current')} draggable="false" />
          {@render marks()}
        </div>
      </div>
    </figure>
  {:else}
    <figure class="stage">
      <figcaption class="slider-labels">
        <span>{t('results.imageDiff.baseline')}</span>
        <span>{t('results.imageDiff.current')}</span>
      </figcaption>
      <div class="capture">
        <div class="fit" {@attach ratio(current)} {@attach slide}>
          <img src={baseline.src} alt={t('results.imageDiff.baseline')} draggable="false" />
          <div class="current-layer">
            <img src={current.src} alt={t('results.imageDiff.current')} draggable="false" />
            {@render marks()}
          </div>
          <span class="divider" aria-hidden="true"></span>
          <span class="handle" aria-hidden="true"><Icon name="grip-vertical" size={16} /></span>
          <input
            class="range"
            type="range"
            min="0"
            max="100"
            step="1"
            aria-label={t('results.imageDiff.sliderPosition')}
            bind:value={position}
          />
        </div>
      </div>
    </figure>
  {/if}
</div>

<style>
  .image-diff {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    width: 100%;
    min-width: 0;
    padding: var(--space-12);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    height: 32px;
  }
  .spacer {
    flex: 1;
  }
  .capture-key {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .capture-key li {
    display: flex;
  }
  .stage {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    margin: 0;
  }
  .stage.panes {
    flex-direction: row;
    gap: var(--space-16);
  }
  .pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    flex: 1 1 0;
    min-width: 0;
    margin: 0;
  }
  figcaption {
    font: var(--type-label);
    color: var(--text-secondary);
  }
  .slider-labels {
    display: flex;
    justify-content: space-between;
  }
  .capture {
    display: grid;
    place-items: center;
    height: 300px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    overflow: hidden;
    container-type: size;
  }
  .capture.small {
    height: 212px;
  }
  .fit {
    position: relative;
    width: min(100cqw, 100cqh * var(--ratio, 1.6));
    aspect-ratio: var(--ratio, 1.6);
  }
  img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: fill;
    user-select: none;
  }
  .over {
    opacity: 0.5;
  }
  .region {
    position: absolute;
    left: calc(var(--x) * 100%);
    top: calc(var(--y) * 100%);
    width: calc(var(--w) * 100%);
    height: calc(var(--h) * 100%);
    background: color-mix(in srgb, var(--overlay) 30%, transparent);
    outline: 1.5px solid var(--text-primary);
  }
  .current-layer {
    position: absolute;
    inset: 0;
    clip-path: inset(0 0 0 calc(var(--position) * 1%));
  }
  .current-layer:dir(rtl) {
    clip-path: inset(0 calc(var(--position) * 1%) 0 0);
  }
  .divider {
    position: absolute;
    inset-block: 0;
    inset-inline-start: calc(var(--position) * 1%);
    width: 2px;
    margin-inline-start: -1px;
    background: var(--text-primary);
  }
  .handle {
    position: absolute;
    top: 50%;
    inset-inline-start: calc(var(--position) * 1%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin-top: -14px;
    margin-inline-start: -14px;
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    background: var(--bg-surface);
    color: var(--text-primary);
  }
  .range {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    background: transparent;
    appearance: none;
    cursor: ew-resize;
  }
  .range::-webkit-slider-runnable-track {
    height: 100%;
    background: transparent;
  }
  .range::-webkit-slider-thumb {
    width: 1px; /* the pointer maps straight to the divider; the visible handle is .handle */
    height: 100%;
    background: transparent;
    appearance: none;
  }
</style>
