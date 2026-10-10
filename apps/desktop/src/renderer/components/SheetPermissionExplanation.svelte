<script lang="ts">
  // Sheet/Permission explanation (Figma 115:8989), shown before the macOS privacy (TCC) prompt: a lock (Lucide
  // 24), why macOS will ask on behalf of AYAR (body), what will be read (Path pill: the path is left to right and
  // each Arabic folder sits in its own <bdi>, D-DES3-04), and that reading runs nothing (body, text/secondary).
  // Footer: «اختر مجلدًا آخر» · «متابعة». Neither choice changes anything by itself (macOS asks next), so the
  // focus opens on «متابعة», the default.
  import { useLocale } from '../lib/locale.ts';
  import { PROTECTED_LOCATIONS, type ProtectedLocation, type SheetMode } from '../lib/sheets.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import PathPill from './PathPill.svelte';
  import Sheet from './Sheet.svelte';
  import SheetField from './SheetField.svelte';

  interface Props extends SheetMode {
    /** The protected location that holds the folder. */
    location: ProtectedLocation;
    /** The folder that will be read, e.g. ~/Documents/مشاريع تجريبية/مكتبة «النصوص». */
    path: string;
    oncontinue?: () => void;
    onchooseother?: () => void;
    oncopy?: (text: string) => void;
  }
  let { location, path, oncontinue, onchooseother, oncopy, open, inline, oncancel }: Props = $props();
  const { t } = useLocale();
</script>

<Sheet title={t('sheets.permission.title')} {open} {inline} {oncancel}>
  <span class="lock"><Icon name="lock" size={24} /></span>
  <p class="why">{t('sheets.permission.why', { location: t(PROTECTED_LOCATIONS[location]) })}</p>
  <SheetField label={t('sheets.permission.whatRead')}>
    <PathPill {path} {oncopy} />
  </SheetField>
  <p class="no-run">{t('sheets.permission.noRun')}</p>
  {#snippet footer()}
    <Button onclick={onchooseother}>{t('sheets.permission.chooseOther')}</Button>
    <Button kind="primary" data-initial-focus onclick={oncontinue}>{t('sheets.permission.continue')}</Button>
  {/snippet}
</Sheet>

<style>
  .lock {
    display: inline-flex;
    align-self: flex-start;
    color: var(--text-primary);
  }
  .why,
  .no-run {
    margin: 0;
    font: var(--type-body);
    color: var(--text-primary);
  }
  .no-run {
    color: var(--text-secondary);
  }
</style>
