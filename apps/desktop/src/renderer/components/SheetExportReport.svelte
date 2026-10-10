<script lang="ts">
  // Sheet/Export report (Figma 114:9070, Variant default | evidence-bundle): three pop-up buttons 240 wide
  // (format: Markdown, HTML, JSON or «حزمة أدلة»; language; content: «لك» و«للنموذج» معًا by default, or one of
  // them). The evidence bundle adds «ضمّن اللقطات»; when it is checked the note «قد تظهر في اللقطات بيانات من
  // واجهتك» appears. «صدّر…» hands the choice to the caller, which opens the native save panel. The focus opens
  // on «ألغِ».
  import { useLocale } from '../lib/locale.ts';
  import {
    EXPORT_CONTENTS,
    EXPORT_FORMATS,
    EXPORT_LANGUAGES,
    type ExportChoice,
    type ExportContent,
    type ExportFormat,
    type ExportLanguage,
    type SheetMode,
  } from '../lib/sheets.ts';
  import Button from './Button.svelte';
  import Checkbox from './Checkbox.svelte';
  import Select from './Select.svelte';
  import Sheet from './Sheet.svelte';
  import SheetField from './SheetField.svelte';
  import SheetNote from './SheetNote.svelte';

  interface Props extends SheetMode {
    format?: ExportFormat;
    language?: ExportLanguage;
    content?: ExportContent;
    includeScreenshots?: boolean;
    onexport?: (choice: ExportChoice) => void;
  }
  let {
    format = $bindable('markdown'),
    language = $bindable('ar'),
    content = $bindable('both'),
    includeScreenshots = $bindable(false),
    onexport,
    open,
    inline,
    oncancel,
  }: Props = $props();
  const { t } = useLocale();
  const uid = $props.id();

  const options = <T extends string>(table: Record<T, Parameters<typeof t>[0]>) =>
    (Object.keys(table) as T[]).map((value) => ({ value, label: t(table[value]) }));
  const formats = $derived(options(EXPORT_FORMATS));
  const languages = $derived(options(EXPORT_LANGUAGES));
  const contents = $derived(options(EXPORT_CONTENTS));
  const bundle = $derived(format === 'evidence-bundle');
</script>

<Sheet title={t('ui.action.exportReport')} {open} {inline} {oncancel}>
  <SheetField label={t('sheets.export.format')} for="{uid}-format">
    <Select id="{uid}-format" bind:value={format} options={formats} width={240} />
  </SheetField>
  <SheetField label={t('sheets.export.language')} for="{uid}-language">
    <Select id="{uid}-language" bind:value={language} options={languages} width={240} />
  </SheetField>
  <SheetField label={t('sheets.export.content')} for="{uid}-content">
    <Select id="{uid}-content" bind:value={content} options={contents} width={240} />
  </SheetField>
  {#if bundle}
    <Checkbox bind:checked={includeScreenshots} label={t('ui.action.includeScreenshots')} />
    {#if includeScreenshots}<SheetNote text={t('sheets.export.screenshotsNote')} />{/if}
  {/if}
  {#snippet footer()}
    <Button data-initial-focus onclick={oncancel}>{t('ui.action.cancel')}</Button>
    <Button kind="primary" onclick={() => onexport?.({ format, language, content, includeScreenshots: bundle && includeScreenshots })}>
      {t('ui.action.export')}
    </Button>
  {/snippet}
</Sheet>
