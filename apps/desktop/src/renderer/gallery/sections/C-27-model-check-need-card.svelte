<script module lang="ts">
  export const meta = { id: 'C-27', title: 'Model check need card', figma: '117:9822', order: 127 };
</script>

<script lang="ts">
  import ModelCheckNeedCard from '../../components/ModelCheckNeedCard.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  const S = {
    ar: { template: 'مراجعة المنطق', reason: '14 ملف منطق بلا اختبارات', what: 'السلوك المتوقع', placeholder: 'صف السلوك المتوقع…' },
    en: { template: 'Logic review', reason: '14 logic files without tests', what: 'expected behaviour', placeholder: 'Describe the expected behaviour…' },
  }[lang];
</script>

<Row title="Model check need card (117:9922) · Variant ready / missing-input («Generate instructions» disabled until filled) · 480 wide">
  <Demo name="Model check need card/ready" figma="117:9922" h={130} w={480}>
    <div class="w480"><ModelCheckNeedCard template={S.template} templateId="AI-LOGIC" reason={S.reason} /></div>
  </Demo>
  <Demo name="Model check need card/missing-input" figma="117:9922" h={194} w={480}>
    <div class="w480">
      <ModelCheckNeedCard template={S.template} templateId="AI-LOGIC" reason={S.reason} missing={{ what: S.what, placeholder: S.placeholder }} />
    </div>
  </Demo>
</Row>

<style>
  .w480 {
    display: flex;
    width: 480px;
  }
</style>
