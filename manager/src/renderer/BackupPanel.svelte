<script lang="ts">
  import IconButton from './IconButton.svelte';
  import { backupInfoText } from './maintenance-view-model.js';

  let {
    latestBackupPath,
    envExists,
    backupStatusText = '',
    pinResetStatusText = '',
    locked = false,
    backupError = null,
    pinError = null,
    tlsEnabled = false,
    onBackup,
    onRestore,
    onPinReset,
  }: {
    latestBackupPath: string | null;
    envExists: boolean | undefined;
    backupStatusText?: string;
    pinResetStatusText?: string;
    locked?: boolean;
    backupError?: string | null;
    pinError?: string | null;
    tlsEnabled?: boolean;
    onBackup: () => void;
    onRestore: () => void;
    onPinReset: () => void;
  } = $props();
</script>

<div class="panel-section">
  <div class="panel-section-heading">
    <h2>Praxis-Backup (.pfbackup)</h2>
    <IconButton
      icon="info"
      class="btn-icon-muted info-tip-trigger"
      ariaLabel="Hilfe zum Praxis-Backup"
      describedBy="maintenance-backup-tip"
    />
    <div id="maintenance-backup-tip" class="info-tip-panel" role="tooltip">
      <p>
        Sichert Settings aus der App-Datenbank, die Stack-<code>.env</code> und den
        Manager-Release-Stand (<code>manager-state.json</code>) in einer
        <code>.pfbackup</code>-Datei mit Prüfsummen.
      </p>
      <p>
        Patientendaten und laufende Warteschlange werden nicht mitgesichert. Mit
        „Wiederherstellen“ importieren Sie Settings aus einer <code>.pfbackup</code>-Datei in eine
        frische Datenbank (Stack kurz offline).
      </p>
      <p>
        Zusätzlich liegt immer eine Kopie im Installationsordner unter
        <code>backups/</code> (auch wenn der Speichern-Dialog abgebrochen wird).
      </p>
    </div>
  </div>
  <p class="hint">
    Praxis Flow schreibt das Backup außerdem in den Installationsordner
    (<code>backups/</code>). Der Speichern-Dialog ist eine Kopie davon.
  </p>
  <p class="maintenance-backup-status">{backupInfoText(latestBackupPath, envExists)}</p>
  {#if backupStatusText}
    <p class="maintenance-backup-status">{backupStatusText}</p>
  {/if}
  <p class="hint">
    Diese Sicherung ist nicht verschlüsselt. API-Schlüssel für SMS und WhatsApp werden im
    Klartext mitgesichert. Bei HTTPS kann sie private Schlüssel enthalten. Bewahren Sie die
    Datei geschützt auf, möglichst auf einem verschlüsselten Datenträger, und geben Sie sie
    nicht ungeschützt weiter.
  </p>
  <div class="maintenance-backup-actions">
    <button type="button" class="btn-secondary" disabled={locked} onclick={onBackup}>
      Backup erstellen
    </button>
    <button type="button" class="btn-secondary" disabled={locked} onclick={onRestore}>
      Wiederherstellen …
    </button>
  </div>
  {#if backupError}
    <p class="error">{backupError}</p>
  {/if}
</div>

{#if tlsEnabled}
  <div class="panel-section">
    <h2>HTTPS-Zertifikat</h2>
    <p class="hint">
      Zertifikat und HTTPS-Einrichtung sind in der .pfbackup enthalten, sobald HTTPS vorbereitet
      ist. Eine Datei genügt.
    </p>
  </div>
{/if}

<div class="panel-section">
  <h2>Staff-PINs (MFA &amp; Ops)</h2>
  <p class="hint">
    Setzt MFA- und Ops-PIN auf den Default <strong>0000</strong> zurück (nur Datenbank).
    Raum-Panel-PIN bleibt unverändert. Stack wird gestoppt, PINs zurückgesetzt und neu gestartet.
    Danach MFA-PIN in MFA → Betrieb, Ops-PIN in System → PIN &amp; Sicherheit vergeben.
  </p>
  {#if pinResetStatusText}
    <p class="maintenance-backup-status">{pinResetStatusText}</p>
  {/if}
  {#if pinError}
    <p class="error">{pinError}</p>
  {/if}
  <button type="button" class="btn-secondary" disabled={locked} onclick={onPinReset}>
    MFA- &amp; Ops-PIN auf 0000 zurücksetzen
  </button>
</div>

<style>
  .maintenance-backup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
</style>
