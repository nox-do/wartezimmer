<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = false,
    title,
    subtitle,
    copy,
    onToggle,
    children,
  }: {
    open?: boolean;
    title: string;
    subtitle: string;
    copy?: string;
    onToggle: () => void;
    children?: Snippet;
  } = $props();
</script>

<section class="maintenance-expander" class:is-open={open}>
  <button
    type="button"
    class="maintenance-expander-trigger"
    aria-expanded={open}
    onclick={onToggle}
  >
    <span class="maintenance-expander-text">
      <span class="maintenance-expander-title">{title}</span>
      <span class="maintenance-expander-subtitle">{subtitle}</span>
      {#if copy}
        <span class="maintenance-expander-copy">{copy}</span>
      {/if}
    </span>
    <span class="maintenance-expander-chevron" aria-hidden="true">⌄</span>
  </button>
  {#if open}
    <div class="maintenance-expander-panel">
      {@render children?.()}
    </div>
  {/if}
</section>
