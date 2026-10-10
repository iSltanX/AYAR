<script module lang="ts">
  export const meta = { id: 'S-06', title: 'Verdict badge, purity card, section karat', figma: '78:2593', order: 6 };
</script>

<script lang="ts">
  import PurityCard from '../../components/PurityCard.svelte';
  import SectionKarat from '../../components/SectionKarat.svelte';
  import VerdictBadge from '../../components/VerdictBadge.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { VERDICTS } from '../../lib/status.ts';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const { t, lang } = useLocale();
  // Sample data of the approved frame (S-06): dates are formatted by the caller.
  const S = {
    ar: { date: '9 أكتوبر 2026 · 14:32', staleDate: '8 أكتوبر 2026 · 18:05', unit: 'اختبارات الوحدة' },
    en: { date: '9 October 2026 · 14:32', staleDate: '8 October 2026 · 18:05', unit: 'Unit tests' },
  }[lang];
  const round = { roundId: 'ROUND-007', roundDate: S.date };
</script>

<Row title="Verdict badge (70:465)">
  {#each VERDICTS as verdict (verdict)}
    <Demo name="Verdict badge/{verdict}" figma="70:465" h={28}><VerdictBadge {verdict} /></Demo>
  {/each}
</Row>

<Row title="Purity card (72:1070)">
  <Demo name="Purity card/pure" figma="72:1070" h={290} w={400}>
    <PurityCard verdict="pure" karat={24} criteria={13} checks={15} counts={[{ result: 'passed', count: 15 }]} {...round} />
  </Demo>
  <Demo name="Purity card/incomplete" figma="72:1070" h={350} w={400}>
    <PurityCard
      verdict="incomplete"
      karat={19}
      criteria={13}
      checks={15}
      counts={[{ result: 'passed', count: 11 }, { result: 'warning', count: 1 }, { result: 'needs-review', count: 2 }, { result: 'missing', count: 1 }]}
      missing={[{ result: 'warning', count: 1 }, { result: 'needs-review', count: 2 }, { result: 'missing', count: 1 }]}
      {...round}
    />
  </Demo>
  <Demo name="Purity card/blocked" figma="72:1070" h={418} w={400}>
    <PurityCard
      verdict="blocked"
      karat={12}
      criteria={13}
      checks={15}
      counts={[{ result: 'passed', count: 9 }, { result: 'failed', count: 3 }, { result: 'warning', count: 1 }, { result: 'missing', count: 2 }]}
      blocking={[{ id: 'sec.secrets', name: t('catalog.check.sec.secrets.files.title') }, { id: 'beh.unit', name: S.unit }]}
      {...round}
    />
  </Demo>
  <Demo name="Purity card/stale" figma="72:1070" h={334} w={400}>
    <PurityCard verdict="pure" karat={24} criteria={13} checks={15} counts={[{ result: 'passed', count: 15 }]} stale roundId="ROUND-006" roundDate={S.staleDate} />
  </Demo>
  <Demo name="Purity card/integrity-hold" figma="72:1070" h={322} w={400}>
    <PurityCard verdict="incomplete" karat={24} criteria={13} checks={15} counts={[{ result: 'passed', count: 15 }]} integrityHold={2} {...round} />
  </Demo>
  <Demo name="Purity card/no-scope" figma="72:1070" h={318} w={400}>
    <PurityCard verdict="incomplete" karat={null} criteria={0} checks={0} counts={[{ result: 'not-applicable', count: 6 }]} {...round} />
  </Demo>
  <Demo name="Purity card/narrow-scope" figma="72:1070" h={290} w={400}>
    <PurityCard verdict="pure" karat={24} criteria={2} checks={3} counts={[{ result: 'passed', count: 3 }]} narrowScope {...round} />
  </Demo>
</Row>

<Row title="Section karat (71:627)">
  <Demo name="Section karat/19" figma="71:627" h={28}><SectionKarat value={19} criteria={4} /></Demo>
</Row>
