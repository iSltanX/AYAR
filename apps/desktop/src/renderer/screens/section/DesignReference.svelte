<script lang="ts">
  // Screen 10 · the reference board (Figma 10.1 180:16660): the design tokens, the fonts, the state matrix, the render
  // target and the reference images, each with «عرّف…» or «عدّل…». AYAR never judges the interface's beauty: it
  // compares it with a reference the user names, and finds nothing without one. While a reference is missing the board
  // leads the page (10.1); once nothing is missing it folds behind the header's «المرجع» (10.2). A capture of the last
  // run with no reference is offered for approval, never approved by itself.
  import type { BaselineView, CaptureView, CheckSpec, JsonValue } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import CaptureTile from '../../components/CaptureTile.svelte';
  import Icon from '../../components/Icon.svelte';
  import SheetBaselineApproval from '../../components/SheetBaselineApproval.svelte';
  import Tag from '../../components/Tag.svelte';
  import type { CaptureKey, EvidenceImage } from '../../lib/evidence.ts';
  import { useLocale } from '../../lib/locale.ts';
  import { attempt } from '../../app/client.ts';
  import { loadPanelData } from '../../app/panels.ts';
  import type { SectionModel } from '../../app/sections.ts';
  import Panel from './Panel.svelte';

  interface Props {
    projectId: string;
    model: SectionModel;
    ondefine: (ref: string) => void;
    onchanged: () => void;
  }
  let { projectId, model, ondefine, onchanged }: Props = $props();
  const { t } = useLocale();

  const PROBE = ['design.visual', 'design.states', 'design.a11y', 'design.rtl.render'] as const;
  let captures = $state<CaptureView[]>([]);
  let baselines = $state<BaselineView[]>([]);
  async function load(): Promise<void> {
    const d = await loadPanelData(projectId, model, PROBE);
    for (const id of PROBE) {
      const exec = d.get(id)?.[0];
      if (!exec) continue;
      const c = await attempt('captures.list', { checkRunId: exec.exec.check.checkRunId });
      if (c.ok && c.result.captures.length) {
        captures = c.result.captures;
        break;
      }
    }
    const b = await attempt('baselines.list', { projectId });
    if (b.ok) baselines = b.result.baselines.filter((x) => x.status === 'active');
  }
  $effect(() => {
    void load();
  });

  const designSpecs = $derived<CheckSpec[]>(model.profile.checks.filter((s) => s.section === 'design'));
  const declared = (ref: string) => model.profile.references[ref as keyof typeof model.profile.references] !== undefined;
  /** A spec's value is wrapped (`{ declared }` or `{ discovered }`); the profile's own references are the raw values. */
  const wrapped = (ref: string): Record<string, JsonValue> | undefined =>
    designSpecs.map((s) => s.referenceValues[ref]).find((v): v is Record<string, JsonValue> => !!v && typeof v === 'object' && !Array.isArray(v) && ('declared' in v || 'discovered' in v));
  const refValue = (ref: string): JsonValue | undefined => {
    const own = model.profile.references[ref as keyof typeof model.profile.references];
    if (own !== undefined && own !== null) return own;
    const w = wrapped(ref);
    return w ? (w.declared ?? w.discovered ?? undefined) : undefined;
  };
  const discoveredRef = (ref: string) => !declared(ref) && wrapped(ref)?.discovered !== undefined && wrapped(ref)?.discovered !== null;
  const missingRef = (ref: string) => designSpecs.some((s) => s.missing.some((m) => m.kind === 'configuration' && m.ref === ref));
  const list = (v: JsonValue | undefined): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : v && typeof v === 'object' && 'file' in v && typeof v.file === 'string' ? [v.file] : []);
  const target = $derived.by(() => {
    const v = refValue('renderTarget');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  });
  const targetText = $derived.by(() => {
    if (!target) return [];
    const at = (dir: JsonValue | undefined, file: string) => (typeof dir === 'string' && dir !== '.' ? `${dir}/${file}` : file);
    if (target.kind === 'service') return typeof target.url === 'string' ? [target.url] : [];
    if (target.kind === 'extension') return Array.isArray(target.pages) ? target.pages.filter((x): x is string => typeof x === 'string').map((x) => at(target.dir, x)) : typeof target.dir === 'string' ? [target.dir] : [];
    if (typeof target.entry === 'string') return [at(target.dir, target.entry)];
    return typeof target.dir === 'string' ? [target.dir] : [];
  });
  const matrix = $derived.by(() => {
    const states = refValue('states');
    const n = states && typeof states === 'object' && !Array.isArray(states) && Array.isArray((states as { states?: unknown }).states) ? (states as { states: unknown[] }).states.length : null;
    const axis = (k: string) => (target && typeof target[k] === 'object' && target[k] !== null && !Array.isArray(target[k]) && Array.isArray((target[k] as { values?: unknown }).values) ? (target[k] as { values: unknown[] }).values.length : 1);
    const sizes = target && Array.isArray(target.viewports) ? target.viewports.length : 1;
    return n === null ? null : { states: n, sizes, themes: axis('themes'), langs: axis('languages'), total: n * sizes * axis('themes') * axis('languages') };
  });
  /** States kept in a file of the project: the board names the file and the other axes (the file holds the count). */
  const statesFile = $derived.by(() => {
    const v = refValue('states');
    return v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { file?: unknown }).file === 'string' ? (v as { file: string }).file : null;
  });
  const axes = $derived.by(() => {
    const axis = (k: string) => (target && typeof target[k] === 'object' && target[k] !== null && !Array.isArray(target[k]) && Array.isArray((target[k] as { values?: unknown }).values) ? (target[k] as { values: unknown[] }).values.length : 1);
    return { sizes: target && Array.isArray(target.viewports) ? target.viewports.length : 1, themes: axis('themes'), langs: axis('languages') };
  });
  /** The visual comparison needs the reference images: they are «ناقص» only where it applies. */
  const visualApplies = $derived(designSpecs.some((s) => s.checkId === 'design.visual' && s.applicable));
  type RefItem = { ref: string; icon: 'palette' | 'file-text' | 'layers' | 'external-link' | 'image'; values: string[]; missing: boolean; discovered: boolean; note: string };
  const refs = $derived.by<RefItem[]>(() => {
    const item = (ref: 'tokens' | 'fonts' | 'states', icon: RefItem['icon'], values: string[]): RefItem => {
      const missing = missingRef(ref);
      return { ref, icon, values, missing, discovered: discoveredRef(ref), note: t(missing ? `sectionui.design.ref.${ref}Missing` : `sectionui.design.ref.${ref}`) };
    };
    const targetMissing = missingRef('renderTarget');
    return [
      item('tokens', 'palette', list(refValue('tokens'))),
      item('fonts', 'file-text', list(refValue('fonts'))),
      item('states', 'layers', matrix ? [t('sectionui.design.matrix', matrix)] : statesFile ? [t('sectionui.design.matrixFile', { file: statesFile, ...axes })] : []),
      { ref: 'renderTarget', icon: 'external-link', values: targetText, missing: targetMissing, discovered: discoveredRef('renderTarget'), note: t(targetMissing ? 'sectionui.design.ref.targetMissing' : discoveredRef('renderTarget') ? 'sectionui.design.ref.targetDiscovered' : 'sectionui.design.ref.target') },
      { ref: 'baselines', icon: 'image', values: baselines.length ? [t('sectionui.design.baselines', { count: baselines.length })] : [], missing: visualApplies && !baselines.length, discovered: false, note: baselines.length ? t('sectionui.design.ref.baselinesSome') : t('sectionui.design.ref.baselinesNone') },
    ];
  });
  const candidate = $derived(baselines.length ? null : (captures.find((c) => c.comparison === 'no_reference') ?? null));

  // ── the candidate's image (a single-use evidence token, G-DEV5-03) ─────────────────────────────────────────
  let image = $state<EvidenceImage | undefined>(undefined);
  $effect(() => {
    const c = candidate;
    if (!c || image) return;
    void attempt('evidence.token', { evidenceId: c.id }).then((r) => {
      if (r.ok) image = { src: `ayar-evidence://e/${r.result.token}`, width: c.width, height: c.height };
    });
  });
  const tags = (c: CaptureView) => [c.key.state, c.key.viewport, c.key.theme, c.key.lang.toUpperCase()];
  const keyText = (c: CaptureView) => [c.key.state, c.key.viewport, c.key.theme, c.key.lang, c.key.platform, c.key.browser, `${c.key.density}x`, c.key.mode].join(' · ');
  const captureKey = (c: CaptureView): CaptureKey => ({ state: c.key.state, size: c.key.viewport, theme: c.key.theme, language: c.key.lang, platform: c.key.platform, browser: c.key.browser, pixelDensity: `${c.key.density}x` });

  let approving = $state(false);
  async function approve(): Promise<void> {
    approving = false;
    if (!candidate) return;
    const r = await attempt('baseline.approve', { projectId, captureIds: [candidate.id] });
    if (r.ok) {
      await load();
      onchanged();
    }
  }
</script>

<Panel title={t('sectionui.design.reference')} testid="panel-reference" note={t('sectionui.design.referenceNote')}>
  {#each refs as r (r.ref)}
    <div class="ref" data-ref={r.ref}>
      <span class="ref-icon"><Icon name={r.icon} size={16} /></span>
      <div class="ref-body">
        <p class="strong">{t(`sectionui.design.refTitle.${r.ref}` as Parameters<typeof t>[0])}</p>
        <p class="small muted">{r.note}</p>
        {#if r.ref === 'baselines' && candidate}
          <div class="candidate">
            <div class="cand-text">
              <p class="strong">{t('sectionui.design.candidate')}</p>
              <p class="small muted">{t('sectionui.design.candidateNote')}</p>
              <Button kind="secondary" onclick={() => (approving = true)}>{t('sectionui.design.approveBaseline')}</Button>
            </div>
            <div class="cand-tile"><CaptureTile {image} tags={tags(candidate)} fullKey={keyText(candidate)} result="missing-configuration" /></div>
          </div>
        {/if}
      </div>
      <span class="ref-tags">
        {#if r.missing}<Tag icon="circle-alert">{t('status.result.missing-configuration')}</Tag>{/if}
        {#if r.discovered}<Tag>{t('sectionui.design.discovered')}</Tag>{/if}
        {#each r.values.slice(0, 3) as v (v)}<span class="val"><bdi dir="ltr">{v}</bdi></span>{/each}
      </span>
      <Button kind="secondary" onclick={() => ondefine(r.ref)}>{r.missing ? t('ui.action.define') : t('sectionui.design.edit')}</Button>
    </div>
  {/each}
</Panel>

{#if approving && candidate}
  {@const c = candidate}
  {#snippet capture()}{#if image}<img class="capture" src={image.src} width={image.width} height={image.height} alt={keyText(c)} />{/if}{/snippet}
  <SheetBaselineApproval open {capture} captureKey={captureKey(c)} onapprove={() => void approve()} oncancel={() => (approving = false)} />
{/if}

<style>
  .ref {
    display: flex;
    align-items: flex-start;
    gap: var(--space-12);
    padding-block: var(--space-12);
    border-block-end: 1px solid var(--border-subtle);
  }
  .ref-icon {
    display: flex;
    padding-block-start: 2px;
    color: var(--text-secondary);
  }
  .ref-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .ref-body p {
    margin: 0;
  }
  .ref-tags {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    max-inline-size: 320px;
  }
  .val {
    padding: 1px var(--space-8);
    border-radius: 4px;
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .strong {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .small {
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .muted {
    color: var(--text-secondary);
  }
  .candidate {
    display: flex;
    gap: var(--space-16);
    align-items: flex-start;
    margin-block-start: var(--space-8);
  }
  .cand-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-8);
    align-items: flex-start;
  }
  .cand-tile {
    inline-size: 220px;
  }
  .capture {
    display: block;
    max-inline-size: 100%;
    block-size: auto;
  }
</style>
