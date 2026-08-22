<script lang="ts">
  import { resolvedHref } from '$lib/navigation/kit-paths';
  import { ChevronRight } from '@lucide/svelte';

  export type HomeLinkCardItem = {
    id: string;
    href: string;
    title: string;
    subtitle?: string;
  };

  interface Props {
    items: HomeLinkCardItem[];
    ariaLabel: string;
  }

  let { items, ariaLabel }: Props = $props();
</script>

<nav class="home-link-grid" aria-label={ariaLabel}>
  {#each items as item (item.id)}
    <!-- resolvedHref() wraps $app/paths resolve(); ESLint only recognizes resolve() in .svelte templates. -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a class="panel panel--clickable" href={resolvedHref(item.href)} target="_blank" rel="noopener noreferrer">
      <span class="panel__text">
        <strong>{item.title}</strong>
        {#if item.subtitle}
          <span>{item.subtitle}</span>
        {/if}
      </span>
      <span class="home-link-card__chevron" aria-hidden="true">
        <ChevronRight size={20} />
      </span>
    </a>
  {/each}
</nav>

<style>
  .home-link-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15.5rem, 1fr));
    gap: 0.75rem;
  }

  .home-link-card__chevron {
    flex-shrink: 0;
    display: inline-flex;
    color: var(--muted-foreground);
  }
</style>
