<script module lang="ts">
  export const meta = { id: 'C-02', title: 'Sidebar, nav item, nav badge, project switcher', figma: '101:767', order: 102 };
</script>

<script lang="ts">
  import NavBadge from '../../components/NavBadge.svelte';
  import NavGroupHeader from '../../components/NavGroupHeader.svelte';
  import NavItem from '../../components/NavItem.svelte';
  import ProjectSwitcher from '../../components/ProjectSwitcher.svelte';
  import Sidebar from '../../components/Sidebar.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { t, lang } = useLocale();
  const S = {
    ar: { name: 'مكتبة «النصوص»', path: '~/مشاريع تجريبية/مكتبة «النصوص»' },
    en: { name: 'Texts library', path: '~/Test projects/Texts library' },
  }[lang];
  const security = t('ui.section.security');
</script>

<Row title="Nav badge (101:783) · failures / missing">
  <Demo name="Nav badge/failures" figma="101:783" h={18} w={26}><NavBadge badge={{ kind: 'failures', count: 3 }} /></Demo>
  <Demo name="Nav badge/missing" figma="101:783" h={18} w={18}><NavBadge badge={{ kind: 'missing' }} /></Demo>
</Row>

<Row title="Nav item (101:885) · default / selected / disabled / with badge (hover, pressed, focus are CSS states)">
  <Demo name="Nav item/default" figma="101:885" h={32} w={224}><NavItem label={security} icon="shield" /></Demo>
  <Demo name="Nav item/selected" figma="101:885" h={32} w={224}><NavItem label={security} icon="shield" selected /></Demo>
  <Demo name="Nav item/disabled" figma="101:885" h={32} w={224}><NavItem label={security} icon="shield" disabled /></Demo>
  <Demo name="Nav item/badge-failures" figma="101:885" h={32} w={224}>
    <NavItem label={security} icon="shield" badge={{ kind: 'failures', count: 3 }} />
  </Demo>
  <Demo name="Nav item/badge-missing" figma="101:885" h={32} w={224}>
    <NavItem label={t('ui.section.behavior')} icon="workflow" badge={{ kind: 'missing' }} />
  </Demo>
</Row>

<Row title="Nav group header (101:893)">
  <Demo name="Nav group header" figma="101:893" h={28} w={224}><NavGroupHeader label={t('ui.nav.sections')} /></Demo>
</Row>

<Row title="Project switcher (101:987) · default (hover shows the path: 60 high)">
  <Demo name="Project switcher/default" figma="101:987" h={40} w={224}><ProjectSwitcher name={S.name} path={S.path} /></Demo>
</Row>

<Row title="Sidebar (101:1355) · 240 + divider, 808 high">
  <Demo name="Sidebar" figma="101:1355" h={808} w={241}>
    <div class="window">
      <Sidebar
        project={{ name: S.name, path: S.path }}
        current="overview"
        badges={{ security: { kind: 'failures', count: 3 }, behavior: { kind: 'missing' } }}
      />
    </div>
  </Demo>
</Row>

<style>
  .window {
    display: flex;
    height: 808px;
  }
</style>
