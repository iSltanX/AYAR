<script module lang="ts">
  export const meta = { id: 'C-24', title: 'Copy for model button', figma: '110:6488', order: 124 };
</script>

<script lang="ts">
  import CopyForModelButton from '../../components/CopyForModelButton.svelte';
  import Demo from '../Demo.svelte';
  import Row from '../Row.svelte';
</script>

<Row title="Copy for model button (110:6568) · default / disabled (hover, pressed, focus are CSS states)">
  <Demo name="Copy for model button/default" figma="110:6568" h={28}><CopyForModelButton /></Demo>
  <Demo name="Copy for model button/disabled" figma="110:6568" h={28}><CopyForModelButton disabled /></Demo>
</Row>
