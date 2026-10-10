<script module lang="ts">
  export const meta = { id: 'C-23', title: 'Run menu', figma: '113:8662', order: 123 };
</script>

<script lang="ts">
  import Button from '../../components/Button.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { runMenu } from '../../lib/menus.ts';
  import Demo from '../Demo.svelte';
  import MenuPreview from '../MenuPreview.svelte';
  import Row from '../Row.svelte';

  const { t, lang } = useLocale();
  // Sample saved groups, as Figma shows them.
  const S = {
    ar: { groups: ['فحوص الواجهة قبل الإصدار', 'الأمن السريع'] },
    en: { groups: ['UI checks before release', 'Quick security'] },
  }[lang];
  const entries = runMenu({
    section: 'ui.section.security',
    selectedCount: 3,
    savedGroups: S.groups.map((name, i) => ({ id: `g${i + 1}`, name })),
  });
</script>

<Row title="Run menu (113:8766) · trigger + native menu (D-DES3-07)">
  <Demo name="Run menu" figma="113:8766" h={284} w={300}>
    <div class="run-menu">
      <Button kind="primary" icon="chevron-down" aria-haspopup="menu">{t('controls.menu.run')}</Button>
      <MenuPreview {entries} width={300} highlighted="run.fullScan" label={t('controls.menu.run')} />
    </div>
  </Demo>
</Row>

<style>
  .run-menu {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
  }
</style>
