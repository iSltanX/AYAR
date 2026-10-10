<script module lang="ts">
  export const meta = { id: 'C-14', title: 'Image diff viewer', figma: '109:5955', order: 114 };
</script>

<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import ImageDiffViewer from '../../components/ImageDiffViewer.svelte';
  import { DIFF_MODES, type CaptureKey, type ChangedRegion } from '../../lib/evidence.ts';
  import { useLocale } from '../../lib/locale.ts';
  import baselineDark from '../assets/capture-baseline-dark.svg';
  import baselineLight from '../assets/capture-baseline.svg';
  import currentDark from '../assets/capture-current-dark.svg';
  import currentLight from '../assets/capture-current.svg';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  const CAPTURES = {
    light: { baseline: { src: baselineLight, width: 1280, height: 800 }, current: { src: currentLight, width: 1280, height: 800 } },
    dark: { baseline: { src: baselineDark, width: 1280, height: 800 }, current: { src: currentDark, width: 1280, height: 800 } },
  };
  // Captures follow the captured app's theme: the panel's theme by default, and the other one in the last row,
  // so the two-tone marks are seen on light and dark pixels in both themes.
  let theme = $state<'light' | 'dark'>('light');
  const probe: Attachment<HTMLElement> = (el) => {
    theme = el.closest('[data-theme]')?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  };
  const other = $derived(theme === 'dark' ? 'light' : 'dark');
  const regions: ChangedRegion[] = [{ x: 640, y: 463, width: 587, height: 241 }];
  const keys = {
    ar: { state: 'فارغ', size: '1280×800', language: 'العربية', platform: 'macOS 26', browser: 'Chromium 140', pixelDensity: '2x' },
    en: { state: 'empty', size: '1280×800', language: 'Arabic', platform: 'macOS 26', browser: 'Chromium 140', pixelDensity: '2x' },
  }[lang];
  const themeName = { ar: { light: 'فاتح', dark: 'داكن' }, en: { light: 'light', dark: 'dark' } }[lang];
  const keyFor = (t: 'light' | 'dark'): CaptureKey => ({ ...keys, theme: themeName[t] });
  const heights = { 'side-by-side': 362, overlay: 450, slider: 450 } as const;
</script>

<div class="probe" {@attach probe}>
  {#each DIFF_MODES as mode (mode)}
    <Row title="Image diff viewer (109:6265) · Mode {mode}">
      <Demo name="Image diff viewer/{mode}" figma="109:6265" h={heights[mode]} w={720}>
        <div class="w720"><ImageDiffViewer {...CAPTURES[theme]} {regions} captureKey={keyFor(theme)} {mode} /></div>
      </Demo>
    </Row>
  {/each}
  <Row title="Image diff viewer · slider over captures of the other theme (two-tone marks)">
    <Demo name="Image diff viewer/slider/other-theme capture" figma="109:6265" h={450} w={720}>
      <div class="w720"><ImageDiffViewer {...CAPTURES[other]} {regions} captureKey={keyFor(other)} mode="slider" position={25} /></div>
    </Demo>
  </Row>
</div>

<style>
  .probe {
    display: contents;
  }
  .w720 {
    display: flex;
    width: 720px;
  }
</style>
