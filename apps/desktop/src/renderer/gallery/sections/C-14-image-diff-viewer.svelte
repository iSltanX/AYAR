<script module lang="ts">
  export const meta = { id: 'C-14', title: 'Image diff viewer', figma: '109:5955', order: 114 };
</script>

<script lang="ts">
  import ImageDiffViewer from '../../components/ImageDiffViewer.svelte';
  import { DIFF_MODES, type CaptureKey, type ChangedRegion } from '../../lib/evidence.ts';
  import { useLocale } from '../../lib/locale.ts';
  import baselineSrc from '../assets/capture-baseline.svg';
  import currentSrc from '../assets/capture-current.svg';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  const baseline = { src: baselineSrc, width: 1280, height: 800 };
  const current = { src: currentSrc, width: 1280, height: 800 };
  const regions: ChangedRegion[] = [{ x: 640, y: 463, width: 587, height: 241 }];
  const captureKey: CaptureKey = {
    ar: { state: 'فارغ', size: '1280×800', theme: 'داكن', language: 'العربية', platform: 'macOS 26', browser: 'Chromium 140', pixelDensity: '2x' },
    en: { state: 'empty', size: '1280×800', theme: 'dark', language: 'Arabic', platform: 'macOS 26', browser: 'Chromium 140', pixelDensity: '2x' },
  }[lang];
  const heights = { 'side-by-side': 362, overlay: 450, slider: 450 } as const;
</script>

{#each DIFF_MODES as mode (mode)}
  <Row title="Image diff viewer (109:6265) · Mode {mode}">
    <Demo name="Image diff viewer/{mode}" figma="109:6265" h={heights[mode]} w={720}>
      <div class="w720"><ImageDiffViewer {baseline} {current} {regions} {captureKey} {mode} /></div>
    </Demo>
  </Row>
{/each}

<style>
  .w720 {
    display: flex;
    width: 720px;
  }
</style>
