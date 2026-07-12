<script lang="ts">
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
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyUrl(): Promise<void> {
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
      // Clipboard API unavailable — button label stays unchanged.
    }
  }
</script>

<li class="device-url-item" class:device-url-item--tv={entry.label === 'TV'}>
  <span class="device-url-label">{entry.label}</span>
  <a
    class="device-url-value"
    href={entry.url}
    target="_blank"
    rel="external noopener noreferrer"
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
      type="button"
      class="btn-icon btn-secondary btn-copy"
      aria-label={copied ? 'Kopiert' : 'URL kopieren'}
      onclick={() => {
        void copyUrl();
      }}
    >
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
        {#if copied}
          <path d="M20 6 9 17l-5-5"></path>
        {:else}
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
        {/if}
      </svg>
    </button>
  </div>
</li>
