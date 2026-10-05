<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    disabled?: boolean;
    busy?: boolean;
    children: Snippet;
  }

  let { label, disabled = false, busy, children }: Props = $props();
</script>

<fieldset class="choice-group" {disabled} aria-busy={busy}>
  <legend class="sr-only">{label}</legend>
  {@render children()}
</fieldset>
