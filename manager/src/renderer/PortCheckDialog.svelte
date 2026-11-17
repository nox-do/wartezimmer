<script lang="ts">
  import { onMount } from 'svelte';
  import screenshot from './docker-portfreigabe-macos.jpg';
  import {
    portGuide, portText, loadPortHistory, closePortGuide, retryPortGuide, acknowledgePortErrors,
  } from './port-check-guide.svelte.js';

  let dialog = $state<HTMLDialogElement | null>(null);
  let feedback = $state('');
  const failure = $derived(portGuide.report?.error ?? (!portGuide.action ? portGuide.history.at(-1)?.error : null));
  const statuses = {
    pending: 'Noch nicht bestätigt',
    checking: 'Wird geprüft …',
    verified: 'Mit Docker geprüft',
    owned: 'Wird vom Wartezimmer verwendet. Erneute Bindung beim Wechsel prüfbar.',
    failed: 'Prüfung fehlgeschlagen',
  };

  onMount(() => { void loadPortHistory(); });
  $effect(() => {
    if (portGuide.open && dialog && !dialog.open) {
      feedback = '';
      dialog.showModal();
    } else if (!portGuide.open && dialog?.open) {
      dialog.close();
    }
  });

  async function openDockerGuide() {
    feedback = '';
    try {
      await window.wartezimmerManager.openExternalUrl('https://docs.docker.com/desktop/setup/install/mac-permission-requirements/#binding-privileged-ports');
    } catch {
      feedback = 'Die Docker-Anleitung konnte nicht im Browser geöffnet werden. Folgen Sie den Schritten in diesem Dialog.';
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(portGuide.history.map(portText).join('\n\n'));
      feedback = 'Details kopiert.';
    } catch {
      feedback = 'Bitte markieren und kopieren Sie die Details unten.';
    }
  }
  async function acknowledge() {
    try {
      await acknowledgePortErrors();
      if (!portGuide.action) closePortGuide();
    } catch {
      feedback = 'Die Bestätigung konnte nicht gespeichert werden. Bitte erneut versuchen.';
    }
  }
</script>

<dialog bind:this={dialog} class="maintenance-dialog ports" aria-labelledby="ports-title" oncancel={(event) => event.preventDefault()}>
  <h2 id="ports-title">Portfreigaben auf diesem Rechner</h2>
  {#if portGuide.checking}
    <p role="status"><span class="spinner" aria-hidden="true"></span> Docker prüft die geplanten Netzwerkzugänge. Bitte warten …</p>
  {:else if failure}
    <p class="error" role="alert">{failure.message}</p>
    {#if portGuide.action}<p>Der Vorgang wartet. Ihre Auswahl bleibt erhalten.</p>{/if}
  {:else if portGuide.report}
    <p role="status">Die Portprüfung ist abgeschlossen. Sie können den Vorgang jetzt starten.</p>
  {/if}

  {#if failure?.kind === 'mac-permission'}
    <ol>
      <li>Klicken Sie auf das Docker-Symbol in der macOS-Menüleiste und wählen Sie <strong>Settings</strong>. Suchen Sie nach „privileged port forwarding“ oder öffnen Sie <strong>Advanced</strong>.</li>
      <li>Schalten Sie <strong>Allow privileged port forwarding to external machines</strong> ein. Falls Docker <strong>Apply</strong> anzeigt, übernehmen Sie die Änderung.</li>
      <li>Kehren Sie zum Wartezimmer Manager zurück.
        {#if portGuide.action}Wählen Sie <strong>Erneut prüfen</strong>.
        {:else}Öffnen Sie den gewünschten Vorgang erneut.{/if}
      </li>
    </ol>
    <figure>
      <img src={screenshot} alt="Docker Desktop für Mac. Der Schalter rechts neben Allow privileged port forwarding to external machines ist ausgeschaltet."/>
      <figcaption>Docker Desktop 4.99 für Mac · Diesen Schalter einschalten</figcaption>
    </figure>
    <p class="hint">Die Freigabe gilt auch für andere Container auf diesem Mac und benötigt kein Administratorpasswort. Falls Docker einen Neustart verlangt, werden laufende Container vorübergehend unterbrochen.</p>
    <div class="actions-row">
      <button class="btn-secondary" onclick={openDockerGuide}>Docker-Anleitung öffnen</button>
    </div>
  {/if}

  {#if portGuide.report?.rows.length}
    <ul class="checks">
      {#each portGuide.report.rows as row ([row.label, row.hostIp, row.publishedPort, row.protocol].join('/'))}
        <li>
          <strong>{row.label}</strong> <code>{row.hostIp}:{row.publishedPort}/{row.protocol}</code>
          <span>{statuses[row.state]}</span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if portGuide.history.length}
    <details>
      <summary>Technische Details ({portGuide.history.length})</summary>
      {#each portGuide.history as report (report.id)}<pre>{portText(report)}</pre>{/each}
      <button class="btn-secondary" onclick={copy}>Details kopieren</button>
    </details>
  {/if}
  {#if feedback}<p role="status">{feedback}</p>{/if}
  <footer class="actions-row">
    {#if portGuide.action}
      {#if failure}
        <button disabled={portGuide.checking} onclick={retryPortGuide}>Erneut prüfen</button>
      {:else}
        <button disabled={portGuide.checking || !portGuide.report} onclick={() => closePortGuide(true)}>{portGuide.action}</button>
      {/if}
      <button class="btn-secondary" disabled={portGuide.checking} onclick={() => closePortGuide()}>Zurück</button>
    {:else}
      <button class="btn-secondary" onclick={() => closePortGuide()}>Später ansehen</button>
    {/if}
    {#if portGuide.history.length}
      <button class="btn-secondary" disabled={portGuide.checking} onclick={acknowledge}>Fehler als gelesen bestätigen</button>
    {/if}
  </footer>
</dialog>

<style>
  .ports { width: min(44rem, 90vw); max-height: 85vh; overflow: auto; }
  .checks { padding: 0; list-style: none; }
  .checks li { padding: .45rem 0; border-bottom: 1px solid var(--border); }
  .checks span { display: block; }
  .checks span, figcaption { color: var(--muted); font-size: .9em; }
  ol { padding-left: 1.5rem; }
  ol li { margin: .5rem 0; }
  figure { margin: .8rem 0; }
  figure img { width: 100%; height: auto; border: 1px solid var(--border); border-radius: 4px; }
  details, footer { margin-top: 1rem; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
