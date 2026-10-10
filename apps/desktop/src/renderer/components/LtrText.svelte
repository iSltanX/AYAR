<script lang="ts">
  // Left-to-right isolated inline text (C-24, D-DES3-04): ids, dates, versions and commands inside an Arabic
  // sentence keep their own order ("2026-10-10" never becomes "10-10-2026"). mono draws it in the code font.
  interface Props {
    text: string;
    mono?: boolean;
  }
  let { text, mono = false }: Props = $props();
</script>

<span class="ltr" class:mono dir="ltr">{text}</span>

<style>
  .ltr {
    unicode-bidi: isolate;
  }
  .mono {
    font: var(--type-mono);
  }
</style>
