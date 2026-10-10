<script module lang="ts">
  export const meta = { id: 'C-15', title: 'Capture tile', figma: '109:6412', order: 115 };
</script>

<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import CaptureTile from '../../components/CaptureTile.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import baselineDark from '../assets/capture-baseline-dark.svg';
  import baselineLight from '../assets/capture-baseline.svg';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  // The capture follows the captured app's theme: here, the panel's theme.
  let theme = $state<'light' | 'dark'>('light');
  const probe: Attachment<HTMLElement> = (el) => {
    theme = el.closest('[data-theme]')?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  };
  const image = $derived({ src: theme === 'dark' ? baselineDark : baselineLight, width: 1280, height: 800 });
  const S = $derived(
    {
      ar: {
        tags: ['تحميل', '1280', theme === 'dark' ? 'داكن' : 'فاتح', 'AR'],
        key: `الحالة: تحميل · الحجم: 1280×800 · الثيم: ${theme === 'dark' ? 'داكن' : 'فاتح'} · اللغة: العربية · المنصة: macOS 26 · المتصفح: Chromium 140 · كثافة البكسل: 2x`,
      },
      en: {
        tags: ['Loading', '1280', theme === 'dark' ? 'Dark' : 'Light', 'AR'],
        key: `State: loading · Size: 1280×800 · Theme: ${theme} · Language: Arabic · Platform: macOS 26 · Browser: Chromium 140 · Pixel density: 2x`,
      },
    }[lang],
  );
</script>

<div class="probe" {@attach probe}>
  <Row title="Capture tile (109:6740) · Variant default / sensitive (hover border/strong, focus ring)">
    <Demo name="Capture tile/default" figma="109:6740" h={202} w={220}>
      <CaptureTile {image} tags={S.tags} fullKey={S.key} result="passed" />
    </Demo>
    <Demo name="Capture tile/sensitive" figma="109:6740" h={224} w={220}>
      <CaptureTile sensitive tags={S.tags} fullKey={S.key} result="skipped" />
    </Demo>
  </Row>
</div>

<style>
  .probe {
    display: contents;
  }
</style>
