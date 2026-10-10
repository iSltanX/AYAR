<script module lang="ts">
  export const meta = { id: 'C-11', title: 'Path pill, isolated LTR text, text of unknown direction', figma: '108:5471', order: 111 };
</script>

<script lang="ts">
  import AutoText from '../../components/AutoText.svelte';
  import LtrText from '../../components/LtrText.svelte';
  import PathPill from '../../components/PathPill.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { lang } = useLocale();
  const latin = '~/projects/texts/src/normalize.py';
  const arabic = '~/مشاريع تجريبية/مكتبة «النصوص»/src/normalize.py';
  const long = '~/مشاريع تجريبية/مكتبة «النصوص»/packages/text-normalizer/src/normalize.py';
  const S = {
    ar: { before: 'اجتاز في الجولة', middle: 'بتاريخ', comma: '،', after: 'ولم تتغير ملفاته بعدها.', project: 'مكتبة «النصوص»', projectEn: 'Texts library' },
    en: { before: 'Passed in', middle: 'on', comma: ',', after: 'and its files have not changed since.', project: 'مكتبة «النصوص»', projectEn: 'Texts library' },
  }[lang];
</script>

<Row title="Path pill (108:5579) · Content latin / arabic-folders (copy icon shows on hover and focus)">
  <Demo name="Path pill/latin" figma="108:5579" h={28} w={292}><PathPill path={latin} /></Demo>
  <Demo name="Path pill/arabic-folders" figma="108:5579" h={28}><PathPill path={arabic} /></Demo>
  <Demo name="Path pill/with line" figma="108:5579" h={28}><PathPill path={latin} line={42} /></Demo>
</Row>

<Row title="Path pill · truncated in the middle (file name and line kept), 260 wide">
  <Demo name="Path pill/truncated" figma="108:5579" h={28} w={260}>
    <div class="narrow"><PathPill path={long} line={118} /></div>
  </Demo>
</Row>

<Row title="LtrText and AutoText (C-24, D-DES3-04, S-48)">
  <Demo name="LtrText/in-sentence">
    <p class="sentence">{S.before} <LtrText text="ROUND-007" mono /> {S.middle} <LtrText text="2026-10-10" />{S.comma} {S.after}</p>
  </Demo>
  <Demo name="AutoText/arabic"><p class="sentence"><AutoText text={S.project} /></p></Demo>
  <Demo name="AutoText/latin"><p class="sentence"><AutoText text={S.projectEn} /></p></Demo>
</Row>

<style>
  .narrow {
    display: flex;
    width: 260px;
  }
  .sentence {
    margin: 0;
    font: var(--type-body);
    color: var(--text-primary);
  }
</style>
