<script module lang="ts">
  export const meta = { id: 'S-04', title: 'Tags and severity (finding tags, model checks, other states)', figma: '77:1541', order: 4 };
</script>

<script lang="ts">
  import ResultBadge from '../../components/ResultBadge.svelte';
  import Severity from '../../components/Severity.svelte';
  import Tag from '../../components/Tag.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import {
    CARD_TAGS, COST_TAGS, CROSS_RUN_TAGS, MARKER_TAGS, MODEL_CHECK_TAGS, ORIGINS, PROOF_TAGS, REVIEW_TAGS, SETUP_TAGS,
    SEVERITIES, TEST_STRENGTH_TAGS, TOOL_TAGS, tagIcon, type Origin, type TagSpec,
  } from '../../lib/tags.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { t, dir } = useLocale();

  const groups: { key: string; title: string; tags: Record<string, TagSpec> }[] = [
    { key: 'proof', title: 'Proof (S-04)', tags: PROOF_TAGS },
    { key: 'marker', title: 'Provisional · Stale · Partial (S-04)', tags: MARKER_TAGS },
    { key: 'cross-run', title: 'Across runs (S-04; arrows and redo/undo per language, D-DES2-02)', tags: CROSS_RUN_TAGS },
    { key: 'cost', title: 'Cost (S-04)', tags: COST_TAGS },
    { key: 'model-check', title: 'Model-check states (S-05 77:2266)', tags: MODEL_CHECK_TAGS },
    { key: 'card', title: 'Card cycle (S-05)', tags: CARD_TAGS },
    { key: 'test-strength', title: 'Test strength (S-05)', tags: TEST_STRENGTH_TAGS },
    { key: 'review', title: 'Human review item · validity (S-05)', tags: REVIEW_TAGS },
    { key: 'tool', title: 'Tool state (S-05)', tags: TOOL_TAGS },
    { key: 'setup', title: 'Setup action (S-05; running is the blue cycle symbol, D-DES2-04)', tags: SETUP_TAGS },
  ];
  const origins = Object.keys(ORIGINS) as Origin[];
</script>

<Row title="Tag (71:194) · Kind">
  <Demo name="Tag/neutral" figma="71:194" h={18}><Tag>{t('glossary.proof.suspected')}</Tag></Demo>
  <Demo name="Tag/neutral-icon" figma="71:194" h={18}><Tag kind="neutral-icon" icon="file-text">{t('ui.aiCheck.generated')}</Tag></Demo>
  <Demo name="Tag/model-claim" figma="71:194" h={18}><Tag kind="model-claim">{t('glossary.modelClaim')}</Tag></Demo>
  <Demo name="Tag/provisional" figma="71:194" h={18}><Tag kind="provisional">{t('ui.marker.provisional')}</Tag></Demo>
</Row>

{#each groups as group (group.key)}
  <Row title={group.title}>
    {#each Object.entries(group.tags) as [id, spec] (id)}
      <Demo name="Tag/{spec.kind}/{group.key}-{id}" figma="71:194" h={18}>
        <Tag kind={spec.kind} icon={tagIcon(spec, dir)} symbol={spec.symbol}>{t(spec.key)}</Tag>
      </Demo>
    {/each}
  </Row>
{/each}

<Row title="Origin (S-04; text only, D-DES2-04)">
  {#each origins as origin (origin)}
    <Demo name="Tag/neutral/origin-{origin}" figma="71:194" h={18}><Tag>{t('status.tag.origin', { origin: t(ORIGINS[origin]) })}</Tag></Demo>
  {/each}
</Row>

<Row title="Scope tags (S-04)">
  <Demo name="Tag/neutral/narrow-scope-2" figma="71:194" h={18}><Tag>{t('status.tag.narrowScope', { count: 2 })}</Tag></Demo>
  <Demo name="Tag/neutral/narrow-scope-1" figma="71:194" h={18}><Tag>{t('status.tag.narrowScope', { count: 1 })}</Tag></Demo>
  <Demo name="Tag/neutral/partial" figma="71:194" h={18}><Tag>{t('ui.marker.partial')}</Tag></Demo>
</Row>

<Row title="Reviewed suffix (S-04; result badges of S-01)">
  <Demo name="Result badge/passed-reviewed/md" figma="70:276" h={22}><ResultBadge result="passed-reviewed" /></Demo>
  <Demo name="Result badge/failed-reviewed/md" figma="70:276" h={22}><ResultBadge result="failed-reviewed" /></Demo>
</Row>

<Row title="Severity (71:275)">
  {#each SEVERITIES as severity (severity)}
    <Demo name="Severity/{severity}" figma="71:275" h={20}><Severity {severity} /></Demo>
  {/each}
</Row>
