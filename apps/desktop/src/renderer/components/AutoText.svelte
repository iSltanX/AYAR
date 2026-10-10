<script lang="ts">
  // Text of unknown direction (C-24, S-48): user or project content whose language is not known. dir="auto"
  // takes the direction from its first strong letter and isolates it from the surrounding sentence.
  interface Props {
    text: string;
  }
  let { text }: Props = $props();
</script>

<span class="auto" dir="auto">{text}</span>

<style>
  .auto {
    unicode-bidi: isolate;
  }
</style>
