<script lang="ts">
  import type { Snippet } from 'svelte';
  import SettingsRow from './SettingsRow.svelte';

  interface Props {
    title: string;
    description?: string | Snippet;
    open: boolean;
    disabled?: boolean;
    leading?: Snippet;
    status?: Snippet;
    children?: Snippet;
    onToggle: () => void;
  }

  let { title, description, open, disabled = false, leading, status, children, onToggle }: Props = $props();
  const instanceId = $props.id();
  const triggerId = `${instanceId}-trigger`;
  const panelId = `${instanceId}-panel`;
</script>

<button
  id={triggerId}
  type="button"
  class="settings-disclosure__trigger"
  aria-expanded={open}
  aria-controls={open && children ? panelId : undefined}
  {disabled}
  onclick={onToggle}
>
  <SettingsRow {title} {description} {leading} trailing={status} variant="disclosure" />
  <span class="settings-disclosure__chevron" class:settings-disclosure__chevron--open={open} aria-hidden="true">⌄</span>
</button>
{#if open && children}
  <div id={panelId} class="settings-disclosure__panel" role="region" aria-labelledby={triggerId}>
    {@render children()}
  </div>
{/if}
