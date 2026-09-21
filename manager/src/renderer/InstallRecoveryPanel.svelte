<script lang="ts">
  import type { WizardController, WizardControllerState } from './wizard-controller.js';
  import { restoreInspectSummaryLines } from './restore-wizard-flow.js';
  let { snapshot, controller }: { snapshot: WizardControllerState; controller: WizardController } = $props();
  const operation = $derived(snapshot.operation);
  const preview = $derived(snapshot.recoveryPreview);
  const lines = $derived(preview?.backup ? restoreInspectSummaryLines(preview.backup) : []);
</script>

<section class="panel-section">
  {#if snapshot.recoveryPhase === 'choose'}
    <h2>{snapshot.status?.installation.kind === 'fresh' ? 'Praxis Flow installieren' : 'Praxis Flow neu installieren'}</h2>
    <p>Wählen Sie ein Software-Paket. Optional übernehmen Sie danach die Einstellungen einer automatischen Sicherung.</p>
    <label for="recovery-backup">Sicherung übernehmen</label>
    <select id="recovery-backup" value={snapshot.backupCandidateId} disabled={snapshot.busy} onchange={(event) => controller.selectRecoveryBackup(event.currentTarget.value)}>
      <option value="">Ohne Backup neu einrichten</option>
      {#each snapshot.recoveryCandidates as candidate (candidate.id)}
        <option value={candidate.id}>{new Date(candidate.createdAt).toLocaleString('de-DE')}{candidate.containsTls ? ' · mit HTTPS' : ''}</option>
      {/each}
    </select>
    {#if snapshot.recoveryCandidates.length === 0}<p class="hint">Keine nutzbare automatische Sicherung gefunden. Ein externes Backup kann nach der Einrichtung unter Wartung eingespielt werden.</p>{/if}
    <button type="button" disabled={snapshot.busy || snapshot.status?.installation.kind === 'docker-unavailable'} onclick={() => void controller.prepareRecovery()}>Software-Paket wählen und prüfen</button>
  {:else if snapshot.recoveryPhase === 'prepared'}
    <h2>Installation vorbereitet</h2>
    <p>Software-Version {operation?.releaseVersion}. {operation?.backupContainsTls === null ? 'Ohne Backup.' : operation?.backupContainsTls ? 'Sicherung mit HTTPS ausgewählt.' : 'Sicherung ohne HTTPS ausgewählt.'}</p>
    <p>Die bestehende Installation wurde noch nicht verändert.</p>
    <button type="button" disabled={snapshot.busy} onclick={() => controller.commitRecovery()}>{operation?.mode === 'replace' ? 'Neu installieren …' : 'Installation beginnen'}</button>
    <button type="button" class="btn-secondary" disabled={snapshot.busy} onclick={() => void controller.abortRecovery()}>Vorbereitung abbrechen</button>
  {:else if snapshot.recoveryPhase === 'restart'}
    <h2>Installation erneut starten</h2>
    <p>Die begonnene Einrichtung ist nicht eindeutig gesund. Mit dem bereits geprüften Paket können Sie sie sauber neu starten. Automatische Backups bleiben erhalten.</p>
    <button type="button" disabled={snapshot.busy} onclick={() => controller.commitRecovery()}>Neuinstallation erneut starten …</button>
  {:else if snapshot.recoveryPhase === 'finish'}
    <h2>Einrichtung abschließen</h2>
    {#if preview?.baselineReady}
      {#if operation?.backupContainsTls !== null}
        <p>Die frische Installation ist bereit. Prüfen Sie die Sicherung vor der Übernahme.</p>
        <ul>{#each lines as line (line)}<li>{line}</li>{/each}</ul>
        {#each preview?.backup?.compatibility.warnings ?? [] as warning, index (index)}<p class="hint">{warning}</p>{/each}
        {#each preview?.backup?.errors ?? [] as error, index (index)}<p class="error">{error}</p>{/each}
        <p class="hint">Die Sicherung ist unverschlüsselt und kann API-Schlüssel und private HTTPS-Schlüssel enthalten.</p>
        <button type="button" disabled={snapshot.busy || !preview?.restoreCompatible || preview?.backup?.currentTlsClaimsHttps} onclick={() => void controller.finishRecovery('restore')}>Sicherung übernehmen und abschließen</button>
      {/if}
      <button type="button" class="btn-secondary" disabled={snapshot.busy} onclick={() => void controller.finishRecovery('without-backup')}>{operation?.backupContainsTls === null ? 'Einrichtung abschließen' : 'Ohne weitere Backup-Übernahme abschließen'}</button>
    {:else}
      <p>Der Stack ist noch nicht gesund. Prüfen Sie die Einrichtung oder starten Sie die Neuinstallation erneut.</p>
    {/if}
    <button type="button" class="btn-link" disabled={snapshot.busy} onclick={() => controller.commitRecovery()}>Neuinstallation erneut starten …</button>
  {/if}
  {#if snapshot.busy}<p role="status">Bitte warten …</p>{/if}
  <button type="button" class="btn-link" disabled={snapshot.busy} onclick={() => controller.cancel()}>Zum Status</button>
</section>
