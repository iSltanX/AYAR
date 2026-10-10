<script lang="ts">
  // Karat dial (Figma 71:536, DES-2 6.5, plan 11.5; D-DES2-02, D-DES2-07): a functional measuring ring of 24
  // segments of 15°, with a 2.5° gap at 120 (ring 12) and a 6° gap at 28 (ring 4). Filled segments are ink
  // (text/primary), empty ones border/strong, so the whole scale shows. "No scope" (value null) is all border/subtle
  // with no number, so it is never read as zero. The muted tone (a stale card) is text/tertiary on border/subtle.
  // Never coloured by the verdict, never mirrored: it fills clockwise from 12 o'clock in both languages.
  // Any integer 0..24 is drawn (the Figma variants 0, 12, 19, 24 are samples). Optional centre content (the karat
  // number in the purity card) is laid over the ring.
  import type { Snippet } from 'svelte';
  import { useLocale } from '../lib/locale.ts';

  interface Props {
    /** The karat 0..24, or null when there is no measurable scope. */
    value: number | null;
    size?: 'lg' | 'sm';
    tone?: 'default' | 'muted';
    /** True when the dial stands alone (no visible number beside it): it then carries its value as a name. */
    alone?: boolean;
    /** Content centred over the ring (lg only in the design). */
    children?: Snippet;
  }
  let { value, size = 'lg', tone = 'default', alone = true, children }: Props = $props();
  const { t } = useLocale();

  const TOTAL = 24;
  const GEOMETRY = { lg: { box: 120, ring: 12, gap: 2.5 }, sm: { box: 28, ring: 4, gap: 6 } } as const;
  const round = (n: number) => Math.round(n * 1000) / 1000;

  /** The annular sector of segment i (0 at 12 o'clock), clockwise, with the gap centred between segments. */
  function segment(i: number, box: number, ring: number, gap: number): string {
    const c = box / 2;
    const outer = c;
    const inner = c - ring;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const a0 = rad(i * 15 + gap / 2);
    const a1 = rad((i + 1) * 15 - gap / 2);
    const pt = (r: number, a: number) => `${round(c + r * Math.sin(a))} ${round(c - r * Math.cos(a))}`;
    return `M ${pt(outer, a0)} A ${outer} ${outer} 0 0 1 ${pt(outer, a1)} L ${pt(inner, a1)} A ${inner} ${inner} 0 0 0 ${pt(inner, a0)} Z`;
  }

  const geometry = $derived(GEOMETRY[size]);
  const filled = $derived(value === null ? 0 : Math.max(0, Math.min(TOTAL, Math.floor(value))));
  const segments = $derived(
    Array.from({ length: TOTAL }, (_, i) => ({ d: segment(i, geometry.box, geometry.ring, geometry.gap), on: i < filled })),
  );
  const name = $derived(
    alone ? (value === null ? t('status.purity.noMeasurableScope') : t('status.karat.value', { value: filled, total: TOTAL })) : undefined,
  );
</script>

<span
  class="dial {size} {tone}"
  class:none={value === null}
  role={alone ? 'img' : undefined}
  aria-label={name}
  aria-hidden={alone ? undefined : 'true'}
  data-value={value ?? 'none'}
>
  <svg xmlns="http://www.w3.org/2000/svg" width={geometry.box} height={geometry.box} viewBox="0 0 {geometry.box} {geometry.box}" focusable="false" aria-hidden="true">
    {#each segments as s, i (i)}<path class:on={s.on} d={s.d} />{/each}
  </svg>
  {#if children}<span class="centre">{@render children()}</span>{/if}
</span>

<style>
  .dial {
    position: relative;
    display: inline-flex;
    flex: none;
    --dial-on: var(--text-primary);
    --dial-off: var(--border-strong);
  }
  .lg {
    width: 120px;
    height: 120px;
  }
  .sm {
    width: 28px;
    height: 28px;
  }
  .muted {
    --dial-on: var(--text-tertiary);
    --dial-off: var(--border-subtle);
  }
  .none {
    --dial-off: var(--border-subtle);
  }
  svg {
    display: block;
  }
  path {
    fill: var(--dial-off);
  }
  path.on {
    fill: var(--dial-on);
  }
  .centre {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
</style>
