<script lang="ts">
  // Copy for model button (Figma 110:6568, C-24; plan 9.24): the ONLY copy button for reports, fix prompts,
  // cards and instruction files, one per context. Primary style (ink fill, text/inverse), the Lucide copy icon,
  // 28 high; hover, pressed and focus are CSS states, disabled a property. Shortcut ⇧⌘C. It copies the "for the
  // model" format of the current scope; the caller does the copying in `onclick`.
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { useLocale } from '../lib/locale.ts';
  import Button from './Button.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'style' | 'children' | 'onclick' | 'disabled'> {
    disabled?: boolean;
    onclick?: () => void;
  }
  let { disabled = false, onclick, ...rest }: Props = $props();
  const { t } = useLocale();
  const label = $derived(t('ui.action.copyForModel'));
</script>

<Button kind="primary" icon="copy" {disabled} {onclick} aria-keyshortcuts="Shift+Meta+C" title="{label} (⇧⌘C)" {...rest}>{label}</Button>
