<script lang="ts">
  import type { Snippet } from 'svelte';

  type IconName = 'folder-open' | 'info' | 'rotate-cw';

  let {
    icon,
    class: className = '',
    ariaLabel,
    describedBy,
    title,
    disabled = false,
    onclick,
    children,
  }: {
    icon: IconName;
    class?: string;
    ariaLabel: string;
    describedBy?: string;
    title?: string;
    disabled?: boolean;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  } = $props();
</script>

<button
  type="button"
  class={`btn-icon ${className}`.trim()}
  aria-label={ariaLabel}
  aria-describedby={describedBy}
  {title}
  {disabled}
  {onclick}
>
  {#if children}
    {@render children()}
  {:else}
    <svg
      class="icon"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {#if icon === 'info'}
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 16v-4"></path>
        <path d="M12 8h.01"></path>
      {:else if icon === 'rotate-cw'}
        <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"></path>
        <path d="M21 3v5h-5"></path>
      {:else}
        <path
          d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
        ></path>
      {/if}
    </svg>
  {/if}
</button>
