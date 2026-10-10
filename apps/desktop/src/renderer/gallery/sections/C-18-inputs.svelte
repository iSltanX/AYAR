<script module lang="ts">
  export const meta = { id: 'C-18', title: 'Inputs', figma: '99:144', order: 118 };
</script>

<script lang="ts">
  import ArgumentEditor from '../../components/ArgumentEditor.svelte';
  import Checkbox from '../../components/Checkbox.svelte';
  import Radio from '../../components/Radio.svelte';
  import RadioGroup from '../../components/RadioGroup.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import Segment from '../../components/Segment.svelte';
  import SegmentedControl from '../../components/SegmentedControl.svelte';
  import Select from '../../components/Select.svelte';
  import Switch from '../../components/Switch.svelte';
  import Tab from '../../components/Tab.svelte';
  import Tabs from '../../components/Tabs.svelte';
  import TextField from '../../components/TextField.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { t, lang } = useLocale();
  const uid = $props.id();
  // Sample content from the Figma variants (not UI strings of this phase).
  const S = {
    ar: {
      query: 'beh.unit',
      placeholder: 'مثال: حجم الحزمة',
      value: 'ميزانية الحزمة',
      language: 'العربية',
      other: 'English',
      checkbox: 'وأنشئ بطاقة تحقق',
      radio: ['قبول ← اجتاز (بمراجعة)', 'رفض ← أخفق (بمراجعة)', 'إنذار كاذب'],
      decision: 'القرار',
      sideBySide: 'جنبًا إلى جنب',
      overlay: 'تراكب',
      slider: 'شريط منزلق',
      diffMode: 'طريقة المقارنة',
      report: 'التقرير',
      tabs: 'التبويبات',
    },
    en: {
      query: 'beh.unit',
      placeholder: 'e.g. Bundle size',
      value: 'Bundle budget',
      language: 'English',
      other: 'العربية',
      checkbox: 'And create a verification card',
      radio: ['Accept → Passed (reviewed)', 'Reject → Failed (reviewed)', 'False alarm'],
      decision: 'Decision',
      sideBySide: 'Side by side',
      overlay: 'Overlay',
      slider: 'Slider',
      diffMode: 'Comparison mode',
      report: 'Report',
      tabs: 'Tabs',
    },
  }[lang];

  const languages = [
    { value: 'current', label: S.language },
    { value: 'other', label: S.other },
  ];
  const audience = [
    { value: 'you', label: t('ui.tab.forYou') },
    { value: 'model', label: t('ui.tab.forModel') },
  ];
  const diffModes = [
    { value: 'side', label: S.sideBySide },
    { value: 'overlay', label: S.overlay },
    { value: 'slider', label: S.slider },
  ];
  const decisions = S.radio.map((label, i) => ({ value: `d${i}`, label }));
  const checks = [false, true, 'mixed'] as const;

  let query = $state('');
  let filledQuery = $state(S.query);
  let text = $state('');
  let filledText = $state(S.value);
  let picked = $state('current');
  let on = $state(true);
  let mode = $state<'you' | 'model'>('you');
  let diff = $state<'side' | 'overlay' | 'slider'>('side');
  let inspector = $state('details');
  let results = $state('findings');
  let decision = $state('d0');
  let program = $state('npx');
  let args = $state(['vitest', 'run', '--reporter=json']);
</script>

<Row title="Search field (99:234) · default / filled / disabled">
  <Demo name="Search field/default" figma="99:234" h={28} w={240}><SearchField bind:value={query} /></Demo>
  <Demo name="Search field/filled" figma="99:234" h={28} w={240}><SearchField bind:value={filledQuery} /></Demo>
  <Demo name="Search field/disabled" figma="99:234" h={28} w={240}><SearchField disabled /></Demo>
</Row>

<Row title="Text field (99:268) · default / filled / disabled">
  <Demo name="Text field/default" figma="99:268" h={28} w={320}><TextField bind:value={text} placeholder={S.placeholder} label={S.placeholder} /></Demo>
  <Demo name="Text field/filled" figma="99:268" h={28} w={320}><TextField bind:value={filledText} placeholder={S.placeholder} label={S.placeholder} /></Demo>
  <Demo name="Text field/disabled" figma="99:268" h={28} w={320}><TextField placeholder={S.placeholder} label={S.placeholder} disabled /></Demo>
</Row>

<Row title="Select (99:342) · default / disabled">
  <Demo name="Select/default" figma="99:342" h={28} w={200}><Select bind:value={picked} options={languages} label={S.language} /></Demo>
  <Demo name="Select/disabled" figma="99:342" h={28} w={200}><Select value="current" options={languages} label={S.language} disabled /></Demo>
</Row>

<Row title="Switch (99:428) · On × default / disabled · Label">
  <Demo name="Switch/off" figma="99:428" h={28}><Switch label={t('ui.action.includeScreenshots')} /></Demo>
  <Demo name="Switch/on" figma="99:428" h={28}><Switch bind:checked={on} label={t('ui.action.includeScreenshots')} /></Demo>
  <Demo name="Switch/off/disabled" figma="99:428" h={28}><Switch label={t('ui.action.includeScreenshots')} disabled /></Demo>
  <Demo name="Switch/on/disabled" figma="99:428" h={28}><Switch checked label={t('ui.action.includeScreenshots')} disabled /></Demo>
  <Demo name="Switch/on/no label" figma="99:428" h={28} w={28}><Switch checked label={t('ui.action.includeScreenshots')} showLabel={false} /></Demo>
</Row>

<Row title="Checkbox (100:399) · Checked false / true / mixed × default / disabled · Label">
  {#each checks as checked (checked)}
    <Demo name="Checkbox/{checked}" figma="100:399" h={28}><Checkbox {checked} label={S.checkbox} /></Demo>
  {/each}
  {#each checks as checked (checked)}
    <Demo name="Checkbox/{checked}/disabled" figma="100:399" h={28}><Checkbox {checked} label={S.checkbox} disabled /></Demo>
  {/each}
  <Demo name="Checkbox/true/no label" figma="100:399" h={28} w={28}><Checkbox checked label={S.checkbox} showLabel={false} /></Demo>
</Row>

<Row title="Radio (114:8652) · Selected × default / disabled, and a group">
  <Demo name="Radio/false" figma="114:8652" h={28}><Radio name="{uid}-r1" value="a" label={S.radio[0]!} /></Demo>
  <Demo name="Radio/true" figma="114:8652" h={28}><Radio name="{uid}-r2" value="a" label={S.radio[0]!} checked /></Demo>
  <Demo name="Radio/false/disabled" figma="114:8652" h={28}><Radio name="{uid}-r3" value="a" label={S.radio[0]!} disabled /></Demo>
  <Demo name="Radio/true/disabled" figma="114:8652" h={28}><Radio name="{uid}-r4" value="a" label={S.radio[0]!} checked disabled /></Demo>
  <Demo name="Radio/group" figma="114:8652" h={84}><RadioGroup bind:value={decision} options={decisions} label={S.decision} /></Demo>
</Row>

<Row title="Segment (100:453) · Selected × default / disabled">
  <Demo name="Segment/selected" figma="100:453" h={28}><div role="radiogroup" aria-label={S.report} class="hold"><Segment selected>{t('ui.tab.forYou')}</Segment></div></Demo>
  <Demo name="Segment/unselected" figma="100:453" h={28}><div role="radiogroup" aria-label={S.report} class="hold"><Segment>{t('ui.tab.forModel')}</Segment></div></Demo>
  <Demo name="Segment/selected/disabled" figma="100:453" h={28}><div role="radiogroup" aria-label={S.report} class="hold"><Segment selected disabled>{t('ui.tab.forYou')}</Segment></div></Demo>
  <Demo name="Segment/unselected/disabled" figma="100:453" h={28}><div role="radiogroup" aria-label={S.report} class="hold"><Segment disabled>{t('ui.tab.forModel')}</Segment></div></Demo>
</Row>

<Row title="Segmented control (100:483) · Options 2 / 3">
  <Demo name="Segmented control/2" figma="100:483" h={32}><SegmentedControl bind:value={mode} options={audience} label={S.report} /></Demo>
  <Demo name="Segmented control/3" figma="100:483" h={32}><SegmentedControl bind:value={diff} options={diffModes} label={S.diffMode} /></Demo>
  <Demo name="Segmented control/2/disabled" figma="100:483" h={32}><SegmentedControl value="you" options={audience} label={S.report} disabled /></Demo>
</Row>

<Row title="Tab (100:549) · Selected × default / disabled">
  <Demo name="Tab/selected" figma="100:549" h={32}><div role="tablist" aria-label={S.tabs} class="hold"><Tab selected>{t('controls.tab.details')}</Tab></div></Demo>
  <Demo name="Tab/unselected" figma="100:549" h={32}><div role="tablist" aria-label={S.tabs} class="hold"><Tab>{t('controls.tab.log')}</Tab></div></Demo>
  <Demo name="Tab/unselected/disabled" figma="100:549" h={32}><div role="tablist" aria-label={S.tabs} class="hold"><Tab disabled>{t('controls.tab.log')}</Tab></div></Demo>
</Row>

<Row title="Tabs (100:607) · Kind inspector (380) / results (720)">
  <Demo name="Tabs/inspector" figma="100:607" h={33} w={380}><div class="w380"><Tabs kind="inspector" bind:value={inspector} label={S.tabs} /></div></Demo>
  <Demo name="Tabs/results" figma="100:607" h={33} w={720}><div class="w720"><Tabs kind="results" bind:value={results} label={S.tabs} /></div></Demo>
</Row>

<Row title="Argument editor (100:889)">
  <Demo name="Argument editor/default" figma="100:889" h={262} w={358}><ArgumentEditor bind:program bind:args /></Demo>
</Row>

<style>
  .hold {
    display: inline-flex;
  }
  .w380 {
    inline-size: 380px;
  }
  .w720 {
    inline-size: 720px;
  }
</style>
