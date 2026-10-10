<script lang="ts">
  // Nav badge (Figma 101:783, C-02): the failed checks of a section (failed colours, numeric/live, Latin
  // digits, 18 high, radius half the height, 1 px border) or the section needs setup (the «missing» symbol 12
  // on an 18x18 square). No Direction (D-DES3-09): digits and the symbol do not mirror. It carries its own
  // accessible name («3 failures», «Needs setup»).
  import { useLocale } from '../lib/locale.ts';
  import { NAV_BADGE_FAMILY, type NavBadgeValue } from '../lib/shell.ts';
  import { formatNumber } from '@ayar/i18n';
  import StatusSymbol from './StatusSymbol.svelte';

  interface Props {
    badge: NavBadgeValue;
  }
  let { badge }: Props = $props();
  const { t, lang } = useLocale();
  const family = $derived(NAV_BADGE_FAMILY[badge.kind]);
  const name = $derived(
    badge.kind === 'failures' ? t('shell.navBadge.failures', { count: badge.count }) : t('status.readiness.needs-setup'),
  );
</script>

<span class="nav-badge {badge.kind} status-{family}" role="img" aria-label={name} data-badge={badge.kind}>
  {#if badge.kind === 'failures'}
    <span class="count" aria-hidden="true">{formatNumber(badge.count, lang)}</span>
  {:else}
    <StatusSymbol symbol={family} size={12} />
  {/if}
</span>

<style>
  .nav-badge {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    height: 18px;
  }
  .failures {
    min-width: 18px;
    padding: 0 var(--space-8);
    border: 1px solid var(--status-border);
    border-radius: 9px;
    background: var(--status-bg);
    color: var(--status-fg);
    font: var(--type-numeric-live);
    font-variant-numeric: tabular-nums;
  }
  .missing {
    width: 18px;
  }
</style>
