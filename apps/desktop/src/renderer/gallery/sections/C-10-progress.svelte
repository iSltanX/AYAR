<script module lang="ts">
  export const meta = { id: 'C-10', title: 'Progress', figma: '106:4063', order: 110 };
</script>

<script lang="ts">
  import Progress from '../../components/Progress.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  const S = {
    ar: { download: 'يُنزّل 42 من 100 ميغابايت', step: 'يثبّت التبعيات', estimate: 'المتبقي نحو 1:30 (تقدير)' },
    en: { download: 'Downloading 42 of 100 MB', step: 'Installing dependencies', estimate: 'About 1:30 left (estimate)' },
  }[lang];
</script>

<Row title="Progress (106:4127) · Kind count / percent / indeterminate · 320 wide">
  <Demo name="Progress/count" figma="106:4127" h={32} w={320}>
    <div class="w320"><Progress kind="count" done={7} total={18} /></div>
  </Demo>
  <Demo name="Progress/percent" figma="106:4127" h={32} w={320}>
    <div class="w320"><Progress kind="percent" value={0.42} label={S.download} /></div>
  </Demo>
  <Demo name="Progress/indeterminate" figma="106:4127" h={52} w={320}>
    <div class="w320"><Progress kind="indeterminate" step={S.step} elapsed={48} /></div>
  </Demo>
</Row>

<Row title="Progress (106:4127) · Estimate (only with a previous run on record; sample text)">
  <Demo name="Progress/count/estimate" figma="106:4127" h={32} w={320}>
    <div class="w320"><Progress kind="count" done={7} total={18} estimate={S.estimate} /></div>
  </Demo>
</Row>

<style>
  .w320 {
    display: flex;
    width: 320px;
  }
</style>
