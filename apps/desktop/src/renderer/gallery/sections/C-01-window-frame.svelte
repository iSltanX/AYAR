<script module lang="ts">
  export const meta = { id: 'C-01', title: 'Window frame: title bar and window frame', figma: '102:1510', order: 101 };
</script>

<script lang="ts">
  import Inspector from '../../components/Inspector.svelte';
  import RunBar from '../../components/RunBar.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import Sidebar from '../../components/Sidebar.svelte';
  import TitleBar from '../../components/TitleBar.svelte';
  import WindowFrame from '../../components/WindowFrame.svelte';
  import type { InspectorCheck } from '../../lib/inspector.ts';
  import { useLocale } from '../../lib/locale.ts';
  import type { ResultCount, WindowControls } from '../../lib/shell.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { t, lang } = useLocale();
  const uid = $props.id();
  const S = {
    ar: {
      project: 'مكتبة «النصوص»',
      path: '~/مشاريع تجريبية/مكتبة «النصوص»',
      page: 'النتائج',
      content: 'المحتوى',
      inspector: 'المفتش · 380 (المكوّن 16)',
      check: 'اختبارات الوحدة',
      definition: 'يشغّل اختبارات الوحدة في المشروع ويعدّ الإخفاقات بدليل من تقرير الأداة.',
      why: 'مطلوب لمعيار «صحة السلوك».',
      limits: 'لا يقيس قوة الاختبارات: قوة الاختبار غير مثبتة.',
    },
    en: {
      project: 'Texts library',
      path: '~/Test projects/Texts library',
      page: 'Results',
      content: 'Content',
      inspector: 'Inspector · 380 (component 16)',
      check: 'Unit tests',
      definition: 'Runs the project unit tests and counts failures from the tool report.',
      why: 'Required for the «Behavior correctness» criterion.',
      limits: 'Does not measure test strength: test strength unverified.',
    },
  }[lang];
  const crumbs = [{ label: t('ui.nav.projects') }, { label: S.project }];
  const controls = ['left', 'right'] as const;
  const counts: ResultCount[] = [
    { result: 'passed', count: 5 },
    { result: 'failed', count: 1 },
    { result: 'warning', count: 1 },
  ];
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
  };
  // Figma 102:2570 (Direction × Controls, booleans Run bar and Inspector): the panel's language is the
  // Direction; the slots hold placeholders as in Figma, and one specimen holds a real inspector.
  const frames: { name: string; controls: WindowControls; runbar: boolean; inspector: 'slot' | 'real' | 'none' }[] = [
    { name: 'controls-left', controls: 'left', runbar: false, inspector: 'slot' },
    { name: 'controls-right', controls: 'right', runbar: false, inspector: 'slot' },
    { name: 'controls-left/run-bar', controls: 'left', runbar: true, inspector: 'real' },
    { name: 'controls-right/run-bar/no-inspector', controls: 'right', runbar: true, inspector: 'none' },
  ];
</script>

<Row title="Title bar (102:1666) · Controls left / right (the window buttons are drawn by macOS, D-DES3-05)">
  {#each controls as c (c)}
    <div class="scroll">
      <div class="frame">
        <Demo name="Title bar/controls-{c}" figma="102:1666" h={53} w={1360} width="fill">
          <TitleBar controls={c} title={S.page} breadcrumb={crumbs} primary={{ label: t('ui.action.startFullScan') }}>
            {#snippet search()}<SearchField width={200} />{/snippet}
          </TitleBar>
        </Demo>
      </div>
    </div>
  {/each}
</Row>

{#snippet runBar()}
  <RunBar status="running" kind={t('shell.runBar.kind.fullScan')} done={7} total={18} elapsed={134} {counts} />
{/snippet}

<Row title="Window frame (102:2570) · Controls left / right · Run bar · Inspector · 1360×860 (minimum 1100×720)">
  {#each frames as f, i (f.name)}
    <div class="scroll">
      <div class="frame">
        <Demo name="Window frame/{f.name}" figma="102:2570" h={860} w={1360} width="fill">
          <div class="window">
            <WindowFrame
              controls={f.controls}
              title={S.page}
              breadcrumb={crumbs}
              primary={{ label: t('ui.action.startFullScan') }}
              inspectorOpen={f.inspector !== 'none'}
              inspectorId={f.inspector === 'real' ? `inspector-${uid}-${i}` : undefined}
              runbar={f.runbar ? runBar : undefined}
            >
              {#snippet search()}<SearchField width={200} />{/snippet}
              {#snippet sidebar()}
                <Sidebar
                  project={{ name: S.project, path: S.path }}
                  current="overview"
                  badges={{ security: { kind: 'failures', count: 3 }, behavior: { kind: 'missing' } }}
                />
              {/snippet}
              {#snippet content()}<p class="placeholder">{S.content}</p>{/snippet}
              {#snippet inspector()}
                {#if f.inspector === 'real'}
                  <Inspector content={check} id={`inspector-${uid}-${i}`} />
                {:else}
                  <p class="placeholder slot">{S.inspector}</p>
                {/if}
              {/snippet}
            </WindowFrame>
          </div>
        </Demo>
      </div>
    </div>
  {/each}
</Row>

<style>
  .scroll {
    width: 100%;
    overflow-x: auto;
  }
  .frame {
    width: 1360px;
  }
  .window {
    display: flex;
    width: 1360px;
    height: 860px;
  }
  .placeholder {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    margin: 0;
    font: var(--type-body);
    color: var(--text-secondary);
  }
  .slot {
    border-inline-start: 1px solid var(--border-subtle);
  }
</style>
