<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string | Snippet;
    variant?: 'check' | 'radio' | 'toggle' | 'custom';
    class?: string;
    children: Snippet;
  }

  let { label, variant = 'check', class: className = '', children }: Props = $props();
  const variantClass = $derived(
    variant === 'check' ? 'modal-form-check'
      : variant === 'radio' ? 'choice-field--radio'
      : variant === 'toggle' ? 'choice-field--toggle' : '',
  );
</script>

<!-- Native inputs stay in the caller, including radio names and checked bindings. -->
<label class="choice-field {variantClass} {className}">
  {@render children()}
  {#if typeof label === 'string'}
    {#if variant === 'radio'}{label}{:else}<span>{label}</span>{/if}
  {:else}
    {@render label()}
  {/if}
</label>
