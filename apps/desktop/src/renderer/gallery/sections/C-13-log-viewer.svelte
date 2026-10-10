<script module lang="ts">
  export const meta = { id: 'C-13', title: 'Log viewer', figma: '108:6031', order: 113 };
</script>

<script lang="ts">
  import LogViewer from '../../components/LogViewer.svelte';
  import type { LogLine } from '../../lib/evidence.ts';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  // U+202E RIGHT-TO-LEFT OVERRIDE, built from its code point so the source itself carries no control.
  const RLO = String.fromCodePoint(0x202e);
  const token = { ar: 'رمز GitHub', en: 'GitHub token' }[lang];
  const lines: LogLine[] = [
    { number: 1, muted: true, segments: [{ kind: 'text', text: '$ npx vitest run --reporter=json' }] },
    { number: 2, muted: true, segments: [{ kind: 'text', text: ' RUN  v3.2.4  ~/projects/texts' }] },
    { number: 3, segments: [{ kind: 'text', text: '✓ normalize › trims spaces (4 ms)' }] },
    { number: 4, segments: [{ kind: 'text', text: 'GITHUB_TOKEN=' }, { kind: 'redacted', what: token }] },
    { number: 5, segments: [{ kind: 'text', text: `const label = "abc${RLO}cba"` }] },
    { number: 6, segments: [{ kind: 'text', text: '✗ normalize › folds alef forms' }] },
    { number: 7, muted: true, segments: [{ kind: 'text', text: '  expected "اكتب" received "أكتب"' }] },
  ];
</script>

<Row title="Log viewer (108:6245) · Follow on">
  <Demo name="Log viewer/follow-on" figma="108:6245" h={231} w={720}>
    <div class="w720"><LogViewer {lines} totalLines={412} truncatedAtMb={50} /></div>
  </Demo>
</Row>
<Row title="Log viewer · Follow off">
  <Demo name="Log viewer/follow-off" figma="108:6245" h={231} w={720}>
    <div class="w720"><LogViewer {lines} totalLines={412} truncatedAtMb={50} follow={false} /></div>
  </Demo>
</Row>
<Row title="Log viewer · search highlights matches">
  <Demo name="Log viewer/search" figma="108:6245" w={720}>
    <div class="w720"><LogViewer {lines} totalLines={412} query="normalize" follow={false} /></div>
  </Demo>
</Row>

<style>
  .w720 {
    display: flex;
    width: 720px;
  }
</style>
