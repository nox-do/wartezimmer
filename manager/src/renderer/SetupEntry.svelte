<script lang="ts">
  import type { HostStatus } from '../shared/host-status.js';
  import {
    setupChecklistItems,
    setupEntryContent,
    setupEntryTone,
  } from './status-view-model.js';

  let {
    status,
    onLoadReleaseArchive,
  }: {
    status: HostStatus;
    onLoadReleaseArchive: () => void;
  } = $props();

  const tone = $derived(setupEntryTone(status));
  const content = $derived(setupEntryContent(status, tone));
  const checklist = $derived(setupChecklistItems(status));
  const visible = $derived(tone !== 'maintenance');
</script>

{#if visible}
  <section id="setup-entry" class={`setup-entry is-${tone}`}>
    <p id="setup-entry-eyebrow" class="setup-entry-eyebrow">{content.eyebrow}</p>
    <p id="setup-entry-copy" class="setup-entry-copy">{content.copy}</p>
    {#if checklist.length > 0}
      <ul id="setup-entry-checklist" class="checklist checklist--setup">
        {#each checklist as item (item.label)}
          <li class={item.done ? 'is-done' : item.muted ? 'is-muted' : 'is-open'}>
            <span class="checklist-mark">{item.done ? '✓' : '○'}</span>
            <span>{item.label}</span>
          </li>
        {/each}
      </ul>
    {/if}
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
  </section>
{/if}
