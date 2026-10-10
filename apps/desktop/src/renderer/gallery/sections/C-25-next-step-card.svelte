<script module lang="ts">
  export const meta = { id: 'C-25', title: 'Next step card', figma: '110:6810', order: 125 };
</script>

<script lang="ts">
  import NextStepCard from '../../components/NextStepCard.svelte';
  import { NEXT_STEP_KINDS, type NextStepKind } from '../../lib/evidence.ts';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang, dir } = useLocale();
  const S = {
    ar: {
      'handle-directly': 'أداة vitest غير مثبتة، فلم يُشغَّل الفحص. جهّزها ثم أعد الفحص.',
      'needs-model': 'الدالة تحذف التشكيل فيختلف الناتج عن المتوقع. هذا تعديل في الشيفرة يناسب نموذجك.',
      'needs-review': 'تغيّرت صفحة الإعدادات عن الصورة المرجعية. هل التغيير مقصود؟ القرار لك.',
      'nothing-required': 'اجتاز الفحص بدليل محفوظ.',
      reason: 'اجتاز في الجولة ROUND-007، ولم تتغير ملفاته بعدها.',
    },
    en: {
      'handle-directly': 'vitest is not installed, so the check did not run. Set it up, then re-check.',
      'needs-model': 'The function strips diacritics, so the output differs from what is expected. This is a code change for your model.',
      'needs-review': 'The settings page changed from its baseline. Was the change intended? The decision is yours.',
      'nothing-required': 'The check passed with saved evidence.',
      reason: 'passed in ROUND-007; its files have not changed since.',
    },
  }[lang];
  const impact = (kind: NextStepKind) => S[kind === 'needs-model-inspector' ? 'needs-model' : kind];
  const heights: Record<'rtl' | 'ltr', Record<NextStepKind, number>> = {
    rtl: { 'handle-directly': 178, 'needs-model': 178, 'needs-model-inspector': 170, 'needs-review': 178, 'nothing-required': 146 },
    ltr: { 'handle-directly': 178, 'needs-model': 202, 'needs-model-inspector': 194, 'needs-review': 178, 'nothing-required': 166 },
  };
</script>

<Row title="Next step card (110:6954) · Kind">
  {#each NEXT_STEP_KINDS as kind (kind)}
    <Demo name="Next step card/{kind}" figma="110:6954" h={heights[dir][kind]} w={348}>
      <div class="w348"><NextStepCard {kind} impact={impact(kind)} reason={S.reason} /></div>
    </Demo>
  {/each}
</Row>

<style>
  .w348 {
    display: flex;
    width: 348px;
  }
</style>
