<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'ghost' | 'doc';
    icon?: boolean;
    href?: string;
    count?: number;
    disabled?: boolean;
    ariaLabel?: string;
    title?: string;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  }

  let {
    variant = 'primary',
    icon = false,
    href = undefined,
    count = undefined,
    disabled = false,
    ariaLabel = undefined,
    title = undefined,
    onclick,
    children,
  }: Props = $props();

  const className = $derived(
    [
      'btn-staff-sm',
      icon ? 'btn-staff-sm--icon icon-btn' : '',
      variant === 'ghost' ? 'btn-staff-sm--ghost' : '',
      variant === 'doc' ? 'btn-staff-sm--doc' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

{#if href}
  <a
    {href}
    class={className}
    aria-label={ariaLabel}
    {title}
    aria-disabled={disabled}
    onclick={onclick}
  >
    {@render children?.()}
    {#if count != null}
      <span class="btn-staff-sm__count">{count}</span>
    {/if}
  </a>
{:else}
  <button type="button" class={className} {disabled} aria-label={ariaLabel} {title} {onclick}>
    {@render children?.()}
    {#if count != null}
      <span class="btn-staff-sm__count">{count}</span>
    {/if}
  </button>
{/if}
