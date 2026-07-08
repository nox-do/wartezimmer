<script lang="ts">
  import { createLucideIcon } from './lucide-icons.js';
  import type { DeviceUrlEntry } from './status-view-model.js';
  import TvKioskTip from './TvKioskTip.svelte';

  let {
    entry,
    onOpenUrl,
  }: {
    entry: DeviceUrlEntry;
    onOpenUrl: (url: string) => void;
  } = $props();

  let copied = $state(false);
  let copyBtn = $state<HTMLButtonElement | null>(null);
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!copyBtn) {
      return;
    }
    copyBtn.replaceChildren(createLucideIcon(copied ? 'check' : 'copy'));
  });

  async function copyUrl(): Promise<void> {
    if (!copyBtn) {
      return;
    }
    try {
      await navigator.clipboard.writeText(entry.url);
      copied = true;
      if (copyResetTimer !== null) {
        clearTimeout(copyResetTimer);
      }
      copyResetTimer = setTimeout(() => {
        copied = false;
        copyResetTimer = null;
      }, 1200);
    } catch {
      copyBtn.setAttribute('aria-label', 'Kopieren fehlgeschlagen');
    }
  }
</script>

<li class="device-url-item" class:device-url-item--tv={entry.label === 'TV'}>
  <span class="device-url-label">{entry.label}</span>
  <a
    class="device-url-value"
    href={entry.url}
    target="_blank"
    rel="noopener noreferrer"
    title={entry.url}
    onclick={(event) => {
      event.preventDefault();
      onOpenUrl(entry.url);
    }}
  >
    {entry.url}
  </a>
  <div class="device-url-actions">
    {#if entry.showKioskTip}
      <TvKioskTip tvUrl={entry.url} />
    {/if}
    <button
      bind:this={copyBtn}
      type="button"
      class="btn-icon btn-secondary btn-copy"
      aria-label={copied ? 'Kopiert' : 'URL kopieren'}
      onclick={() => {
        void copyUrl();
      }}
    ></button>
  </div>
</li>
