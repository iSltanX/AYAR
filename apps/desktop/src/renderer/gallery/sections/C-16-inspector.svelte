<script module lang="ts">
  export const meta = { id: 'C-16', title: 'Inspector', figma: '111:6802', order: 116 };
</script>

<script lang="ts">
  import Inspector from '../../components/Inspector.svelte';
  import type { LogLine } from '../../lib/evidence.ts';
  import type { InspectorCheck, InspectorContent, InspectorFinding, InspectorLog } from '../../lib/inspector.ts';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang, dir } = useLocale();
  // The Figma sample data (111:7922), in both languages.
  const S = {
    ar: {
      check: 'اختبارات الوحدة',
      definition: 'يشغّل اختبارات الوحدة في المشروع ويعدّ الإخفاقات بدليل من تقرير الأداة.',
      why: 'مطلوب لمعيار «صحة السلوك».',
      limits: 'لا يقيس قوة الاختبارات: قوة الاختبار غير مثبتة.',
      title: 'رمز وصول GitHub مكتوب في ملف الإعداد',
      handle: 'رمز حقيقي في ملف متتبع. ألغِه من GitHub أولًا، ثم أثبت زواله بإعادة الفحص.',
      model: 'الدالة تحذف التشكيل فيختلف الناتج عن المتوقع. هذا تعديل في الشيفرة يناسب نموذجك.',
      review: 'تغيّرت صفحة الإعدادات عن الصورة المرجعية. هل التغيير مقصود؟ القرار لك.',
      token: 'رمز GitHub',
      expected: 'لا أسرار في الملفات المتتبعة',
      actual: 'السطر 14 يطابق نمط رمز GitHub',
      findingLimits: 'يفحص الملفات المتتبعة فقط، لا تاريخ Git.',
      forModel: 'معاينة تقرير «للنموذج» لهذا الاكتشاف',
    },
    en: {
      check: 'Unit tests',
      definition: 'Runs the project unit tests and counts failures from the tool report.',
      why: 'Required for the «Behavior correctness» criterion.',
      limits: 'Does not measure test strength: test strength unverified.',
      title: 'GitHub access token written in a config file',
      handle: 'A real token is in a tracked file. Revoke it on GitHub first, then prove it is gone by re-checking.',
      model: 'The function strips diacritics, so the output differs from what is expected. This is a code change for your model.',
      review: 'The settings page changed from its baseline. Was the change intended? The decision is yours.',
      token: 'GitHub token',
      expected: 'No secrets in tracked files',
      actual: 'Line 14 matches the GitHub token pattern',
      findingLimits: 'Scans tracked files only, not Git history.',
      forModel: 'Preview of the «For the model» report of this finding',
    },
  }[lang];

  // U+202E RIGHT-TO-LEFT OVERRIDE, built from its code point so the source itself carries no control.
  const RLO = String.fromCodePoint(0x202e);
  const lines: LogLine[] = [
    { number: 1, muted: true, segments: [{ kind: 'text', text: '$ npx vitest run --reporter=json' }] },
    { number: 2, muted: true, segments: [{ kind: 'text', text: ' RUN  v3.2.4  ~/projects/texts' }] },
    { number: 3, segments: [{ kind: 'text', text: '✓ normalize › trims spaces (4 ms)' }] },
    { number: 4, segments: [{ kind: 'text', text: 'GITHUB_TOKEN=' }, { kind: 'redacted', what: S.token }] },
    { number: 5, segments: [{ kind: 'text', text: `const label = "abc${RLO}cba"` }] },
    { number: 6, segments: [{ kind: 'text', text: '✗ normalize › folds alef forms' }] },
    { number: 7, muted: true, segments: [{ kind: 'text', text: '  expected "اكتب" received "أكتب"' }] },
  ];
  const log = { lines, totalLines: 412, truncatedAtMb: 50 };

  const check: InspectorCheck = {
    kind: 'check',
    name: S.check,
    id: 'beh.unit',
    result: 'failed',
    runId: 'RUN-20261009-003',
    definition: S.definition,
    why: S.why,
    limits: S.limits,
    command: { command: 'npx vitest run --reporter=json', runsCode: true },
    readiness: 'ready',
    log,
  };
  const reviewed: InspectorCheck = {
    ...check,
    result: 'passed-reviewed',
    review: { decision: 'accept', scope: 'src/settings/*', date: '2026-10-09', original: 'needs-review' },
  };
  const finding: InspectorFinding = {
    kind: 'finding',
    title: S.title,
    id: 'AYR-SEC-SECRET-0003',
    severity: 'critical',
    proof: 'proven',
    origin: 'project',
    nextStep: { kind: 'handle-directly', impact: S.handle, action: 'proveByRecheck' },
    copy: { characters: 12430, redactions: 2, redactedKinds: S.token },
    location: { path: 'src/config/deploy.ts', line: 14 },
    expected: S.expected,
    actual: S.actual,
    excerpt: [
      { kind: 'text', text: '14  token: ' },
      { kind: 'redacted', what: S.token },
    ],
    reproduce: { command: 'gitleaks detect --source . --no-git' },
    rule: 'gitleaks 8.28 · github-pat',
    limits: S.findingLimits,
    firstSeen: 'RUN-20261009-003',
  };
  const needsModel: InspectorFinding = { ...finding, nextStep: { kind: 'needs-model', impact: S.model } };
  const needsReview: InspectorFinding = { ...finding, nextStep: { kind: 'needs-review', impact: S.review } };
  const logLine: InspectorLog = { kind: 'log', line: 6, check: S.check, ...log };

  // Figma 111:7922: the English copy note and next-step impact wrap to more lines than the Arabic ones. The
  // finding heights are Figma's minus 26: Figma's reproduce Command block keeps its empty flags row (18 + gap 8)
  // although no flag is shown; the component draws no empty row (C-12), so the block is 28, not 54.
  const variants: { name: string; content: InspectorContent; h: { rtl: number; ltr: number } }[] = [
    { name: 'check', content: check, h: { rtl: 575, ltr: 575 } },
    { name: 'check-reviewed', content: reviewed, h: { rtl: 857, ltr: 857 } },
    { name: 'finding', content: finding, h: { rtl: 1042 - 26, ltr: 1062 - 26 } },
    { name: 'finding-needs-model', content: needsModel, h: { rtl: 1034 - 26, ltr: 1078 - 26 } },
    { name: 'log', content: logLine, h: { rtl: 303, ltr: 303 } },
  ];
</script>

<Row title="Inspector (111:7922) · Content check / check-reviewed / finding / finding-needs-model / log · 380, divider on the content side">
  {#each variants as v (v.name)}
    <Demo name="Inspector/{v.name}" figma="111:7922" h={v.h[dir]} w={380}>
      <Inspector content={v.content} />
    </Demo>
  {/each}
</Row>

<Row title="Inspector · interaction states (not Figma variants): the Log tab of a check, «للنموذج» of a finding, a needs-review finding (no «سجّل مراجعة»)">
  <Demo name="Inspector/check/log-tab" figma="111:7922" w={380}>
    <Inspector content={check} tab="log" />
  </Demo>
  <Demo name="Inspector/finding/for-model" figma="111:7922" w={380}>
    <Inspector content={finding} view="for-model">
      {#snippet formodel()}<p class="preview">{S.forModel}</p>{/snippet}
    </Inspector>
  </Demo>
  <Demo name="Inspector/finding-needs-review" figma="111:7922" w={380}>
    <Inspector content={needsReview} />
  </Demo>
</Row>

<style>
  .preview {
    margin: 0;
    font: var(--type-body);
    color: var(--text-secondary);
  }
</style>
