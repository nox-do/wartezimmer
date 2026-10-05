<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    layout?: 'row' | 'plain';
    level?: 2 | 3;
    description?: string;
    actions?: Snippet;
  }

  let { title, description, actions, layout = 'row', level = 2 }: Props = $props();
  const heading = $derived(level === 3 ? 'h3' : 'h2');
</script>

{#snippet intro()}
  <svelte:element this={heading} class="panel__title">{title}</svelte:element>
  {#if description}<p class="text-desc">{description}</p>{/if}
{/snippet}

{#if layout === 'plain'}
  {@render intro()}
{:else}
  <div class="settings-header">
    <div>
      {@render intro()}
    </div>
    {#if actions}{@render actions()}{/if}
  </div>
{/if}
