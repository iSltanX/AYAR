<script module lang="ts">
  export const meta = { id: 'S-07', title: 'Karat dial', figma: '78:4097', order: 7 };
</script>

<script lang="ts">
  import KaratDial from '../../components/KaratDial.svelte';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';

  const values = [0, 12, 19, 24, null] as const;
  const tones = ['default', 'muted'] as const;
  const sizes = [{ size: 'lg', px: 120 }, { size: 'sm', px: 28 }] as const;
</script>

{#each tones as tone (tone)}
  {#each sizes as { size, px } (size)}
    <Row title="Karat dial (71:536) · {size} {px} · {tone}">
      {#each values as value (value ?? 'none')}
        <Demo name="Karat dial/{value ?? 'none'}/{size}/{tone}" figma="71:536" h={px} w={px}><KaratDial {value} {size} {tone} /></Demo>
      {/each}
    </Row>
  {/each}
{/each}

<Row title="Karat dial · any integer 0..24 (the Figma variants are samples)">
  {#each [1, 6, 18, 23] as value (value)}
    <Demo name="Karat dial/{value}/sm/default" figma="71:536" h={28} w={28}><KaratDial {value} size="sm" /></Demo>
  {/each}
  <Demo name="Karat dial/7/lg/default" figma="71:536" h={120} w={120}><KaratDial value={7} size="lg" /></Demo>
</Row>
