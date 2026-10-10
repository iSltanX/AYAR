<script module lang="ts">
  export const meta = { id: 'C-15', title: 'Capture tile', figma: '109:6412', order: 115 };
</script>

<script lang="ts">
  import CaptureTile from '../../components/CaptureTile.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import baselineSrc from '../assets/capture-baseline.svg';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  const image = { src: baselineSrc, width: 1280, height: 800 };
  const S = {
    ar: {
      tags: ['تحميل', '1280', 'فاتح', 'AR'],
      key: 'الحالة: تحميل · الحجم: 1280×800 · الثيم: فاتح · اللغة: العربية · المنصة: macOS 26 · المتصفح: Chromium 140 · كثافة البكسل: 2x',
    },
    en: {
      tags: ['Loading', '1280', 'Light', 'AR'],
      key: 'State: loading · Size: 1280×800 · Theme: light · Language: Arabic · Platform: macOS 26 · Browser: Chromium 140 · Pixel density: 2x',
    },
  }[lang];
</script>

<Row title="Capture tile (109:6740) · Variant default / sensitive (hover border/strong, focus ring)">
  <Demo name="Capture tile/default" figma="109:6740" h={202} w={220}>
    <CaptureTile {image} tags={S.tags} fullKey={S.key} result="passed" />
  </Demo>
  <Demo name="Capture tile/sensitive" figma="109:6740" h={224} w={220}>
    <CaptureTile sensitive tags={S.tags} fullKey={S.key} result="skipped" />
  </Demo>
</Row>
