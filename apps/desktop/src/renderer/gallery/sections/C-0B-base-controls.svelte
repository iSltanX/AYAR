<script module lang="ts">
  export const meta = { id: 'C-0B', title: 'Base controls: Button, Icon button', figma: '98:4', order: 10 };
</script>

<script lang="ts">
  import Button from '../../components/Button.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { t, dir } = useLocale();
  const kinds = ['primary', 'secondary', 'quiet', 'destructive'] as const;
  const labels = {
    primary: t('ui.action.startFullScan'),
    secondary: t('ui.action.approve'),
    quiet: t('shell.runBar.showFollowUp'),
    destructive: t('ui.action.removeFromAyar'),
  };
</script>

<Row title="Button (98:310) · Kind × default / disabled">
  {#each kinds as kind (kind)}
    <Demo name="Button/{kind}" figma="98:310" h={28}><Button {kind}>{labels[kind]}</Button></Demo>
    <Demo name="Button/{kind}/disabled" figma="98:310" h={28}><Button {kind} disabled>{labels[kind]}</Button></Demo>
  {/each}
  <Demo name="Button/secondary/icon" figma="98:310" h={28}><Button icon="plus">{t('ui.action.createCard')}</Button></Demo>
</Row>

<Row title="Icon button (98:343)">
  <Demo name="Icon button/default" figma="98:343" h={28} w={28}>
    <IconButton icon={dir === 'rtl' ? 'panel-left' : 'panel-right'} label={t('controls.inspectorToggle')} />
  </Demo>
  <Demo name="Icon button/disabled" figma="98:343" h={28} w={28}>
    <IconButton icon={dir === 'rtl' ? 'panel-left' : 'panel-right'} label={t('controls.inspectorToggle')} disabled />
  </Demo>
</Row>
