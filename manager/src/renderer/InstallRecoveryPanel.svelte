<script lang="ts">
  import { wizardError, wizardIsBusy } from './wizard-controller.js';

  import type { WizardController, WizardControllerState } from './wizard-controller.js';
  import { restoreInspectSummaryLines } from './restore-wizard-flow.js';

  let { snapshot, controller }: {
    snapshot: WizardControllerState;
    controller: WizardController;
  } = $props();
  const operation = $derived(snapshot.operation);
  const preview = $derived(snapshot.recoveryPreview);
  const lines = $derived(preview?.backup ? restoreInspectSummaryLines(preview.backup) : []);
  const hasBackup = $derived(operation?.backupContainsTls != null);
</script>

<section class="wizard-panel recovery-panel" aria-busy={wizardIsBusy(snapshot)}>
  {#if snapshot.recoveryPhase === 'choose'}
    <h2>{snapshot.status?.installation?.kind === 'fresh' ? 'Praxis Flow installieren' : 'Praxis Flow neu installieren'}</h2>
    <p>Wählen Sie ein Software-Paket. Optional übernehmen Sie danach die Einstellungen aus einem automatischen Backup.</p>
    <div class="recovery-backup-field">
      <label for="recovery-backup">Backup wiederherstellen (optional)</label>
      <select class="wizard-input" id="recovery-backup" value={snapshot.backupCandidateId}
        disabled={wizardIsBusy(snapshot)} onchange={(event) => controller.selectRecoveryBackup(event.currentTarget.value)}>
        <option value="">Ohne Backup neu einrichten</option>
        {#each snapshot.recoveryCandidates as candidate (candidate.id)}
          <option value={candidate.id}>{new Date(candidate.createdAt).toLocaleString('de-DE')}{candidate.containsTls ? ' · mit HTTPS' : ''}</option>
        {/each}
      </select>
    </div>
    {#if snapshot.recoveryCandidates.length === 0}
      <p class="hint">Kein nutzbares automatisches Backup gefunden. Ein externes Backup kann nach der Einrichtung unter Wartung eingespielt werden.</p>
    {/if}
  {:else if snapshot.recoveryPhase === 'prepared'}
    <h2>Installation vorbereitet</h2>
    <p>Software-Version {operation?.releaseVersion}. {hasBackup ? operation?.backupContainsTls ? 'Backup mit HTTPS ausgewählt.' : 'Backup ohne HTTPS ausgewählt.' : 'Ohne Backup.'}</p>
  {:else if snapshot.recoveryPhase === 'restart'}
    <h2>Installation prüfen</h2>
    <p>Prüfen Sie den aktuellen Status, bevor Sie die Installation erneut starten.</p>
  {:else if snapshot.recoveryPhase === 'finish'}
    <h2>Einrichtung abschließen</h2>
    {#if preview?.baselineReady}
      <p>App und Sandbox sind bereit.{hasBackup ? ' Prüfen Sie das Backup vor dem Wiederherstellen.' : ' Sie können die Einrichtung jetzt abschließen.'}</p>
      {#if hasBackup}
        <ul class="recovery-details">{#each lines as line (line)}<li>{line}</li>{/each}</ul>
        {#each preview?.backup?.compatibility.warnings ?? [] as warning, index (index)}
          <p class="hint">{warning}</p>
        {/each}
        {#each preview?.backup?.errors ?? [] as error, index (index)}
          <p class="error">{error}</p>
        {/each}
      {/if}
    {:else}
      <div class="notice is-warn" role="status">
        <p>Die Abschlussprüfung ist noch nicht erfolgreich.</p>
        {#each preview?.baselineErrors ?? [] as error, index (index)}
          <p>{error}</p>
        {/each}
      </div>
      <p class="hint">Direkt nach dem Start kann dies einen Moment dauern. Warten Sie kurz und prüfen Sie den Status erneut. Weitere Details finden Sie auf der Statusseite.</p>
    {/if}
  {/if}

  {#if wizardIsBusy(snapshot)}<p class="wizard-progress is-active" role="status"><span class="spinner" aria-hidden="true"></span>Bitte warten …</p>{/if}

  <footer class="actions-row actions-row--footer">
    {#if snapshot.recoveryPhase === 'choose'}
      <button type="button" disabled={wizardIsBusy(snapshot) || snapshot.status?.installation?.kind === 'docker-unavailable'} onclick={() => void controller.prepareRecovery()}>Software-Paket wählen und prüfen</button>
    {:else if snapshot.recoveryPhase === 'prepared'}
      <button type="button" disabled={wizardIsBusy(snapshot)} onclick={() => controller.commitRecovery()}>{operation?.mode === 'replace' ? 'Neu installieren …' : 'Installation beginnen'}</button>
      <button type="button" class="btn-secondary" disabled={wizardIsBusy(snapshot)} onclick={() => void controller.abortRecovery()}>Vorbereitung abbrechen</button>
    {:else if snapshot.recoveryPhase === 'finish' || snapshot.recoveryPhase === 'restart'}
      {#if preview?.baselineReady}
        {#if hasBackup}
          <button type="button" disabled={wizardIsBusy(snapshot) || !preview.restoreCompatible || preview.backup?.currentTlsClaimsHttps} onclick={() => void controller.finishRecovery('restore')}>Backup wiederherstellen und abschließen</button>
        {/if}
        <button type="button" class:btn-secondary={hasBackup} disabled={wizardIsBusy(snapshot)} onclick={() => void controller.finishRecovery('without-backup')}>{hasBackup ? 'Ohne weitere Backup-Übernahme abschließen' : 'Einrichtung abschließen'}</button>
      {:else}
        <button type="button" disabled={wizardIsBusy(snapshot)} onclick={() => void controller.refreshRecovery()}>Status erneut prüfen</button>
      {/if}
    {/if}
    {#if !preview?.baselineReady && (snapshot.recoveryPhase === 'finish' || snapshot.recoveryPhase === 'restart' || wizardError(snapshot))}
      <button type="button" class="btn-secondary" disabled={wizardIsBusy(snapshot)} onclick={() => controller.cancel()}>Zum Status</button>
    {/if}
  </footer>
  {#if snapshot.recoveryPhase === 'restart' || (snapshot.recoveryPhase === 'finish' && preview && !preview.baselineReady)}
    <details class="recovery-restart">
      <summary>Neuinstallation erneut starten</summary>
      <p>Das geprüfte Software-Paket wird erneut installiert. Dabei werden die bisher angelegten Laufzeitdaten gelöscht.</p>
      <button type="button" class="btn-secondary" disabled={wizardIsBusy(snapshot)} onclick={() => controller.commitRecovery()}>Neuinstallation erneut starten …</button>
    </details>
  {/if}
</section>

<style>
  .recovery-panel {
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }
  .recovery-backup-field { margin: 1rem 0; }
  .recovery-details { padding-left: 1.25rem; }
  .recovery-restart { margin-top: 1.25rem; color: var(--muted); font-size: 0.92rem; }
  .recovery-restart summary { cursor: pointer; margin-bottom: 0.75rem; }
</style>
