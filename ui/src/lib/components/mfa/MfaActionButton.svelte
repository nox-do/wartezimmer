<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolve } from '$app/paths';

  interface Props {
    variant?: 'primary' | 'ghost' | 'doc' | 'danger';
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
      variant === 'danger' ? 'btn-staff-sm--danger' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

{#if href}
  <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
  <a href={resolve(href as any)} class={className} aria-label={ariaLabel} {title} aria-disabled={disabled} onclick={onclick}>
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
