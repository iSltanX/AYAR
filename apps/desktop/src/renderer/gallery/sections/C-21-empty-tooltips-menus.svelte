<script module lang="ts">
  export const meta = { id: 'C-21', title: 'Empty states, tooltips, context menus', figma: '113:8252', order: 121 };
</script>

<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import Term from '../../components/Term.svelte';
  import TermTooltip from '../../components/TermTooltip.svelte';
  import { type EmptyKind } from '../../lib/empty-states.ts';
  import { useLocale } from '../../lib/locale.ts';
  import { checkRowMenu, findingRowMenu, type MenuEntry } from '../../lib/menus.ts';
  import Demo from '../Demo.svelte';
  import MenuPreview from '../MenuPreview.svelte';
  import Row from '../Row.svelte';

  const { t, lang } = useLocale();
  // Sample content: the meaning sentence of prompt §11 as Figma shows it, and the menus' accessible names.
  const S = {
    ar: {
      meaning: 'من 0 إلى 24: متوسط نسب الاجتياز المثبت داخل المعايير المطلوبة × 24، مقربًا إلى الأدنى.',
      checkMenu: 'قائمة صف الفحص',
      findingMenu: 'قائمة صف الاكتشاف',
      item: 'عنصر قائمة',
    },
    en: {
      meaning: 'From 0 to 24: the average of proven pass ratios within the required criteria × 24, rounded down.',
      checkMenu: 'Check row menu',
      findingMenu: 'Finding row menu',
      item: 'Menu item',
    },
  }[lang];
  const termTitle = `${t('glossary.purityIndex')} / ${t('glossary.karat')}`;

  const openLog = (enabled: boolean): MenuEntry => ({ kind: 'item', id: 'sample.openLog', label: { key: 'controls.menu.openLog' }, accelerator: 'CmdOrCtrl+L', enabled });
  const kinds: EmptyKind[] = ['projects', 'no-runs', 'no-cards', 'no-model-needs', 'no-matching-findings'];
  // Heights from Figma: the English sentence of no-cards and no-model-needs wraps to two lines.
  const emptyHeight: Record<EmptyKind, number> = {
    projects: 200,
    'no-runs': 200,
    'no-cards': lang === 'ar' ? 200 : 224,
    'no-model-needs': lang === 'ar' ? 160 : 184,
    'no-matching-findings': 200,
  };
</script>

<Row title="Menu item (113:8290) · default / highlighted / disabled · Shortcut; Menu separator (113:8293)">
  <Demo name="Menu item/default" figma="113:8290" h={28} w={220}><MenuPreview bare entries={[openLog(true)]} label={S.item} /></Demo>
  <Demo name="Menu item/highlighted" figma="113:8290" h={28} w={220}>
    <MenuPreview bare entries={[openLog(true)]} highlighted="sample.openLog" label={S.item} />
  </Demo>
  <Demo name="Menu item/disabled" figma="113:8290" h={28} w={220}><MenuPreview bare entries={[openLog(false)]} label={S.item} /></Demo>
  <Demo name="Menu separator" figma="113:8293" h={9} w={220}><MenuPreview bare entries={[{ kind: 'separator' }]} label={S.item} /></Demo>
</Row>

<Row title="Context menu (113:8383) · Kind check-row / finding-row (native, D-DES3-07)">
  <Demo name="Context menu/check-row" figma="113:8383" h={131} w={228}>
    <MenuPreview entries={checkRowMenu({ hasConfigFile: true })} highlighted="check.run" label={S.checkMenu} />
  </Demo>
  <Demo name="Context menu/finding-row" figma="113:8383" h={159} w={228}>
    <MenuPreview entries={findingRowMenu({ selectableForCopy: true })} highlighted="finding.selectForCopy" label={S.findingMenu} />
  </Demo>
</Row>

<Row title="Empty state (113:8501) · Kind">
  {#each kinds as kind (kind)}
    <Demo name="Empty state/{kind}" figma="113:8501" h={emptyHeight[kind]} w={480}><EmptyState {kind} /></Demo>
  {/each}
</Row>

<Row title="Term (113:8529) · hover and focus open the tooltip">
  <Demo name="Term/default" figma="113:8529" h={29}><Term term={termTitle} meaning={S.meaning}>{t('glossary.karat')}</Term></Demo>
</Row>

<Row title="Term tooltip (113:8539)">
  <Demo name="Term tooltip" figma="113:8539" h={86} w={280}><TermTooltip term={termTitle} meaning={S.meaning} /></Demo>
</Row>
