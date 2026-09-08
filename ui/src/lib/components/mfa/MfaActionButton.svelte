<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolvedHref } from '$lib/navigation/kit-paths';

  interface Props {
    variant?: 'primary' | 'ghost' | 'doc' | 'danger';
    icon?: boolean;
    href?: string;
    count?: number;
    disabled?: boolean;
    invalid?: boolean;
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
    invalid = false,
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
      invalid ? 'btn-staff-sm--invalid' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

{#if href}
  <!-- resolvedHref() wraps $app/paths resolve(); ESLint only recognizes resolve() in .svelte templates. -->
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a href={resolvedHref(href)} class={className} aria-label={ariaLabel} {title} aria-disabled={disabled} onclick={onclick}>
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
