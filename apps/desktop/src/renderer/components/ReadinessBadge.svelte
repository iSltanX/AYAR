<script lang="ts">
  // Readiness badge (Figma 70:317, DES-2 6.3): an outlined pill, solid 1 px border/strong, no fill, no symbol,
  // text/secondary, so it is never read as a result. md 22, sm 20; padding 8; full radius (D-DES2-05).
  import { useLocale } from '../lib/locale.ts';
  import type { Readiness } from '../lib/status.ts';

  interface Props {
    readiness: Readiness;
    size?: 'sm' | 'md';
    /** A narrower wording of the same readiness, as an approved screen writes it (DES-4 1.2: «أداة ناقصة»). */
    label?: string;
  }
  let { readiness, size = 'md', label }: Props = $props();
  const { t } = useLocale();
</script>

<span class="badge {size}" data-readiness={readiness}>{label ?? t(`status.readiness.${readiness}`)}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    flex: none;
    padding-inline: var(--space-8);
    border: 1px solid var(--border-strong);
    color: var(--text-secondary);
    font: var(--type-label);
    white-space: nowrap;
  }
  .md {
    height: 22px;
    border-radius: 11px;
  }
  .sm {
    height: 20px;
    border-radius: 10px;
  }
</style>
