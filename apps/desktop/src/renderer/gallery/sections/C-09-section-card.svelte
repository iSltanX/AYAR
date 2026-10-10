<script module lang="ts">
  export const meta = { id: 'C-09', title: 'Section card', figma: '106:3659', order: 109 };
</script>

<script lang="ts">
  import SectionCard from '../../components/SectionCard.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang, t } = useLocale();
  const openItems = {
    ar: 'بندان لم يُحسما: تخطي اختبار، وتعديل عتبة.',
    en: 'Two open items: a skipped test and a changed threshold.',
  }[lang];
  const readiness = { setup: 2, approval: 1 };
</script>

<Row title="Section card (106:3951) · Variant default / integrity / model-checks · 344 wide">
  <Demo name="Section card/default" figma="106:3951" h={202} w={344}>
    <div class="w344">
      <SectionCard
        name={t('ui.section.behavior')}
        karat={19}
        criteria={4}
        counts={{ passed: 9, failed: 2, warning: 1, 'needs-review': 1, missing: 1 }}
        {readiness}
      />
    </div>
  </Demo>
  <Demo name="Section card/default/no measurable scope (never 0 of 24, D-DES2-07)" figma="106:3951" h={202} w={344}>
    <div class="w344"><SectionCard name={t('ui.section.performance')} karat={null} counts={{ 'not-applicable': 4 }} {readiness} /></div>
  </Demo>
  <Demo name="Section card/integrity" figma="106:3951" h={198} w={344}>
    <div class="w344"><SectionCard variant="integrity" name={t('ui.section.integrity')} blocksPure={2} {openItems} {readiness} /></div>
  </Demo>
  <Demo name="Section card/model-checks" figma="106:3951" h={242} w={344}>
    <div class="w344">
      <SectionCard variant="model-checks" name={t('ui.nav.modelChecks')} metrics={{ needs: 3, generated: 1, reports: 1, unresolved: 2 }} />
    </div>
  </Demo>
</Row>

<style>
  .w344 {
    display: flex;
    width: 344px;
  }
</style>
