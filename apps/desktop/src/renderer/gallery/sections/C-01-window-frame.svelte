<script module lang="ts">
  export const meta = { id: 'C-01', title: 'Window frame: title bar', figma: '102:1510', order: 101 };
</script>

<script lang="ts">
  import SearchField from '../../components/SearchField.svelte';
  import TitleBar from '../../components/TitleBar.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { t, lang } = useLocale();
  const S = { ar: { project: 'مكتبة «النصوص»', page: 'النتائج' }, en: { project: 'Texts library', page: 'Results' } }[lang];
  const crumbs = [{ label: t('ui.nav.projects') }, { label: S.project }];
  const controls = ['left', 'right'] as const;
</script>

<Row title="Title bar (102:1666) · Controls left / right (the window buttons are drawn by macOS, D-DES3-05)">
  {#each controls as c (c)}
    <div class="scroll">
      <div class="frame">
        <Demo name="Title bar/controls-{c}" figma="102:1666" h={53} w={1360} width="fill">
          <TitleBar controls={c} title={S.page} breadcrumb={crumbs} primary={{ label: t('ui.action.startFullScan') }}>
            {#snippet search()}<SearchField width={200} />{/snippet}
          </TitleBar>
        </Demo>
      </div>
    </div>
  {/each}
</Row>

<style>
  .scroll {
    width: 100%;
    overflow-x: auto;
  }
  .frame {
    width: 1360px;
  }
</style>
