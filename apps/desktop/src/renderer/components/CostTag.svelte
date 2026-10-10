<script lang="ts">
  // Cost tag (Figma 103:2611, C-26; D-DES3-11, D-DES2-04): a neutral-icon Tag. Local is a laptop, network a globe,
  // your model sparkles. Neutral, never a status colour, never "free".
  import { useLocale } from '../lib/locale.ts';
  import { COST_TAGS, type Cost } from '../lib/tags.ts';
  import Tag from './Tag.svelte';

  interface Props {
    cost: Cost;
  }
  let { cost }: Props = $props();
  const { t } = useLocale();
  const spec = $derived(COST_TAGS[cost]);
</script>

<Tag kind={spec.kind} icon={spec.icon}>{t(spec.key)}</Tag>
