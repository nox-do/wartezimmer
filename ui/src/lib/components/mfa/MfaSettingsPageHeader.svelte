<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    lead?: string;
    actions?: Snippet;
  }

  let { title, lead = '', actions }: Props = $props();
</script>

<header class="mfa-settings-page-header" class:mfa-settings-page-header--with-actions={Boolean(actions)}>
  <h1>{title}</h1>
  {#if lead || actions}
    <div class="mfa-settings-page-header__lead-row">
      {#if lead}
        <p>{lead}</p>
      {/if}
      {#if actions}
        <div class="mfa-settings-page-header__actions">
          {@render actions()}
        </div>
      {/if}
    </div>
  {/if}
</header>
