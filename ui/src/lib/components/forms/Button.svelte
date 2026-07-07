<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    href?: string;
    target?: '_blank' | '_self' | '_parent' | '_top';
    rel?: string;
    class?: string;
    children?: Snippet;
    onclick?: (event: MouseEvent) => void;
  }

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    fullWidth = false,
    href = undefined,
    target = undefined,
    rel = undefined,
    class: className = '',
    children,
    onclick,
  }: Props = $props();

  const variantClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    outline: 'btn-outline',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  } as const;

  const computedClass = $derived(
    ['btn', variantClass[variant], size === 'sm' ? 'btn-sm' : '', fullWidth ? 'btn-full' : '', loading ? 'btn-loading' : '', className]
      .filter(Boolean)
      .join(' '),
  );
</script>

{#if href}
  <a {href} {target} {rel} class={computedClass} aria-disabled={disabled || loading} {onclick}>
    {#if loading}
      <span class="spinner" aria-hidden="true"></span>
    {/if}
    {@render children?.()}
  </a>
{:else}
  <button {type} class={computedClass} disabled={disabled || loading} {onclick}>
    {#if loading}
      <span class="spinner" aria-hidden="true"></span>
    {/if}
    {@render children?.()}
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border: 1px solid transparent;
    border-radius: var(--radius);
    font-weight: 500;
    cursor: pointer;
    min-height: 44px;
    text-decoration: none;
  }

  .btn:disabled,
  .btn[aria-disabled='true'] {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }

  .btn-full {
    width: 100%;
  }

  .btn-sm {
    padding: 0.45rem 0.85rem;
    min-height: 36px;
    font-size: 0.875rem;
  }

  button.btn-primary,
  a.btn-primary {
    background: var(--accent);
    color: var(--accent-foreground);
    border-color: var(--accent);
  }

  @media (hover: hover) {
    button.btn-primary:hover:not(:disabled),
    a.btn-primary:hover:not([aria-disabled='true']) {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }
  }

  button.btn-secondary,
  a.btn-secondary {
    background: var(--muted);
    color: var(--foreground);
    border-color: var(--border);
  }

  .btn-outline {
    background: transparent;
    border-color: var(--border);
    color: var(--foreground);
  }

  .btn-ghost {
    background: transparent;
    color: var(--foreground);
  }

  .btn-danger {
    background: var(--destructive);
    color: var(--destructive-foreground);
  }
</style>
