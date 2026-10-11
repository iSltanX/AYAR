<script module lang="ts">
  export const meta = { id: 'C-30', title: 'DES-4 additions', figma: '139:10340', order: 130 };
</script>

<script lang="ts">
  // The four components DES-4 added (D-DES4-03), built by DEV-11 the way DEV-10 built the library (G-WAVE4-01):
  // Drop zone, Risk notice, Resource meter and Report data block, at the sizes Figma gives them.
  import DropZone from '../../components/DropZone.svelte';
  import ReportDataBlock from '../../components/ReportDataBlock.svelte';
  import ResourceMeter from '../../components/ResourceMeter.svelte';
  import RiskNotice from '../../components/RiskNotice.svelte';
  import type { LogSegment } from '../../lib/evidence.ts';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  const opening = { ar: '<<<AYAR-DATA 7f3a9c · المصدر: سجل beh.unit · 88–90>>>', en: '<<<AYAR-DATA 7f3a9c · source: beh.unit log · 88–90>>>' }[lang];
  const lines: LogSegment[][] = [
    [{ kind: 'text', text: '  FAIL src/auth/session.test.ts > rejects expired token' }],
    [{ kind: 'text', text: '  token:' }, { kind: 'redacted', what: { ar: 'رمز GitHub', en: 'GitHub token' }[lang] }],
  ];
  const cpu = [12, 30, 22, 41, 38, 35, 44, 38];
  const memory = [0.9e9, 1.0e9, 1.05e9, 1.1e9, 1.15e9, 1.2e9, 1.2e9, 1.2e9];
</script>

<Row title="Drop zone (139:10348) · State default / active">
  <Demo name="Drop zone/default" figma="139:10256" h={120} w={480}><DropZone /></Demo>
  <Demo name="Drop zone/active" figma="139:10261" h={120} w={480}><DropZone active /></Demo>
</Row>

<Row title="Risk notice (139:10350)">
  <div class="w640">
    <Demo name="Risk notice" figma="139:10276" w={640} width="fill"><RiskNotice /></Demo>
  </div>
</Row>

<Row title="Resource meter (139:10352)">
  <Demo name="Resource meter" figma="139:10300" h={20}><ResourceMeter cpuPercent={38} memoryBytes={1.2e9} cpuHistory={cpu} memoryHistory={memory} /></Demo>
</Row>

<Row title="Report data block (139:10354) · with the redaction line">
  <div class="w640">
    <Demo name="Report data block" figma="139:10318" h={108} w={640} width="fill"><ReportDataBlock {opening} {lines} closing="<<<END AYAR-DATA 7f3a9c>>>" /></Demo>
  </div>
</Row>

<style>
  .w640 {
    display: flex;
    flex-direction: column;
    width: 640px;
    max-width: 100%;
  }
</style>
