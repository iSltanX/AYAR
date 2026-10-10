<script module lang="ts">
  export const meta = { id: 'C-19', title: 'Sheets and native destructive alerts', figma: '114:8568', order: 119 };
</script>

<script lang="ts">
  import Button from '../../components/Button.svelte';
  import SheetApprovalDiff from '../../components/SheetApprovalDiff.svelte';
  import SheetBaselineApproval from '../../components/SheetBaselineApproval.svelte';
  import SheetCancelConfirmation from '../../components/SheetCancelConfirmation.svelte';
  import SheetExportReport from '../../components/SheetExportReport.svelte';
  import SheetHumanReview from '../../components/SheetHumanReview.svelte';
  import SheetPermissionExplanation from '../../components/SheetPermissionExplanation.svelte';
  import SheetReRun from '../../components/SheetReRun.svelte';
  import SheetSaveGroup from '../../components/SheetSaveGroup.svelte';
  import SheetScoringDetails from '../../components/SheetScoringDetails.svelte';
  import SheetSetupPanel from '../../components/SheetSetupPanel.svelte';
  import SheetSetupPreview from '../../components/SheetSetupPreview.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { destructiveAlert } from '../../lib/native-alerts.ts';
  import type { CommandChange, ScoredCriterion, ScoringSummary, SetupAction } from '../../lib/sheets.ts';
  import Demo from '../Demo.svelte';
  import NativeAlertPreview from '../NativeAlertPreview.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  // Sample content from the Figma variants (content the engine provides, not UI strings).
  const S = {
    ar: {
      action: 'تثبيت التبعيات',
      unitTests: 'اختبارات الوحدة',
      typeCheck: 'فحص الأنواع',
      build: 'البناء',
      group: 'فحوص الواجهة قبل الإصدار',
      groupChecks: ['لقطات الواجهة', 'إتاحة الواجهة', 'ميزانية الحزمة'],
      setup: [
        ['ثبّت التبعيات', 'node_modules'],
        ['ثبّت Playwright Chromium', 'متصفح المسبار'],
        ['اعتمد أمر beh.unit', 'اعتماد'],
      ],
      criteria: ['صحة السلوك', 'سلامة الأنواع', 'خلو الأسرار', 'الإتاحة'],
      key: { state: 'فارغ', size: '1280×800', theme: 'داكن', language: 'العربية', platform: 'macOS 26', browser: 'Chromium 140', pixelDensity: '2x' },
      subject: 'الإتاحة البشرية',
      claim: 'دالة التوحيد لا تعالج الهمزة على الواو.',
      project: 'مكتبة النصوص',
      openModal: 'افتح تأكيد الإلغاء في نافذة حقيقية',
    },
    en: {
      action: 'install dependencies',
      unitTests: 'Unit tests',
      typeCheck: 'Type check',
      build: 'Build',
      group: 'UI checks before release',
      groupChecks: ['UI captures', 'UI accessibility', 'Bundle budget'],
      setup: [
        ['Install dependencies', 'node_modules'],
        ['Install Playwright Chromium', 'probe browser'],
        ['Approve the beh.unit command', 'approval'],
      ],
      criteria: ['Behavior correctness', 'Type safety', 'No secrets', 'Accessibility'],
      key: { state: 'empty', size: '1280×800', theme: 'dark', language: 'Arabic', platform: 'macOS 26', browser: 'Chromium 140', pixelDensity: '2x' },
      subject: 'human accessibility',
      claim: 'The normalise function does not handle hamza on waw.',
      project: 'Texts library',
      openModal: 'Open the cancel confirmation (modal)',
    },
  }[lang];

  const preview = { action: S.action, command: 'npm ci', runsCode: true, writePath: 'node_modules/', networkDestination: 'registry.npmjs.org', sizeMb: 180 };
  const changes: CommandChange[] = [
    {
      id: 'beh.unit',
      name: S.unitTests,
      lines: [
        { kind: 'context', text: 'npx vitest run' },
        { kind: 'removed', text: '  --reporter=json' },
        { kind: 'added', text: '  --reporter=json --coverage' },
      ],
    },
    {
      id: 'code.types',
      name: S.typeCheck,
      lines: [
        { kind: 'removed', text: 'npx tsc --noEmit' },
        { kind: 'added', text: 'npx tsc -p tsconfig.app.json --noEmit' },
      ],
    },
  ];
  const groupChecks = ['ui.capture', 'ui.a11y', 'perf.bundle'].map((id, i) => ({ id, name: S.groupChecks[i]! }));
  const actions: SetupAction[] = [
    { id: 'deps', title: S.setup[0]![0]!, missing: S.setup[0]![1]!, waiting: 6, state: 'running', writesToProject: true, canApply: true },
    { id: 'chromium', title: S.setup[1]![0]!, missing: S.setup[1]![1]!, waiting: 4, state: 'queued', writesToProject: false, canApply: true },
    { id: 'approve', title: S.setup[2]![0]!, missing: S.setup[2]![1]!, waiting: 1, state: 'completed', writesToProject: false, canApply: false },
  ];
  const criteria: ScoredCriterion[] = [
    { name: S.criteria[0]!, checks: [{ id: 'beh.unit', result: 'passed' }, { id: 'beh.e2e', result: 'failed' }], passed: 1, total: 2 },
    { name: S.criteria[1]!, checks: [{ id: 'code.types', result: 'passed' }], passed: 1, total: 1 },
    { name: S.criteria[2]!, checks: [{ id: 'sec.secrets', result: 'passed' }], passed: 1, total: 1 },
    { name: S.criteria[3]!, checks: [{ id: 'ui.a11y', result: 'needs-review' }, { id: 'ui.contrast', result: 'passed' }], passed: 1, total: 2 },
  ];
  const summary: ScoringSummary = {
    criteria: 13,
    requiredChecks: 15,
    average: 0.79,
    karatRaw: 18.96,
    karat: 18,
    blockingFailures: 0,
    pendingReviews: 1,
    excludedByReview: 2,
    openIntegrityItems: 0,
    notApplicable: 3,
    appVersion: '0.1.0',
    catalogVersion: '2026.10',
  };
  const alerts = [
    destructiveAlert('remove-project', { name: S.project }),
    destructiveAlert('delete-runs', { count: 12 }),
    destructiveAlert('remove-tool', { name: 'Playwright Chromium' }),
    destructiveAlert('purge-data', {}),
  ];

  // Figma heights of the native alert stand-ins (116:9399), per kind and language.
  const alertHeights = { ar: [246, 246, 290, 266], en: [290, 266, 290, 286] }[lang];

  let modalOpen = $state(false);
</script>

{#snippet mockCapture()}
  <span class="mock bar"></span>
  <span class="mock heading"></span>
  <span class="mock line l1"></span>
  <span class="mock line l2"></span>
  <span class="mock card c1"></span>
  <span class="mock card c2"></span>
{/snippet}

<Row title="Sheet/Setup preview (114:8794)">
  <Demo name="Sheet/Setup preview" figma="114:8794" h={488} w={560}><SheetSetupPreview inline data={preview} /></Demo>
</Row>

<Row title="Sheet/Approval diff (114:8898): neutral shading with + / −">
  <Demo name="Sheet/Approval diff" figma="114:8898" h={lang === 'ar' ? 406 : 430} w={560}><SheetApprovalDiff inline {changes} /></Demo>
</Row>

<Row title="Sheet/Export report (114:9070) · default / evidence-bundle">
  <Demo name="Sheet/Export report/default" figma="114:9070" h={326} w={560}><SheetExportReport inline /></Demo>
  <Demo name="Sheet/Export report/evidence-bundle" figma="114:9070" h={406} w={560}>
    <SheetExportReport inline format="evidence-bundle" includeScreenshots />
  </Demo>
</Row>

<Row title="Sheet/Re-run (114:9290) · failed / incomplete">
  <Demo name="Sheet/Re-run/failed" figma="114:9290" h={286} w={560}>
    <SheetReRun inline variant="failed" counts={{ failed: 4, flaky: 1, unavailable: 1, 'timed-out': 0 }} dependencies={[S.build]} />
  </Demo>
  <Demo name="Sheet/Re-run/incomplete" figma="114:9290" h={342} w={560}>
    <SheetReRun
      inline
      variant="incomplete"
      counts={{ missing: 2, unavailable: 1, 'timed-out': 1, cancelled: 0, interrupted: 1, skipped: 0 }}
      dependencies={[S.build]}
    />
  </Demo>
</Row>

<Row title="Sheet/Save group (115:8941) · Sheet/Permission explanation (115:8989)">
  <Demo name="Sheet/Save group" figma="115:8941" h={310} w={560}><SheetSaveGroup inline checks={groupChecks} name={S.group} /></Demo>
  <Demo name="Sheet/Permission explanation" figma="115:8989" h={334} w={560}>
    <SheetPermissionExplanation inline location="documents" path="~/Documents/مشاريع تجريبية/مكتبة «النصوص»" />
  </Demo>
</Row>

<Row title="Sheet/Setup panel (115:9207)">
  <Demo name="Sheet/Setup panel" figma="115:9207" h={622} w={560}><SheetSetupPanel inline {actions} /></Demo>
</Row>

<Row title="Sheet/Scoring details (115:9403, 720)">
  <Demo name="Sheet/Scoring details" figma="115:9403" h={578} w={720}><SheetScoringDetails inline {criteria} {summary} /></Demo>
</Row>

<Row title="Sheet/Baseline approval (116:9091)">
  <Demo name="Sheet/Baseline approval" figma="116:9091" h={554} w={560}>
    <SheetBaselineApproval inline capture={mockCapture} captureKey={S.key} />
  </Demo>
</Row>

<Row title="Sheet/Human review (116:9241) · check / model-claim">
  <Demo name="Sheet/Human review/check" figma="116:9241" h={418} w={560}>
    <SheetHumanReview inline variant="check" subject={S.subject} scope="src/settings/*" />
  </Demo>
  <Demo name="Sheet/Human review/model-claim" figma="116:9241" h={378} w={560}>
    <SheetHumanReview inline variant="model-claim" claim={{ id: 'AI-LOGIC-001.3', text: S.claim }} />
  </Demo>
</Row>

<Row title="Sheet/Cancel confirmation (116:9269, 448) · and the same sheet as a real modal <dialog>">
  <Demo name="Sheet/Cancel confirmation" figma="116:9269" h={186} w={448}><SheetCancelConfirmation inline /></Demo>
  <Demo name="Sheet/Cancel confirmation/modal" figma="116:9269">
    <Button onclick={() => (modalOpen = true)}>{S.openModal}</Button>
    <SheetCancelConfirmation open={modalOpen} oncancel={() => (modalOpen = false)} oncancelrun={() => (modalOpen = false)} />
  </Demo>
</Row>

<Row title="Native alert/Destructive confirmation (116:9399): NSAlert from the main process, not a sheet (D-DEV3-15, D-DES3-06)">
  {#each alerts as model, i (model.kind)}
    <Demo name="Native alert/Destructive confirmation/{model.kind}" figma="116:9399" h={alertHeights[i]} w={260}><NativeAlertPreview {model} /></Demo>
  {/each}
</Row>

<style>
  .mock {
    position: absolute;
    border-radius: 2px;
  }
  .bar {
    top: 0;
    left: 0;
    width: 512px;
    height: 36px;
    background: var(--bg-sunken);
  }
  .heading {
    top: 64px;
    left: 32px;
    width: 240px;
    height: 8px;
    background: var(--border-strong);
  }
  .line {
    left: 32px;
    height: 6px;
    background: var(--border-subtle);
  }
  .l1 {
    top: 90px;
    width: 420px;
  }
  .l2 {
    top: 106px;
    width: 380px;
  }
  .card {
    top: 180px;
    width: 200px;
    height: 80px;
    background: var(--bg-sunken);
  }
  .c1 {
    left: 32px;
  }
  .c2 {
    left: 280px;
  }
</style>
