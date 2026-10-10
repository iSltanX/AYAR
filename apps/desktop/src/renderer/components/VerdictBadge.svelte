<script lang="ts">
  // Verdict badge (Figma 70:465, DES-2 6.5; D-DES2-03, D-DES2-05): a rectangle 28 high, radius/control, padding 8
  // on the icon side and 12 on the text side, gap 8; the verdict icon (Lucide 20: badge-check, badge-minus,
  // octagon-x) then the verdict in title/sub. Pure is green and blocked red, through the status class of the typed
  // verdict; incomplete is neutral with a 1 px border.
  import type { LucideName } from '../design/icons.generated.ts';
  import { useLocale } from '../lib/locale.ts';
  import type { Verdict } from '../lib/status.ts';
  import Icon from './Icon.svelte';

  interface Props {
    verdict: Verdict;
  }
  let { verdict }: Props = $props();
  const { t } = useLocale();
  const ICONS: Record<Verdict, LucideName> = { pure: 'badge-check', incomplete: 'badge-minus', blocked: 'octagon-x' };
</script>

<span class="badge status-{verdict}" class:bordered={verdict === 'incomplete'} data-verdict={verdict}>
  <span class="icon"><Icon name={ICONS[verdict]} size={20} /></span>
  <span class="label">{t(`status.verdict.${verdict}`)}</span>
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    flex: none;
    height: 28px;
    padding-inline: var(--space-8) var(--space-12);
    border-radius: var(--radius-control);
    background: var(--status-bg);
    color: var(--status-fg);
    font: var(--type-title-sub);
    white-space: nowrap;
  }
  .bordered {
    border: 1px solid var(--status-border);
  }
  .icon {
    display: inline-flex;
    color: var(--status-icon);
  }
</style>
