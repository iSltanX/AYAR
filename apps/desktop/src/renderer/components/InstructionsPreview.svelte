<script lang="ts">
  // Instructions preview (Figma 117:10063, C-28; plan 9.28): bg/surface, a 1 px border/subtle edge, radius/card,
  // padding 16, gap 12; 720 wide in Figma, it fills its container. At the top the fixed tag «تعليمات مولّدة، لم
  // يُنفذ شيء» (neutral, file-text). Then «احفظ في المشروع…» (secondary) and the Copy for model bar
  // (Context=instructions-preview: the ONLY copy button in this context, with its note «يُنسخ ملف التعليمات
  // كاملًا، ولا يُنفذ شيء»), gap 12. The suggested path (body/small key + Path pill). Then the full text: mono,
  // always left to right in both languages, on bg/sunken, radius/control, padding 12 16. Nothing here runs it.
  import { useLocale } from '../lib/locale.ts';
  import { MODEL_CHECK_TAGS } from '../lib/tags.ts';
  import Button from './Button.svelte';
  import CopyForModelBar from './CopyForModelBar.svelte';
  import PathPill from './PathPill.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    /** The whole generated instructions file. */
    text: string;
    /** The suggested save path, e.g. ".ayar/ai-checks/logic-review.md". */
    path: string;
    oncopy?: () => void;
    onsave?: () => void;
    /** The path pill's own copy icon (copies the path text only). */
    onpathcopy?: (text: string) => void;
  }
  let { text, path, oncopy, onsave, onpathcopy }: Props = $props();
  const { t } = useLocale();
  const generated = MODEL_CHECK_TAGS.generated;
</script>

<section class="instructions" aria-label={t('glossary.generatedInstructions')}>
  <span class="tag-row"><Tag kind={generated.kind} icon={generated.icon}>{t('results.instructions.generated')}</Tag></span>
  <div class="actions">
    <Button kind="secondary" onclick={onsave}>{t('ui.action.saveToProject')}</Button>
    <span class="bar"><CopyForModelBar context="instructions-preview" {oncopy} /></span>
  </div>
  <p class="suggested">
    <span class="key">{t('results.instructions.suggestedPath')}</span>
    <PathPill {path} oncopy={onpathcopy} />
  </p>
  <pre class="content" dir="ltr" aria-label={t('results.instructions.content')}>{text}</pre>
</section>

<style>
  .instructions {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    width: 100%;
    min-width: 0;
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .tag-row {
    display: flex;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-12);
  }
  .bar {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
  }
  .suggested {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    min-width: 0;
    margin: 0;
  }
  .key {
    flex: none;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .content {
    margin: 0;
    padding: var(--space-12) var(--space-16);
    border-radius: var(--radius-control);
    background: var(--bg-sunken);
    color: var(--text-primary);
    font: var(--type-mono);
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    unicode-bidi: isolate;
  }
</style>
