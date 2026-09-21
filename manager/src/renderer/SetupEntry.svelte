<script lang="ts">
  import type { HostStatus } from '../shared/host-status.js';
  import {
    setupChecklistItems,
    setupEntryContent,
    setupEntryTone,
  } from './status-view-model.js';

  let {
    status,
    onSetupClick,
    onLoadReleaseArchive,
  }: {
    status: HostStatus;
    onSetupClick: () => void;
    onLoadReleaseArchive: () => void;
  } = $props();

  let startBusy = $state(false);
  let startError = $state<string | null>(null);
  let startFailed = $state(false);
  async function startExisting(): Promise<void> {
    startBusy = true; startError = null;
    try {
      const result = await window.praxisManager.startStoppedInstallation();
      if (result.installation.kind === 'needs-reinstall') { startFailed = true; startError = result.installation.reasons.map(reason => reason.message).join(' '); }
      else window.location.reload();
    } catch (error) { startError = error instanceof Error ? error.message : String(error); }
    finally { startBusy = false; }
  }

  const tone = $derived(setupEntryTone(status));
  const content = $derived(setupEntryContent(status, tone));
  const checklist = $derived(setupChecklistItems(status));
  const visible = $derived(tone !== 'maintenance');
</script>

{#if visible}
  <section id="setup-entry" class={`setup-entry is-${tone}`}>
    <p id="setup-entry-eyebrow" class="setup-entry-eyebrow">{content.eyebrow}</p>
    <h1 id="setup-entry-title">{content.title}</h1>
    <p id="setup-entry-copy" class="setup-entry-copy">{content.copy}</p>
    <ul id="setup-entry-checklist" class="checklist checklist--setup">
      {#each checklist as item (item.label)}
        <li class={item.done ? 'is-done' : item.muted ? 'is-muted' : 'is-open'}>
          <span class="checklist-mark">{item.done ? '✓' : '○'}</span>
          <span>{item.label}</span>
        </li>
      {/each}
    </ul>
    <p id="setup-entry-note" class="setup-entry-note">
      {#if content.showReleasePicker}
        Release-Ordner vollständig herunterladen, dann die <code>.pfinstall</code> auswählen. Manifest
        und Checksums bleiben im selben Ordner.
        <button
          type="button"
          class="btn-link setup-entry-inline-action"
          onclick={onLoadReleaseArchive}
        >
          Release-Paket wählen
        </button>
      {:else if content.note}
        {content.note}
      {/if}
    </p>
    {#if status.installation.kind === 'stopped' && !startFailed}
      <button type="button" disabled={startBusy} onclick={() => void startExisting()}>Vorhandene Installation starten</button>
    {/if}
    {#if startError}<p class="error">{startError}</p>{/if}
    <button
      disabled={startBusy || status.installation.kind === 'docker-unavailable'}
      type="button"
      id="setup-entry-start"
      class="setup-entry-start"
      onclick={onSetupClick}
    >
      {content.startButtonLabel}
    </button>
  </section>
{/if}
